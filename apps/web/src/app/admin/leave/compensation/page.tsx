'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import PageHeader from '@/components/common/PageHeader'
import { useLeaveGroups } from '@/lib/query/leaves'
import { useManualAccrual } from '@/lib/query/leaves'

export default function CompensationLeavePage() {
  const { data: groups = [] } = useLeaveGroups()
  const manualAccrual = useManualAccrual()
  const [groupId, setGroupId] = useState('')
  const [days, setDays] = useState('1')
  const [memo, setMemo] = useState('')
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' })

  async function handleSubmit() {
    if (!groupId || !days) { setSnack({ open: true, msg: '필수 항목을 입력해 주세요.', sev: 'error' }); return }
    try {
      await manualAccrual.mutateAsync({ leaveGroupId: groupId, days: Number(days), memo, type: 'compensation' })
      setSnack({ open: true, msg: '보상휴가가 발생됐습니다.', sev: 'success' })
      setDays('1'); setMemo('')
    } catch { setSnack({ open: true, msg: '처리 중 오류가 발생했습니다.', sev: 'error' }) }
  }

  return (
    <>
      <PageHeader title="보상휴가 발생" subtitle="휴일근로 등에 대한 보상휴가를 일괄 발생합니다." />
      <Alert severity="info" sx={{ mb: 3 }}>
        보상휴가는 직원의 휴가 잔여일수에 직접 추가됩니다. 취소는 관리자가 수동으로 조정해야 합니다.
      </Alert>
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxWidth: 480 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="휴가 그룹" select required value={groupId} onChange={e => setGroupId(e.target.value)} fullWidth>
            {groups.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
          </TextField>
          <TextField label="발생 일수" type="number" required value={days} onChange={e => setDays(e.target.value)} inputProps={{ min: 0.5, step: 0.5 }} fullWidth helperText="0.5 단위로 입력" />
          <TextField label="발생 메모" value={memo} onChange={e => setMemo(e.target.value)} multiline rows={2} fullWidth placeholder="예: 2026년 6월 특근 보상" />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={handleSubmit} disabled={manualAccrual.isPending}>보상휴가 발생</Button>
          </Box>
        </CardContent>
      </Card>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev}>{snack.msg}</Alert>
      </Snackbar>
    </>
  )
}
