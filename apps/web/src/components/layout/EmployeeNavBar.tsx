'use client'
import { useRouter, usePathname } from 'next/navigation'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Paper from '@mui/material/Paper'
import HomeIcon from '@mui/icons-material/Home'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import AssignmentIcon from '@mui/icons-material/Assignment'
import ApprovalIcon from '@mui/icons-material/Approval'
import PersonIcon from '@mui/icons-material/Person'

const NAV_ITEMS = [
  { label: '홈', icon: <HomeIcon />, path: '/me/home' },
  { label: '근무일정', icon: <CalendarMonthIcon />, path: '/me/shifts' },
  { label: '휴가', icon: <BeachAccessIcon />, path: '/me/leaves' },
  { label: '요청', icon: <AssignmentIcon />, path: '/me/requests' },
  { label: '결재', icon: <ApprovalIcon />, path: '/me/documents' },
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
