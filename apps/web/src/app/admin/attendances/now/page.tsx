'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import RefreshIcon from '@mui/icons-material/Refresh'
import WorkIcon from '@mui/icons-material/Work'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import { useNowAtWork, type NowAtWork } from '@/lib/query/attendances'
import { useOrganizations, type Organization } from '@/lib/query/organizations'

const STATUS_LABEL: Record<string, string> = {
  WORKING: '근무 중',
  ABSENT: '미출근',
  ON_LEAVE: '휴가 중',
  ONCALL: '대기',
  LATE: '지각',
  REMOTE: '재택',
  DEEMED_WORK: '간주근로',
}

const STATUS_COLOR: Record<string, string> = {
  WORKING: '#2e7d32',
  ABSENT: '#c62828',
  ON_LEAVE: '#1565c0',
  ONCALL: '#e65100',
  LATE: '#f9a825',
  REMOTE: '#00695c',
  DEEMED_WORK: '#6a1b9a',
}

const STATUS_BG: Record<string, string> = {
  WORKING: '#e8f5e9',
  ABSENT: '#ffebee',
  ON_LEAVE: '#e3f2fd',
  ONCALL: '#fff3e0',
  LATE: '#fffde7',
  REMOTE: '#e0f2f1',
  DEEMED_WORK: '#f3e5f5',
}

function SummaryCard({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode
  label: string
  count: number
  color: string
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        p: 2.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flex: 1,
      }}
    >
      <Box sx={{ color, fontSize: 36, display: 'flex' }}>{icon}</Box>
      <Box>
        <Typography variant="h4" fontWeight={700} lineHeight={1}>
          {count}
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          {label}
        </Typography>
      </Box>
    </Paper>
  )
}

type RawList<T> = T[] | { items?: T[]; data?: T[] }

function toArray<T>(raw: RawList<T> | null | undefined): T[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return (raw as { items?: T[]; data?: T[] }).items ?? (raw as { items?: T[]; data?: T[] }).data ?? []
}

export default function NowAtWorkPage() {
  const [orgFilter, setOrgFilter] = useState<string | undefined>(undefined)
  const { data: rawEmployees, isLoading, refetch, isFetching } = useNowAtWork()
  const { data: rawOrgs } = useOrganizations()

  const employees = toArray<NowAtWork>(rawEmployees as RawList<NowAtWork>)
  const orgs = toArray<Organization>(rawOrgs as RawList<Organization>)

  const filtered: NowAtWork[] = orgFilter
    ? employees.filter(
        (e) => e.organization?.name === orgFilter || e.organization?.name?.includes(orgFilter),
      )
    : employees

  const working = filtered.filter((e) =>
    ['WORKING', 'LATE', 'REMOTE', 'DEEMED_WORK'].includes(e.workingStatus),
  ).length
  const oncall = filtered.filter((e) => e.workingStatus === 'ONCALL').length
  const late = filtered.filter((e) => e.workingStatus === 'LATE').length

  return (
    <>
      <PageHeader
        title="현재 근무 현황"
        actions={
          <Button
            variant="outlined"
            startIcon={isFetching ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            새로고침
          </Button>
        }
      />

      {/* Summary cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <SummaryCard
          icon={<WorkIcon fontSize="inherit" />}
          label="근무 중"
          count={working}
          color="#2e7d32"
        />
        <SummaryCard
          icon={<NotificationsActiveIcon fontSize="inherit" />}
          label="대기"
          count={oncall}
          color="#e65100"
        />
        <SummaryCard
          icon={<AccessTimeIcon fontSize="inherit" />}
          label="지각"
          count={late}
          color="#f9a825"
        />
      </Box>

      {/* Org filter */}
      <Box sx={{ mb: 3, maxWidth: 280 }}>
        <Autocomplete
          options={orgs}
          getOptionLabel={(o) => o.name}
          value={orgs.find((o) => o.name === orgFilter || o.id === orgFilter) ?? null}
          onChange={(_, v) => setOrgFilter(v?.name)}
          size="small"
          renderInput={(params) => <TextField {...params} label="조직 필터 (전체)" />}
        />
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <EmptyState message="표시할 직원 정보가 없습니다." />
      ) : (
        <Grid container spacing={2}>
          {filtered.map((emp) => (
            <Grid key={emp.attendanceId} item xs={12} sm={6} md={4} lg={3}>
              <Card
                elevation={0}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderLeft: '4px solid',
                  borderLeftColor: STATUS_COLOR[emp.workingStatus] ?? 'grey.400',
                  height: '100%',
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {emp.employeeName}
                    </Typography>
                    <Chip
                      label={STATUS_LABEL[emp.workingStatus] ?? emp.workingStatus}
                      size="small"
                      sx={{
                        bgcolor: STATUS_BG[emp.workingStatus] ?? 'grey.100',
                        color: STATUS_COLOR[emp.workingStatus] ?? 'grey.700',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                      }}
                    />
                  </Box>
                  {emp.organization?.name && (
                    <Typography variant="body2" color="text.secondary" mb={1}>
                      {emp.organization.name}
                    </Typography>
                  )}
                  {emp.clockInAt && (
                    <Typography variant="caption" color="text.secondary">
                      출근:{' '}
                      {new Date(emp.clockInAt).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </>
  )
}
