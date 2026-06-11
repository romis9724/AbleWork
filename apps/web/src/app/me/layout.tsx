import Box from '@mui/material/Box'
import EmployeeNavBar from '@/components/layout/EmployeeNavBar'

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ pb: 8 }}>
      <Box component="main" sx={{ p: 2 }}>
        {children}
      </Box>
      <EmployeeNavBar />
    </Box>
  )
}
