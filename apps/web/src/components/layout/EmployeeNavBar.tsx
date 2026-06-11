'use client'
import { useRouter, usePathname } from 'next/navigation'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Paper from '@mui/material/Paper'
import HomeIcon from '@mui/icons-material/Home'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import AssignmentIcon from '@mui/icons-material/Assignment'
import PersonIcon from '@mui/icons-material/Person'

const NAV_ITEMS = [
  { label: '홈', icon: <HomeIcon />, path: '/me/home' },
  { label: '출퇴근', icon: <AccessTimeIcon />, path: '/me/attendances' },
  { label: '휴가', icon: <BeachAccessIcon />, path: '/me/leaves' },
  { label: '요청', icon: <AssignmentIcon />, path: '/me/requests' },
  { label: '프로필', icon: <PersonIcon />, path: '/me/profile' },
]

export default function EmployeeNavBar() {
  const router = useRouter()
  const pathname = usePathname()

  const currentValue = NAV_ITEMS.findIndex((item) => pathname.startsWith(item.path))

  return (
    <Paper
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }}
      elevation={3}
    >
      <BottomNavigation
        value={currentValue}
        onChange={(_, newValue) => router.push(NAV_ITEMS[newValue].path)}
        showLabels
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavigationAction
            key={item.path}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </BottomNavigation>
    </Paper>
  )
}
