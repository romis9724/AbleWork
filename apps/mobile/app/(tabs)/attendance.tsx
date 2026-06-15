import { useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native'
import { attendanceApi, unwrapList } from '@/lib/api'
import type { Attendance } from '@/lib/api-types'
import { useAuthStore } from '@/stores/auth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { Badge } from '@/components/Badge'
import { LoadingState, EmptyState } from '@/components/States'
import { attendanceBadge, timeLabel, dateLabel } from '@/lib/labels'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

function monthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end = now.toISOString().slice(0, 10)
  return { start, end }
}

function durationLabel(inIso?: string | null, outIso?: string | null): string {
  if (!inIso || !outIso) return '—'
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime()
  if (ms <= 0) return '—'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}시간 ${String(m).padStart(2, '0')}분`
}

function AttendanceRow({ item }: { item: Attendance }) {
  const badge = attendanceBadge(item.status)
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowDate}>{dateLabel(item.clockInAt)}</Text>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.cell}>
          <Text style={styles.cellKey}>출근</Text>
          <Text style={styles.cellVal}>{timeLabel(item.clockInAt)}</Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.cellKey}>퇴근</Text>
          <Text style={[styles.cellVal, !item.clockOutAt && styles.cellMiss]}>
            {timeLabel(item.clockOutAt)}
          </Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.cellKey}>근무시간</Text>
          <Text style={styles.cellVal}>{durationLabel(item.clockInAt, item.clockOutAt)}</Text>
        </View>
      </View>
    </View>
  )
}

export default function AttendanceScreen() {
  const employeeId = useAuthStore((s) => s.user?.employeeId)
  const { start, end } = useMemo(monthRange, [])

  const fetcher = useCallback(
    () => attendanceApi.list({ startDate: start, endDate: end, employeeId }),
    [start, end, employeeId],
  )
  const { data, isLoading, isRefreshing, error, refresh } = useAsyncData(fetcher)
  const records = unwrapList<Attendance>(data)

  if (isLoading) return <LoadingState />

  return (
    <View style={styles.screen}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AttendanceRow item={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.count}>
            이번 달 총 <Text style={styles.countNum}>{records.length}</Text>건
          </Text>
        }
        ListEmptyComponent={
          <EmptyState message={error ?? '이번 달 출퇴근 기록이 없습니다'} />
        }
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
  rowDate: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  rowBody: { flexDirection: 'row' },
  cell: { flex: 1, gap: spacing.xs },
  cellKey: { fontSize: fontSize.xs, color: colors.textMuted },
  cellVal: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  cellMiss: { color: colors.textMuted },
})
