'use client'
import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PageHeader from '@/components/common/PageHeader'
import { useSnackbar } from '@/hooks/useSnackbar'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  useOrganizations,
  useOrgDocManagers,
  useSetOrgDocManagers,
  type Organization,
} from '@/lib/query/organizations'
import { useEmployees } from '@/lib/query/employees'

interface FlatOrg {
  id: string
  name: string
  depth: number
}

/** 조직 트리를 깊이 들여쓰기용 플랫 배열로 변환 */
function flatten(nodes: Organization[], depth = 0, acc: FlatOrg[] = []): FlatOrg[] {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name, depth })
    if (n.children?.length) flatten(n.children, depth + 1, acc)
  }
  return acc
}

type EmpOption = { id: string; name: string }

export default function DocManagersPage() {
  const { data: orgTree = [], isLoading: orgLoading } = useOrganizations()
  const { data: employeeData } = useEmployees({ limit: 500, isActive: true })
  const employees: EmpOption[] = useMemo(
    () => (employeeData?.items ?? []).map((e) => ({ id: e.id, name: e.name })),
    [employeeData],
  )
  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()

  const flatOrgs = useMemo(() => flatten(orgTree), [orgTree])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)

  // 최초 로드 시 첫 조직 자동 선택
  useEffect(() => {
    if (!selectedOrgId && flatOrgs.length) setSelectedOrgId(flatOrgs[0].id)
  }, [flatOrgs, selectedOrgId])

  const { data: managers, isLoading: mgrLoading } = useOrgDocManagers(selectedOrgId)
  const setManagers = useSetOrgDocManagers()

  // 선택 부서의 현재 담당자(순서 유지) → Autocomplete value
  const [selected, setSelected] = useState<EmpOption[]>([])
  useEffect(() => {
    if (managers) {
      setSelected(managers.map((m) => ({ id: m.employeeId, name: m.employee.name })))
    }
  }, [managers])

  const selectedOrg = flatOrgs.find((o) => o.id === selectedOrgId)

  function handleSave() {
    if (!selectedOrgId) return
    setManagers.mutate(
      { orgId: selectedOrgId, employeeIds: selected.map((e) => e.id) },
      {
        onSuccess: () => showSnackbar('문서담당자를 저장했습니다.'),
        onError: (err) => showSnackbar(getApiErrorMessage(err, '저장에 실패했습니다.'), 'error'),
      },
    )
  }

  return (
    <>
      <PageHeader
        title="문서담당 관리"
        subtitle="부서별 전자결재 문서담당자를 지정합니다. 부서협조/부서수신 결재는 지정된 담당자 누구나 처리할 수 있고, 첫 번째가 대표 담당자입니다."
      />

      {orgLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* 좌: 조직 목록 */}
          <Paper
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider', width: 280, maxHeight: 560, overflow: 'auto' }}
          >
            <List dense disablePadding>
              {flatOrgs.map((org) => (
                <ListItemButton
                  key={org.id}
                  selected={org.id === selectedOrgId}
                  onClick={() => setSelectedOrgId(org.id)}
                  sx={{ pl: 2 + org.depth * 2 }}
                >
                  <ListItemText primary={org.name} />
                </ListItemButton>
              ))}
            </List>
          </Paper>

          {/* 우: 담당자 편집 */}
          <Paper
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider', p: 2.5, flexGrow: 1, minWidth: 320 }}
          >
            {!selectedOrg ? (
              <Typography variant="body2" color="text.secondary">조직을 선택하세요.</Typography>
            ) : mgrLoading ? (
              <CircularProgress size={22} />
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>{selectedOrg.name}</Typography>
                <Autocomplete
                  multiple
                  options={employees}
                  value={selected}
                  onChange={(_, v) => setSelected(v)}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderTags={(value, getTagProps) =>
                    value.map((option, index) => {
                      const { key, ...chipProps } = getTagProps({ index })
                      return (
                        <Chip
                          key={key}
                          {...chipProps}
                          label={index === 0 ? `${option.name} (대표)` : option.name}
                          color={index === 0 ? 'primary' : 'default'}
                          variant={index === 0 ? 'filled' : 'outlined'}
                          size="small"
                        />
                      )
                    })
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="문서담당자" placeholder="담당자 검색·추가" />
                  )}
                />
                <Typography variant="caption" color="text.secondary">
                  맨 앞 담당자가 대표(상신 시 1차 배정 대상)입니다. 칩을 지워 순서를 바꿀 수 있습니다.
                </Typography>
                <Box>
                  <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={setManagers.isPending}
                  >
                    {setManagers.isPending ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
                    저장
                  </Button>
                </Box>
              </Box>
            )}
          </Paper>
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={hideSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={hideSnackbar} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
