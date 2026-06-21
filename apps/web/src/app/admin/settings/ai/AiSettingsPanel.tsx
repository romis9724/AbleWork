'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle, RadioGroup } from '@/components/ab/atoms'
import { useToast } from '@/components/ab/Toast'
import apiClient from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error'

type AiProvider = 'vllm' | 'openai' | 'anthropic'

interface AiSettings {
  enabled: boolean
  provider: AiProvider
  baseUrl: string
  model: string
  apiKey: string // 마스킹된 값 또는 ''
  apiKeySet: boolean
  maxTokens: number
  temperature: number
}

interface TestResult {
  ok: boolean
  message: string
  model?: string
}

const PROVIDERS = [
  { value: 'vllm', label: 'vLLM (자체 호스팅)' },
  { value: 'openai', label: 'OpenAI 호환' },
  { value: 'anthropic', label: 'Anthropic (준비 중)' },
]

/** provider별 입력 힌트 */
const PLACEHOLDERS: Record<AiProvider, { baseUrl: string; model: string }> = {
  vllm: { baseUrl: 'http://10.0.0.5:8000/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: '(향후 지원)', model: 'claude-...' },
}

export default function AiSettingsPanel() {
  const toast = useToast()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<AiSettings>({
    queryKey: ['ai-settings'],
    queryFn: () => apiClient.get('/ai-settings') as Promise<AiSettings>,
    staleTime: 60_000,
  })

  const [form, setForm] = useState<AiSettings | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('') // 새 키 입력(빈값이면 기존 유지)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) {
      setForm(data)
      setApiKeyInput('')
      setDirty(false)
    }
  }, [data])

  const save = useMutation({
    mutationFn: (patch: Partial<AiSettings>) => apiClient.patch('/ai-settings', patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-settings'] })
      toast('AI 설정을 저장했습니다')
    },
    onError: (e) => toast(getApiErrorMessage(e, '저장에 실패했습니다')),
  })

  const test = useMutation({
    mutationFn: () => apiClient.post('/ai-settings/test', {}) as Promise<TestResult>,
    onSuccess: (r) => toast(r.ok ? `✅ ${r.message}` : `❌ ${r.message}`),
    onError: (e) => toast(getApiErrorMessage(e, '연결 테스트에 실패했습니다')),
  })

  if (isLoading || !form) {
    return (
      <div className="ab-loading">
        <span className="ab-spin" />
        불러오는 중…
      </div>
    )
  }

  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
  }

  const ph = PLACEHOLDERS[form.provider] ?? PLACEHOLDERS.vllm

  const handleSave = () => {
    save.mutate({
      enabled: form.enabled,
      provider: form.provider,
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      maxTokens: form.maxTokens,
      temperature: form.temperature,
      // 새 키가 입력된 경우에만 전송(빈값이면 서버가 기존 키 유지)
      ...(apiKeyInput.trim() !== '' ? { apiKey: apiKeyInput.trim() } : {}),
    } as Partial<AiSettings>)
    setDirty(false)
  }

  return (
    <div className="set-block">
      <div className="set-block-head">AI 설정</div>

      <div className="set-row">
        <span className="k">AI 기능 사용</span>
        <div>
          <Toggle
            on={form.enabled}
            onChange={(v) => set('enabled', v)}
            label={form.enabled ? '사용' : '사용 안 함'}
          />
        </div>
      </div>

      <div className="set-row">
        <span className="k">제공자(Provider)</span>
        <div>
          <RadioGroup
            value={form.provider}
            onChange={(v) => set('provider', v as AiProvider)}
            options={PROVIDERS}
          />
          {form.provider === 'anthropic' && (
            <div style={{ fontSize: 12, color: 'var(--fg-5)', marginTop: 6 }}>
              Anthropic은 아직 지원하지 않습니다(추상화만 준비). vLLM 또는 OpenAI 호환을 사용하세요.
            </div>
          )}
        </div>
      </div>

      <div className="set-row">
        <span className="k">
          서버 주소 <span className="help">baseUrl</span>
        </span>
        <div>
          <input
            className="inp-block"
            value={form.baseUrl}
            onChange={(e) => set('baseUrl', e.target.value)}
            placeholder={ph.baseUrl}
            style={{ maxWidth: 360 }}
          />
        </div>
      </div>

      <div className="set-row">
        <span className="k">모델</span>
        <div>
          <input
            className="inp-block"
            value={form.model}
            onChange={(e) => set('model', e.target.value)}
            placeholder={ph.model}
            style={{ maxWidth: 360 }}
          />
        </div>
      </div>

      <div className="set-row">
        <span className="k">
          API 키 <span className="help">vLLM은 보통 불필요</span>
        </span>
        <div>
          <input
            className="inp-block"
            type="password"
            value={apiKeyInput}
            onChange={(e) => {
              setApiKeyInput(e.target.value)
              setDirty(true)
            }}
            placeholder={form.apiKeySet ? '설정됨 — 변경 시에만 입력' : '미설정'}
            style={{ maxWidth: 360 }}
          />
        </div>
      </div>

      <div className="set-row">
        <span className="k">최대 토큰</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            className="inp-block"
            type="number"
            min={1}
            max={8192}
            value={form.maxTokens}
            onChange={(e) => set('maxTokens', Math.max(1, Math.min(8192, Number(e.target.value))))}
            style={{ maxWidth: 120 }}
          />
          <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>1~8192</span>
        </div>
      </div>

      <div className="set-row">
        <span className="k">Temperature</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            className="inp-block"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.temperature}
            onChange={(e) => set('temperature', Math.max(0, Math.min(2, Number(e.target.value))))}
            style={{ maxWidth: 120 }}
          />
          <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>0~2 (낮을수록 일관적)</span>
        </div>
      </div>

      <div className="set-row" style={{ gridTemplateColumns: '1fr' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" disabled={!dirty || save.isPending} onClick={handleSave}>
            {save.isPending ? '저장 중…' : '저장'}
          </button>
          <button className="btn btn-line btn-sm" disabled={test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? '테스트 중…' : '연결 테스트'}
          </button>
        </div>
      </div>
    </div>
  )
}
