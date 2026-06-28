'use client'
import { useState } from 'react'
import { Note } from '@/components/ab/atoms'
import { HelpTip } from '@/components/ab/HelpTip'
import { useToast } from '@/components/ab/Toast'
import { useConfirmPeriod, useUnconfirmAttendances } from '@/lib/query/attendances'
import { useOrganizations } from '@/lib/query/organizations'
import { useAuthStore } from '@/stores/auth.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'

// 근태 마감 패널 — 출퇴근 기록 기간 확정/해제 전용.
// 주의: 급여 정산 마감(payroll)은 구현 대상이 아니다. (CLAUDE.md NEVER 목록)
//        이 패널은 "근태 기간 확정/해제"만 다룬다.

// 확정 해제 가능 최소 권한 (GENERAL_ADMIN 이상)
const UNCONFIRM_MIN_LEVEL = ACCESS_LEVEL_HIERARCHY.GENERAL_ADMIN

export default function ClosingPanel() {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const canUnconfirm =
    !!user && ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= UNCONFIRM_MIN_LEVEL

  const { data: organizations } = useOrganizations()
  const orgList = Array.isArray(organizations) ? organizations : []

  const confirmPeriod = useConfirmPeriod()
  const unconfirm = useUnconfirmAttendances()

  // ── 기간 확정(마감) 폼 ──────────────────────────────────────
  const [confirmStart, setConfirmStart] = useState('')
  const [confirmEnd, setConfirmEnd] = useState('')
  const [confirmOrg, setConfirmOrg] = useState('')

  // ── 마감 해제 폼 ────────────────────────────────────────────
  const [unconfirmStart, setUnconfirmStart] = useState('')
  const [unconfirmEnd, setUnconfirmEnd] = useState('')

  const confirmReady = !!confirmStart && !!confirmEnd
  const unconfirmReady = !!unconfirmStart && !!unconfirmEnd

  async function handleConfirm() {
    if (!confirmReady) return
    try {
      await confirmPeriod.mutateAsync({
        startDate: confirmStart,
        endDate: confirmEnd,
        ...(confirmOrg !== '' && { organizationId: confirmOrg }),
      })
      toast('해당 기간을 확정(마감)했습니다')
    } catch (e) {
      toast(getApiErrorMessage(e, '기간 확정에 실패했습니다'))
    }
  }

  async function handleUnconfirm() {
    if (!unconfirmReady || !canUnconfirm) return
    try {
      await unconfirm.mutateAsync({
        startDate: unconfirmStart,
        endDate: unconfirmEnd,
      })
      toast('해당 기간의 마감을 해제했습니다')
    } catch (e) {
      toast(getApiErrorMessage(e, '마감 해제에 실패했습니다'))
    }
  }

  return (
    <>
      {/* ── 근태 마감(기간 확정) ───────────────────────────── */}
      <div className="set-block">
        <div className="set-block-head">근태 마감</div>

        <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
          <div style={{ fontSize: 12, color: 'var(--fg-5)', paddingBottom: 4 }}>
            급여 정산 마감이 아닌 <b style={{ color: 'var(--fg-3)' }}>출퇴근 기록의 기간 확정/해제</b>만 다룹니다.
          </div>
        </div>

        <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
          <Note title="마감 안내">
            기간을 확정하면 해당 기간의 출퇴근 기록과 근무일정 수정이 잠깁니다. 수정이 필요하면 먼저 마감을
            해제해야 합니다.
          </Note>
        </div>

        <div className="set-row">
          <span className="k">대상 기간<HelpTip k="closing.period" /></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="inp-block"
              type="date"
              value={confirmStart}
              onChange={(e) => setConfirmStart(e.target.value)}
              style={{ maxWidth: 170 }}
            />
            <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>~</span>
            <input
              className="inp-block"
              type="date"
              value={confirmEnd}
              onChange={(e) => setConfirmEnd(e.target.value)}
              style={{ maxWidth: 170 }}
            />
          </div>
        </div>

        <div className="set-row">
          <span className="k">대상 조직<HelpTip k="closing.targetOrg" /></span>
          <div>
            <select
              className="sel"
              value={confirmOrg}
              onChange={(e) => setConfirmOrg(e.target.value)}
              style={{ maxWidth: 260 }}
            >
              <option value="">전체 조직</option>
              {orgList.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="set-row" style={{ gridTemplateColumns: '200px 1fr' }}>
          <span className="k" />
          <div>
            <button
              className="btn btn-primary btn-sm"
              disabled={!confirmReady || confirmPeriod.isPending}
              onClick={handleConfirm}
            >
              {confirmPeriod.isPending ? '확정 중…' : '기간 확정(마감)'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 마감 해제 ──────────────────────────────────────── */}
      <div className="set-block">
        <div className="set-block-head">마감 해제</div>

        {!canUnconfirm && (
          <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
            <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>
              마감 해제는 일반관리자(GENERAL_ADMIN) 이상만 수행할 수 있습니다.
            </span>
          </div>
        )}

        <div className="set-row">
          <span className="k">대상 기간<HelpTip k="closing.unconfirmPeriod" /></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="inp-block"
              type="date"
              value={unconfirmStart}
              onChange={(e) => setUnconfirmStart(e.target.value)}
              disabled={!canUnconfirm}
              style={{ maxWidth: 170 }}
            />
            <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>~</span>
            <input
              className="inp-block"
              type="date"
              value={unconfirmEnd}
              onChange={(e) => setUnconfirmEnd(e.target.value)}
              disabled={!canUnconfirm}
              style={{ maxWidth: 170 }}
            />
          </div>
        </div>

        <div className="set-row" style={{ gridTemplateColumns: '200px 1fr' }}>
          <span className="k" />
          <div>
            <button
              className="btn btn-line btn-sm"
              disabled={!canUnconfirm || !unconfirmReady || unconfirm.isPending}
              onClick={handleUnconfirm}
            >
              {unconfirm.isPending ? '해제 중…' : '마감 해제'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
