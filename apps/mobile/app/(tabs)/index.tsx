import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native'
import * as Location from 'expo-location'
import { attendanceApi, leaveApi } from '@/lib/api'
import { apiClient, getApiErrorMessage } from '@/lib/api-client'
import type { MyTodayAttendance, LeaveBalance } from '@/lib/api-types'
import { useAuthStore } from '@/stores/auth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/States'
import { timeLabel } from '@/lib/labels'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

interface HomeData {
  today: MyTodayAttendance
  balances: LeaveBalance[]
}

async function fetchHome(employeeId: string): Promise<HomeData> {
  const [today, balances] = await Promise.all([
    apiClient.get('/attendances/me/today') as Promise<MyTodayAttendance>,
    employeeId ? leaveApi.balance(employeeId) : Promise.resolve<LeaveBalance[]>([]),
  ])
  return { today, balances }
}

export default function HomeScreen() {
  const employeeId = useAuthStore((s) => s.user?.employeeId) ?? ''
  const fetcher = useCallback(() => fetchHome(employeeId), [employeeId])
  const { data, isLoading, isRefreshing, refresh, reload } = useAsyncData(fetcher)
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)

  const attendance = data?.today.attendance ?? null
  const clockedIn = !!attendance && !attendance.clockOutAt
  const clockedOut = !!attendance?.clockOutAt
  const workState = clockedOut ? '퇴근 완료' : clockedIn ? '근무 중' : '출근 전'

  const balances = data?.balances ?? []
  const annual = balances.find((b) => b.leaveType?.code === 'ANNUAL') ?? balances[0]
  const totalRemain = balances.reduce((sum, b) => sum + (b.remainingDays ?? 0), 0)

  const withLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('권한 필요', '출퇴근 기록을 위해 위치 권한이 필요합니다.')
      return null
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    return { lat: loc.coords.latitude, lng: loc.coords.longitude }
  }

  const handleClock = async (type: 'in' | 'out') => {
    setBusy(type)
    try {
      const coords = await withLocation()
      if (!coords) return
      if (type === 'in') {
        await attendanceApi.clockIn(coords.lat, coords.lng)
        Alert.alert('출근 완료', '출근이 기록되었습니다.')
      } else {
        await attendanceApi.clockOut(coords.lat, coords.lng)
        Alert.alert('퇴근 완료', '퇴근이 기록되었습니다.')
      }
      await reload()
    } catch (err) {
      Alert.alert('오류', getApiErrorMessage(err, '처리 중 오류가 발생했습니다.'))
    } finally {
      setBusy(null)
    }
  }

  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  if (isLoading) return <LoadingState />

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.brand} />
      }
    >
      <Text style={styles.date}>{dateLabel}</Text>

      {/* 오늘 출퇴근 상태 카드 */}
      <View style={styles.clockCard}>
        <Text style={styles.clockState}>{workState}</Text>
        <View style={styles.clockTimes}>
          <View style={styles.timeCol}>
            <Text style={styles.timeKey}>출근</Text>
            <Text style={styles.timeVal}>{timeLabel(attendance?.clockInAt)}</Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeCol}>
            <Text style={styles.timeKey}>퇴근</Text>
            <Text style={styles.timeVal}>{timeLabel(attendance?.clockOutAt)}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {!clockedIn && !clockedOut && (
            <Button
              label="출근하기"
              onPress={() => handleClock('in')}
              loading={busy === 'in'}
              style={styles.fullBtn}
            />
          )}
          {clockedIn && (
            <Button
              label="퇴근하기"
              onPress={() => handleClock('out')}
              loading={busy === 'out'}
              style={styles.fullBtn}
            />
          )}
          {clockedOut && <Text style={styles.doneText}>오늘 근무가 마감됐습니다</Text>}
        </View>
      </View>

      {/* 휴가 잔액 KPI */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, styles.kpiAccent]}>
          <Text style={styles.kpiLabel}>
            잔여 {annual?.leaveType?.displayName ?? annual?.leaveType?.name ?? '연차'}
          </Text>
          <Text style={styles.kpiValueAccent}>
            {annual?.remainingDays ?? 0}
            <Text style={styles.kpiUnit}> 일</Text>
          </Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>전체 잔여</Text>
          <Text style={styles.kpiValue}>
            {totalRemain}
            <Text style={styles.kpiUnit}> 일</Text>
          </Text>
          <Text style={styles.kpiDesc}>{balances.length}개 휴가</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  date: { fontSize: fontSize.sm, color: colors.textSub, fontWeight: '600' },
  clockCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
  },
  clockState: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  clockTimes: { flexDirection: 'row', alignItems: 'center' },
  timeCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  timeDivider: { width: 1, height: 36, backgroundColor: colors.border },
  timeKey: { fontSize: fontSize.xs, color: colors.textMuted },
  timeVal: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  actions: { gap: spacing.md },
  fullBtn: { width: '100%' },
  doneText: { textAlign: 'center', color: colors.textSub, fontSize: fontSize.sm, paddingVertical: spacing.md },
  kpiRow: { flexDirection: 'row', gap: spacing.md },
  kpi: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  kpiAccent: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  kpiLabel: { fontSize: fontSize.xs, color: colors.textSub, fontWeight: '600' },
  kpiValue: { fontSize: fontSize.hero, fontWeight: '800', color: colors.text },
  kpiValueAccent: { fontSize: fontSize.hero, fontWeight: '800', color: colors.brand },
  kpiUnit: { fontSize: fontSize.base, fontWeight: '600' },
  kpiDesc: { fontSize: fontSize.xs, color: colors.textMuted },
})
