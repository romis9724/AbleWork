'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import DashboardIcon from '@mui/icons-material/Dashboard'
import PeopleIcon from '@mui/icons-material/People'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import EventNoteIcon from '@mui/icons-material/EventNote'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import AssignmentIcon from '@mui/icons-material/Assignment'
import BarChartIcon from '@mui/icons-material/BarChart'
import MessageIcon from '@mui/icons-material/Message'
import NotificationsIcon from '@mui/icons-material/Notifications'
import SettingsIcon from '@mui/icons-material/Settings'
import CorporateFareIcon from '@mui/icons-material/CorporateFare'

const DRAWER_WIDTH = 240

const NAV_ITEMS = [
  { label: '대시보드', icon: <DashboardIcon />, path: '/admin/dashboard' },
  { label: '조직/직원', icon: <PeopleIcon />, path: '/admin/employees' },
  { label: '직무', icon: <CorporateFareIcon />, path: '/admin/positions' },
  { label: '근무일정', icon: <EventNoteIcon />, path: '/admin/shifts' },
  { label: '출퇴근', icon: <AccessTimeIcon />, path: '/admin/attendances' },
  { label: '휴가', icon: <BeachAccessIcon />, path: '/admin/leave/types' },
  { label: '요청', icon: <AssignmentIcon />, path: '/admin/requests' },
  { label: '전자결재', icon: <AssignmentIcon />, path: '/admin/approval/forms' },
  { label: '리포트', icon: <BarChartIcon />, path: '/admin/reports' },
  { label: '메시지', icon: <MessageIcon />, path: '/admin/messages' },
  { label: '알림', icon: <NotificationsIcon />, path: '/admin/settings/notifications' },
  { label: '설정', icon: <SettingsIcon />, path: '/admin/settings/company' },
]

export default function AdminSidebar() {
  const router = useRouter()
  const pathname = usePathname()

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
        },
      }}
    >
      <Box sx={{ p: 2, pt: 3 }}>
        <Typography variant="h6" fontWeight={700} color="primary">
          AbleWork
        </Typography>
        <Typography variant="caption" color="text.secondary">
          관리자
        </Typography>
      </Box>
      <Divider />
      <List dense>
        {NAV_ITEMS.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={pathname === item.path || pathname.startsWith(item.path + '/')}
              onClick={() => router.push(item.path)}
              sx={{
                '&.Mui-selected': {
                  bgcolor: 'primary.50',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': { color: 'primary.main' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  )
}
