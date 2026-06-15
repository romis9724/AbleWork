import { useState } from 'react'
import { View, Text, StyleSheet, FlatList, RefreshControl, Alert, TouchableOpacity } from 'react-native'
import { AccessLevel, hasLevel } from '@ablework/shared-constants'
import { approvalApi, attendanceApi } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-client'
import type { DocumentListItem, NowAtWorkResponse } from '@/lib/api-types'
import { useAuthStore } from '@/stores/auth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { LoadingState, EmptyState } from '@/components/States'
import { docStatusBadge, shortDate } from '@/lib/labels'
import { Badge } from '@/components/Badge'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

interface ManageData {
  pending: DocumentListItem[]
  atWork: NowAtWorkResponse
}

const APPROVABLE_ROLES = new Set(['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR'])

async function fetchManage(): Promise<ManageData> {
  const [pendingRes, atWork] = await Promise.all([
    approvalApi.pendingInbox(1, 50),
    attendanceApi.nowAtWork(),
  ])
  return { pending: pendingRes.items, atWork }
}

/** 내가 지금 처리해야 하는 PENDING 결재 단계 (승인/협조/부서협조) */
function myActionableStep(doc: DocumentListItem): { id: string; role: string } | null {
  const step = doc.mySteps?.find((s) => s.status === 'PENDING' && APPROVABLE_ROLES.has(s.role))
  return step ? { id: step.id, role: step.role } : null
}

export default function ManageScreen() {
  const accessLevel = useAuthStore((s) => s.user?.accessLevel)
  const canAct = hasLevel(accessLevel, AccessLevel.ORG_ADMIN)

  const { data, isLoading, isRefreshing, error, refresh, reload } = useAsyncData(fetchManage)
  const [actingId, setActingId] = useState<string | null>(null)

  const runAction = async (
    action: 'approve' | 'reject',
    doc: DocumentListItem,
    stepId: string,
  ) => {
    setActingId(doc.id)
    try {
      if (action === 'approve') await approvalApi.approveStep(doc.id, stepId)
      else await approvalApi.rejectStep(doc.id, stepId)
      await reload()
    } catch (err) {
      Alert.alert('오류', getApiErrorMessage(err, '결재 처리 중 오류가 발생했습니다.'))
    } finally {
      setActingId(null)
    }
  }

  const confirmAction = (action: 'approve' | 'reject', doc: DocumentListItem, stepId: string) => {
    const verb = action === 'approve' ? '승인' : '반려'
    Alert.alert(`결재 ${verb}`, `"${doc.title}" 문서를 ${verb}하시겠어요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: verb,
        style: action === 'reject' ? 'destructive' : 'default',
        onPress: () => runAction(action, doc, stepId),
      },
    ])
  }

  if (isLoading) return <LoadingState />

  const pending = data?.pending ?? []
  const atWorkTotal = data?.atWork.total ?? 0

  return (
    <View style={styles.screen}>
      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            {/* 팀 출퇴근 현황 요약 */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>현재 근무 중</Text>
              <Text style={styles.summaryValue}>
                {atWorkTotal}
                <Text style={styles.summaryUnit}> 명</Text>
              </Text>
            </View>

            <Text style={styles.sectionTitle}>
              결재 대기 <Text style={styles.sectionCount}>{pending.length}</Text>건
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState message={error ?? '결재 대기 중인 문서가 없습니다'} />}
        renderItem={({ item }) => {
          const badge = docStatusBadge(item.status)
          const step = myActionableStep(item)
          const isBusy = actingId === item.id
          return (
            <View style={styles.docCard}>
              <View style={styles.docHead}>
                <Text style={styles.docTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Badge label={badge.label} tone={badge.tone} />
              </View>
              <Text style={styles.docMeta}>
                {item.form?.name ?? '—'}
                {item.drafter?.name ? ` · ${item.drafter.name}` : ''}
                {item.submittedAt ? ` · ${shortDate(item.submittedAt)}` : ''}
              </Text>

              {canAct && step && (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.rejectBtn]}
                    disabled={isBusy}
                    onPress={() => confirmAction('reject', item, step.id)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.rejectText}>반려</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.approveBtn]}
                    disabled={isBusy}
                    onPress={() => confirmAction('approve', item, step.id)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.approveText}>{isBusy ? '처리 중…' : '승인'}</Text>
                  </TouchableOpacity>
                </View>
              )}
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
  headerWrap: { gap: spacing.lg, marginBottom: spacing.xs },
  summaryCard: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  summaryLabel: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  summaryValue: { fontSize: fontSize.hero, fontWeight: '800', color: colors.brand },
  summaryUnit: { fontSize: fontSize.base, fontWeight: '600' },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  sectionCount: { color: colors.brand },
  docCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  docHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  docTitle: { flex: 1, fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  docMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: { backgroundColor: colors.brand },
  approveText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  rejectBtn: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.danger },
  rejectText: { color: colors.danger, fontWeight: '700', fontSize: fontSize.sm },
})
