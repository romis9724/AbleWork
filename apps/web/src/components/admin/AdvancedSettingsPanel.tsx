'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle, Note } from '@/components/ab/atoms'
import { HelpTip } from '@/components/ab/HelpTip'
import { useToast } from '@/components/ab/Toast'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import { getApiErrorMessage } from '@/lib/api-error'
import { ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'

// 고급 옵션 패널 — 회사설정의 다른 섹션에서 다루지 않는 고급 항목만 노출.
// /company-settings GET/PATCH (queryKey ['company-settings']) 사용.

// PATCH는 GENERAL_ADMIN 이상만 허용 (백엔드 @Roles 정합)
const SAVE_MIN_LEVEL = ACCESS_LEVEL_HIERARCHY.GENERAL_ADMIN

interface AdvancedSettings {
  timeFormat?: string
  shiftTemplateCodeEnabled?: boolean
  impliedWorkEnabled?: boolean
  approvalServiceEnabled?: boolean
  approvalPrevStepReject?: boolean
}

const TIME_FORMATS = [
  { value: '24h', label: '24시간 (14:30)' },
  { value: '12h', label: '12시간 (오후 2:30)' },
]

export default function AdvancedSettingsPanel() {
  const toast = useToast()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canSave = !!user && ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= SAVE_MIN_LEVEL

  const { data: settings, isLoading } = useQuery<AdvancedSettings>({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/company-settings') as Promise<AdvancedSettings>,
    staleTime: 60_000,
  })

  const [form, setForm] = useState<AdvancedSettings>({})
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (settings) {
      setForm(settings)
      setDirty(false)
    }
  }, [settings])

  const save = useMutation({
    mutationFn: (patch: Partial<AdvancedSettings>) => apiClient.patch('/company-settings', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['company-settings'] }),
  })

  function setField<K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  async function handleSave() {
    if (!canSave) return
    try {
      await save.mutateAsync({
        timeFormat: form.timeFormat,
        shiftTemplateCodeEnabled: form.shiftTemplateCodeEnabled,
        impliedWorkEnabled: form.impliedWorkEnabled,
        approvalServiceEnabled: form.approvalServiceEnabled,
        approvalPrevStepReject: form.approvalPrevStepReject,
      })
      setDirty(false)
      toast('고급 옵션을 저장했습니다')
    } catch (e) {
      toast(getApiErrorMessage(e, '저장에 실패했습니다'))
    }
  }

  return (
    <div className="set-block">
      <div className="set-block-head">고급 옵션</div>

      <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
        <Note title="고급 옵션 안내">
          다른 설정 섹션에서 다루지 않는 고급 항목입니다. 저장은 일반관리자(GENERAL_ADMIN) 이상만 가능합니다.
        </Note>
      </div>

      {!canSave && (
        <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>
            고급 옵션 저장 권한이 없습니다. 현재 권한으로는 값을 조회만 할 수 있습니다.
          </span>
        </div>
      )}

      <div className="set-row">
        <span className="k">시간 표시 형식<HelpTip k="advanced.timeFormat" /></span>
        <div>
          <select
            className="sel"
            value={form.timeFormat ?? '24h'}
            onChange={(e) => setField('timeFormat', e.target.value)}
            disabled={!canSave}
            style={{ maxWidth: 220 }}
          >
            {TIME_FORMATS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="set-row">
        <span className="k">근무일정 템플릿 코드 사용<HelpTip k="advanced.shiftTemplateCode" /></span>
        <div>
          <Toggle
            on={form.shiftTemplateCodeEnabled ?? false}
            onChange={(v) => canSave && setField('shiftTemplateCodeEnabled', v)}
            label={form.shiftTemplateCodeEnabled ? '사용' : '사용 안 함'}
          />
        </div>
      </div>

      <div className="set-row">
        <span className="k">간주근로 사용<HelpTip k="advanced.impliedWork" /></span>
        <div>
          <Toggle
            on={form.impliedWorkEnabled ?? false}
            onChange={(v) => canSave && setField('impliedWorkEnabled', v)}
            label={form.impliedWorkEnabled ? '사용' : '사용 안 함'}
          />
        </div>
      </div>

      <div className="set-row">
        <span className="k">전자결재 서비스 사용<HelpTip k="advanced.approvalService" /></span>
        <div>
          <Toggle
            on={form.approvalServiceEnabled ?? false}
            onChange={(v) => canSave && setField('approvalServiceEnabled', v)}
            label={form.approvalServiceEnabled ? '사용' : '사용 안 함'}
          />
        </div>
      </div>

      <div className="set-row">
        <span className="k">전단계 반려 허용<HelpTip k="advanced.returnToPrev" /></span>
        <div>
          <Toggle
            on={form.approvalPrevStepReject ?? false}
            onChange={(v) => canSave && setField('approvalPrevStepReject', v)}
            label={form.approvalPrevStepReject ? '허용' : '허용 안 함'}
          />
        </div>
      </div>

      <div className="set-row" style={{ gridTemplateColumns: '200px 1fr' }}>
        <span className="k" />
        <div>
          <button
            className="btn btn-primary btn-sm"
            disabled={!canSave || !dirty || save.isPending}
            onClick={handleSave}
          >
            {save.isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      )}
    </div>
  )
}
