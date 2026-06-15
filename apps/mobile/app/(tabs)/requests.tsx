import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, Alert, TouchableOpacity } from 'react-native'
import { requestApi, unwrapList } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-client'
import type { RequestItem } from '@/lib/api-types'
import { useAuthStore } from '@/stores/auth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { Badge } from '@/components/Badge'
import { LoadingState, EmptyState } from '@/components/States'
import { requestStatusBadge, requestTypeLabel, shortDate } from '@/lib/labels'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

export default function RequestsScreen() {
  const employeeId = useAuthStore((s) => s.user?.employeeId) ?? ''
  const fetcher = useCallback(() => requestApi.list(), [])
  const { data, isLoading, isRefreshing, error, refresh, reload } = useAsyncData(fetcher)
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const requests = unwrapList<RequestItem>(data)

  // 내가 올린 PENDING 요청만 취소 가능 (requesterId 미제공 시 본인 목록으로 간주)
  const isCancellable = (r: RequestItem): boolean =>
    r.status === 'PENDING' && (!r.requesterId || r.requesterId === employeeId)

  const confirmCancel = (req: RequestItem) => {
    Alert.alert('신청 취소', '이 요청을 취소하시겠어요? 취소한 요청은 되돌릴 수 없습니다.', [
      { text: '닫기', style: 'cancel' },
      { text: '신청 취소', style: 'destructive', onPress: () => doCancel(req.id) },
    ])
  }

  const doCancel = async (id: string) => {
    setCancelingId(id)
    try {
      await requestApi.cancel(id)
      await reload()
    } catch (err) {
      Alert.alert('오류', getApiErrorMessage(err, '취소 중 오류가 발생했습니다.'))
    } finally {
      setCancelingId(null)
    }
  }

  if (isLoading) return <LoadingState />

  return (
    <View style={styles.screen}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.count}>
            총 <Text style={styles.countNum}>{requests.length}</Text>건
          </Text>
        }
        ListEmptyComponent={<EmptyState message={error ?? '요청 내역이 없습니다'} />}
        renderItem={({ item }) => {
          const badge = requestStatusBadge(item.status)
          return (
            <View style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={styles.rowType}>{requestTypeLabel(item.type)}</Text>
                <Badge label={badge.label} tone={badge.tone} />
              </View>
              <View style={styles.rowFoot}>
                <Text style={styles.rowDate}>{shortDate(item.createdAt)}</Text>
                {isCancellable(item) && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => confirmCancel(item)}
                    disabled={cancelingId === item.id}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelText}>
                      {cancelingId === item.id ? '취소 중…' : '신청 취소'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )
        }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.brand} />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, gap: spacing.md },
  count: { fontSize: fontSize.sm, color: colors.textSub, marginBottom: spacing.xs },
  countNum: { fontWeight: '800', color: colors.text },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowType: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  rowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowDate: { fontSize: fontSize.sm, color: colors.textMuted },
  cancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  cancelText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.brand },
})
