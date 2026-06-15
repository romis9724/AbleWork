import { Text, StyleSheet } from 'react-native'
import { BADGE_TONES, type BadgeTone } from '@/lib/labels'
import { radius, fontSize } from '@/lib/theme'

interface BadgeProps {
  label: string
  tone?: BadgeTone
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const style = BADGE_TONES[tone]
  return (
    <Text style={[styles.badge, { backgroundColor: style.bg, color: style.fg }]}>{label}</Text>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
})
