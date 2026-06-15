import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { isAdminLevel } from '@ablework/shared-constants'
import { useAuthStore } from '@/stores/auth'
import { colors } from '@/lib/theme'

export default function TabLayout() {
  const accessLevel = useAuthStore((s) => s.user?.accessLevel)
  const showManage = isAdminLevel(accessLevel)

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        headerStyle: { backgroundColor: colors.brand },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: '출퇴근',
          tabBarIcon: ({ color }) => <Ionicons name="time" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leaves"
        options={{
          title: '휴가',
          tabBarIcon: ({ color }) => <Ionicons name="calendar" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: '요청',
          tabBarIcon: ({ color }) => <Ionicons name="document-text" size={24} color={color} />,
        }}
      />
      {/* 관리 탭 — ORG_ADMIN 이상만 노출 (EMPLOYEE 는 href: null 로 숨김) */}
      <Tabs.Screen
        name="manage"
        options={{
          title: '관리',
          href: showManage ? undefined : null,
          tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
        }}
      />
    </Tabs>
  )
}
