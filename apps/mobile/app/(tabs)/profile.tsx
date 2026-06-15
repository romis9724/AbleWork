import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ROLE_LABELS_KO } from '@ablework/shared-constants'
import { authApi, employeeApi } from '@/lib/api'
import { getApiErrorMessage } from '@/lib/api-client'
import type { Employee } from '@/lib/api-types'
import { useAuthStore } from '@/stores/auth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/States'
import { EMPLOYMENT_LABEL, shortDate } from '@/lib/labels'
import { colors, spacing, radius, fontSize } from '@/lib/theme'

export default function ProfileScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setName = useAuthStore((s) => s.setName)

  const employeeId = user?.employeeId ?? ''
  const fetcher = useCallback(() => employeeApi.get(employeeId), [employeeId])
  const { data: employee, isLoading, isRefreshing, refresh } = useAsyncData<Employee>(fetcher)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)

  // 조회된 이름을 스토어에도 반영 (헤더/표시용)
  useEffect(() => {
    if (employee?.name) setName(employee.name)
  }, [employee?.name, setName])

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('알림', '모든 비밀번호 항목을 입력해 주세요.')
      return
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('알림', '새 비밀번호가 일치하지 않습니다.')
      return
    }
    if (newPassword.length < 8) {
      Alert.alert('알림', '새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    setChanging(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword, confirmPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      Alert.alert('완료', '비밀번호가 변경됐습니다.')
    } catch (err) {
      Alert.alert('오류', getApiErrorMessage(err, '비밀번호 변경 중 오류가 발생했습니다.'))
    } finally {
      setChanging(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await logout()
          router.replace('/login')
        },
      },
    ])
  }

  if (isLoading) return <LoadingState />

  const primaryOrg =
    employee?.organizations?.find((o) => o.isPrimary)?.organization ??
    employee?.organizations?.[0]?.organization
  const positionNames = employee?.positions?.map((p) => p.position.name).join(', ')
  const roleLabel = user ? ROLE_LABELS_KO[user.accessLevel] : '—'

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.brand} />
      }
    >
      {/* 프로필 헤더 */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(employee?.name ?? '?').slice(0, 1)}</Text>
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{employee?.name ?? '—'}</Text>
          <Text style={styles.heroSub}>
            {primaryOrg?.name ?? '—'}
            {positionNames ? ` · ${positionNames}` : ''}
          </Text>
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{roleLabel}</Text>
          </View>
        </View>
      </View>

      {/* 근로 정보 (읽기 전용) */}
      <View style={styles.block}>
        <Text style={styles.blockHead}>근로 정보</Text>
        <InfoRow label="사번" value={employee?.employeeNumber ?? '—'} />
        <InfoRow label="이메일" value={employee?.user?.email ?? '—'} />
        <InfoRow
          label="고용 형태"
          value={
            employee ? EMPLOYMENT_LABEL[employee.employmentType] ?? employee.employmentType : '—'
          }
        />
        <InfoRow label="권한" value={roleLabel} />
        <InfoRow label="입사일" value={shortDate(employee?.joinedAt)} last />
      </View>

      {/* 비밀번호 변경 */}
      <View style={styles.block}>
        <Text style={styles.blockHead}>비밀번호 변경</Text>
        <Field
          label="현재 비밀번호"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoComplete="current-password"
        />
        <Field
          label="새 비밀번호 (8자 이상)"
          value={newPassword}
          onChangeText={setNewPassword}
          autoComplete="new-password"
        />
        <Field
          label="새 비밀번호 확인"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoComplete="new-password"
        />
        <Button
          label="비밀번호 변경"
          variant="outline"
          onPress={handleChangePassword}
          loading={changing}
          style={styles.blockBtn}
        />
      </View>

      <Button label="로그아웃" variant="outline" onPress={handleLogout} style={styles.logout} />
    </ScrollView>
  )
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoKey}>{label}</Text>
      <Text style={styles.infoVal}>{value}</Text>
    </View>
  )
}

function Field({
  label,
  value,
  onChangeText,
  autoComplete,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={autoComplete}
        textContentType={autoComplete === 'current-password' ? 'password' : 'newPassword'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontSize: fontSize.xl, fontWeight: '800' },
  heroInfo: { flex: 1, gap: spacing.xs },
  heroName: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  heroSub: { fontSize: fontSize.sm, color: colors.textSub },
  roleChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: spacing.xs,
  },
  roleChipText: { fontSize: fontSize.xs, fontWeight: '700', color: colors.brand },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  blockHead: { fontSize: fontSize.base, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoKey: { fontSize: fontSize.sm, color: colors.textSub },
  infoVal: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, flexShrink: 1, textAlign: 'right' },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fontSize.sm, color: colors.textSub, marginBottom: spacing.sm, fontWeight: '600' },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
    color: colors.text,
  },
  blockBtn: { marginTop: spacing.xs },
  logout: { marginTop: spacing.xs },
})
