'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import DashboardIcon from '@mui/icons-material/Dashboard'
import PeopleIcon from '@mui/icons-material/People'
import CorporateFareIcon from '@mui/icons-material/CorporateFare'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import EventNoteIcon from '@mui/icons-material/EventNote'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import AssignmentIcon from '@mui/icons-material/Assignment'
import BarChartIcon from '@mui/icons-material/BarChart'
import MessageIcon from '@mui/icons-material/Message'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useAuthStore } from '@/stores/auth.store'

const DRAWER_WIDTH = 240

interface NavItem {
  label: string
  icon: React.ReactNode
  path?: string
  children?: { label: string; path: string }[]
}

const NAV_ITEMS: NavItem[] = [
  { label: '대시보드', icon: <DashboardIcon />, path: '/admin/dashboard' },
  {
    label: '인사/조직',
    icon: <PeopleIcon />,
    children: [
      { label: '조직 관리', path: '/admin/organizations' },
      { label: '직원 목록', path: '/admin/employees' },
      { label: '직무', path: '/admin/positions' },
      { label: '출퇴근 장소', path: '/admin/timeclock-areas' },
    ],
  },
  {
    label: '근무일정',
    icon: <EventNoteIcon />,
    children: [
      { label: '달력', path: '/admin/shifts' },
      { label: '유형 관리', path: '/admin/shifts/types' },
      { label: '템플릿', path: '/admin/shifts/templates' },
      { label: '스케줄 패턴', path: '/admin/shifts/patterns' },
    ],
  },
  {
    label: '출퇴근',
    icon: <AccessTimeIcon />,
    children: [
      { label: '기록', path: '/admin/attendances' },
      { label: '현재 근무 현황', path: '/admin/attendances/now' },
    ],
  },
  {
    label: '휴가',
    icon: <BeachAccessIcon />,
    children: [
      { label: '유형 관리', path: '/admin/leave/types' },
      { label: '발생 규칙', path: '/admin/leave/accrual-rules' },
      { label: '휴가 현황', path: '/admin/leave/status' },
      { label: '휴가 목록', path: '/admin/leave/list' },
      { label: '보상휴가', path: '/admin/leave/compensation' },
    ],
  },
  {
    label: '요청',
    icon: <AssignmentIcon />,
    children: [
      { label: '요청 목록', path: '/admin/requests' },
      { label: '승인 규칙', path: '/admin/requests/rules' },
      { label: '커스텀 요청 유형', path: '/admin/requests/custom-types' },
    ],
  },
  {
    label: '전자결재',
    icon: <AssignmentIcon />,
    children: [
      // 카카오워크 전자결재 관리자 네비 순서 정합
      { label: '결재 현황', path: '/admin/approval/status' },
      { label: '공통 관리', path: '/admin/approval/common' },
      { label: '기안양식 관리', path: '/admin/approval/forms' },
      { label: '문서담당 관리', path: '/admin/approval/doc-managers' },
      { label: '공용 결재선 관리', path: '/admin/approval/lines' },
      { label: '서비스 사용 설정', path: '/admin/approval/service-setting' },
      { label: '문서대장', path: '/admin/approval/documents' },
      { label: '내 문서함', path: '/admin/approval/inbox' },
    ],
  },
  {
    label: '리포트',
    icon: <BarChartIcon />,
    children: [
      { label: '실시간 리포트', path: '/admin/reports' },
      { label: '표준화 규칙', path: '/admin/reports/standardization' },
      { label: '스냅샷', path: '/admin/reports/snapshots' },
    ],
  },
  {
    label: '메시지',
    icon: <MessageIcon />,
    children: [
      { label: '메시지 관리', path: '/admin/messages' },
      { label: '자동화 규칙', path: '/admin/messages/automations' },
    ],
  },
  {
    label: '설정',
    icon: <SettingsIcon />,
    children: [
      { label: '회사 설정', path: '/admin/settings/company' },
      { label: 'Discord 알림', path: '/admin/settings/notifications' },
      { label: '권한 설정', path: '/admin/settings/permissions' },
    ],
  },
]

function logout(router: ReturnType<typeof useRouter>, clearUser: () => void) {
  document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
  document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
  clearUser()
  router.push('/login')
}

export default function AdminSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const clearUser = useAuthStore((s) => s.clearUser)

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    NAV_ITEMS.forEach((item) => {
      if (item.children?.some((c) => pathname.startsWith(c.path))) {
        initial[item.label] = true
      }
    })
    return initial
  })

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          borderRight: '1px solid',
          borderColor: 'divider',
          overflowX: 'hidden',
        },
      }}
    >
      <Box sx={{ p: 2, pt: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" fontWeight={700} color="primary">AbleWork</Typography>
          <Typography variant="caption" color="text.secondary">관리자</Typography>
        </Box>
        <Tooltip title="로그아웃">
          <IconButton size="small" onClick={() => logout(router, clearUser)} aria-label="로그아웃">
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Divider />
      <List dense sx={{ pt: 0.5 }}>
        {NAV_ITEMS.map((item) => {
          if (!item.children) {
            return (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  selected={isActive(item.path!)}
                  onClick={() => router.push(item.path!)}
                  sx={{ '&.Mui-selected': { bgcolor: 'primary.50', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}
                >
                  <ListItemIcon sx={{ minWidth: 34 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItemButton>
              </ListItem>
            )
          }
          const isGroupActive = item.children.some((c) => isActive(c.path))
          return (
            <Box key={item.label}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => toggleMenu(item.label)}
                  sx={{ color: isGroupActive ? 'primary.main' : 'inherit' }}
                >
                  <ListItemIcon sx={{ minWidth: 34, color: isGroupActive ? 'primary.main' : 'inherit' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2', fontWeight: isGroupActive ? 700 : 400 }} />
                  {openMenus[item.label] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </ListItemButton>
              </ListItem>
              <Collapse in={openMenus[item.label]} timeout="auto" unmountOnExit>
                <List dense disablePadding>
                  {item.children.map((child) => (
                    <ListItem key={child.path} disablePadding>
                      <ListItemButton
                        selected={isActive(child.path)}
                        onClick={() => router.push(child.path)}
                        sx={{
                          pl: 4,
                          '&.Mui-selected': { bgcolor: 'primary.50', color: 'primary.main' },
                        }}
                      >
                        <ListItemText primary={child.label} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </Box>
          )
        })}
      </List>
    </Drawer>
  )
}
