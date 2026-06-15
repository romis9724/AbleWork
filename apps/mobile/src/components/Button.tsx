import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native'
import { colors, radius, fontSize, spacing } from '@/lib/theme'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: 'primary' | 'outline'
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const isOutline = variant === 'outline'
  const isDisabled = disabled || loading
  return (
    <TouchableOpacity
      style={[
        styles.base,
        isOutline ? styles.outline : styles.primary,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.brand : colors.white} />
      ) : (
        <Text style={[styles.label, isOutline ? styles.labelOutline : styles.labelPrimary]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.brand },
  outline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.brand },
  disabled: { opacity: 0.55 },
  label: { fontSize: fontSize.base, fontWeight: '700' },
  labelPrimary: { color: colors.white },
  labelOutline: { color: colors.brand },
})
