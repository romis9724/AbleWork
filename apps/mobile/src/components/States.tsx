import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { colors, fontSize, spacing } from '@/lib/theme'

/** 전체 화면 중앙 로딩 표시 */
export function LoadingState({ message = '불러오는 중…' }: { message?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} size="large" />
      <Text style={styles.muted}>{message}</Text>
    </View>
  )
}

/** 목록 빈 상태 */
export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.muted}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  empty: {
    paddingVertical: spacing.xxl * 1.5,
    alignItems: 'center',
  },
  muted: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
})
