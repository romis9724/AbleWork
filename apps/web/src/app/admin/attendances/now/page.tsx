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
import EventBusyIcon from '@mui/icons-material/EventBusy'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
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
}

const STATUS_COLOR: Record<string, string> = {
  WORKING: '#2e7d32',
  ABSENT: '#c62828',
  ON_LEAVE: '#1565c0',
  ONCALL: '#e65100',
  LATE: '#f9a825',
}

const STATUS_BG: Record<string, string> = {
  WORKING: '#e8f5e9',
  ABSENT: '#ffebee',
  ON_LEAVE: '#e3f2fd',
  ONCALL: '#fff3e0',
  LATE: '#fffde7',
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
    ? employees.filter((e) => e.organization === orgFilter || e.organization?.includes(orgFilter))
    : employees

  const working = filtered.filter((e) => e.status === 'WORKING').length
  const absent = filtered.filter((e) => e.status === 'ABSENT').length
  const onLeave = filtered.filter((e) => e.status === 'ON_LEAVE').length

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
          icon={<EventBusyIcon fontSize="inherit" />}
          label="미출근"
          count={absent}
          color="#c62828"
        />
        <SummaryCard
          icon={<BeachAccessIcon fontSize="inherit" />}
          label="휴가 중"
          count={onLeave}
          color="#1565c0"
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
            <Grid key={emp.employeeId} item xs={12} sm={6} md={4} lg={3}>
              <Card
                elevation={0}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderLeft: '4px solid',
                  borderLeftColor: STATUS_COLOR[emp.status] ?? 'grey.400',
                  height: '100%',
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {emp.name}
                    </Typography>
                    <Chip
                      label={STATUS_LABEL[emp.status] ?? emp.status}
                      size="small"
                      sx={{
                        bgcolor: STATUS_BG[emp.status] ?? 'grey.100',
                        color: STATUS_COLOR[emp.status] ?? 'grey.700',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                      }}
                    />
                  </Box>
                  {emp.organization && (
                    <Typography variant="body2" color="text.secondary" mb={1}>
                      {emp.organization}
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
