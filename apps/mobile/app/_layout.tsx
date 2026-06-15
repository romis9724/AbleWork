import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useAuthStore } from '@/stores/auth'
import { LoadingState } from '@/components/States'
import { colors } from '@/lib/theme'

export default function RootLayout() {
  const router = useRouter()
  const segments = useSegments()
  const hydrate = useAuthStore((s) => s.hydrate)
  const isHydrating = useAuthStore((s) => s.isHydrating)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  // 앱 기동 시 1회 토큰 복원
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // 인증 상태에 따른 라우팅 가드
  useEffect(() => {
    if (isHydrating) return
    const inAuthGroup = segments[0] === 'login'

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login')
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)')
    }
  }, [isHydrating, isAuthenticated, segments, router])

  if (isHydrating) {
    return (
      <View style={styles.splash}>
        <LoadingState message="AbleWork 시작 중…" />
        <StatusBar style="dark" />
      </View>
    )
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ title: '로그인' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg },
})
