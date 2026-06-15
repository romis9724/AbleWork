import { useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native'
import { leaveApi, requestApi, unwrapList } from '@/lib/api'
import type { LeaveBalance, RequestItem } from '@/lib/api-types'
import { useAuthStore } from '@/stores/auth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { Badge } from '@/components/Badge'
import { LoadingState, EmptyState } from '@/components/States'
import { requestStatusBadge, requestTypeLabel, shortDate } from '@/lib/labels'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

interface LeavesData {
  balances: LeaveBalance[]
  leaveRequests: RequestItem[]
}

const LEAVE_TYPES = new Set(['LEAVE_CREATE', 'LEAVE_MODIFY', 'LEAVE_DELETE'])

async function fetchLeaves(employeeId: string): Promise<LeavesData> {
  const [balances, requestsRaw] = await Promise.all([
    employeeId ? leaveApi.balance(employeeId) : Promise.resolve<LeaveBalance[]>([]),
    requestApi.list(),
  ])
  const leaveRequests = unwrapList<RequestItem>(requestsRaw).filter((r) => LEAVE_TYPES.has(r.type))
  return { balances, leaveRequests }
}

function gaugePercent(used: number, accrued: number): number {
  if (accrued <= 0) return 0
  return Math.min(100, Math.round((used / accrued) * 100))
}

function BalanceCard({ balance }: { balance: LeaveBalance }) {
  const pct = gaugePercent(balance.usedDays, balance.accruedDays)
  return (
    <View style={styles.balanceCard}>
      <View style={styles.balanceTop}>
        <Text style={styles.balanceName}>
          {balance.leaveType?.displayName ?? balance.leaveType?.name ?? '휴가'}
        </Text>
        <Text style={styles.balanceYear}>{balance.year}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.balanceSub}>
        잔여 <Text style={styles.balanceStrong}>{balance.remainingDays}</Text> / {balance.accruedDays}일
        {'  ·  '}사용 {balance.usedDays}일
      </Text>
    </View>
  )
}

export default function LeavesScreen() {
  const employeeId = useAuthStore((s) => s.user?.employeeId) ?? ''
  const fetcher = useCallback(() => fetchLeaves(employeeId), [employeeId])
  const { data, isLoading, isRefreshing, error, refresh } = useAsyncData(fetcher)

  if (isLoading) return <LoadingState />

  const balances = data?.balances ?? []
  const leaveRequests = data?.leaveRequests ?? []

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.brand} />
      }
    >
      <Text style={styles.sectionTitle}>휴가 잔액</Text>
      {balances.length === 0 ? (
        <EmptyState message={error ?? '휴가 잔여 정보가 없습니다'} />
      ) : (
        balances.map((b) => <BalanceCard key={b.id} balance={b} />)
      )}

      <Text style={[styles.sectionTitle, styles.sectionGap]}>휴가 신청 내역</Text>
      {leaveRequests.length === 0 ? (
        <EmptyState message="휴가 신청 내역이 없습니다" />
      ) : (
        leaveRequests.map((req) => {
          const badge = requestStatusBadge(req.status)
          return (
            <View key={req.id} style={styles.reqRow}>
              <View style={styles.reqInfo}>
                <Text style={styles.reqType}>{requestTypeLabel(req.type)}</Text>
                <Text style={styles.reqDate}>{shortDate(req.createdAt)}</Text>
              </View>
              <Badge label={badge.label} tone={badge.tone} />
            </View>
          )
        })
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.text },
  sectionGap: { marginTop: spacing.lg },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  balanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceName: { fontSize: fontSize.base, fontWeight: '700', color: colors.text },
  balanceYear: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '600' },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.neutralSoft, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brand, borderRadius: radius.pill },
  balanceSub: { fontSize: fontSize.sm, color: colors.textSub },
  balanceStrong: { fontWeight: '800', color: colors.brand },
  reqRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reqInfo: { gap: spacing.xs },
  reqType: { fontSize: fontSize.base, fontWeight: '600', color: colors.text },
  reqDate: { fontSize: fontSize.xs, color: colors.textMuted },
})
