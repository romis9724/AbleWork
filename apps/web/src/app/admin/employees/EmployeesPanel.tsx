'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Emp, Seg, Toggle, TableEmpty, Pager, type BadgeKind } from '@/components/ab/atoms'
import { I, HRI } from '@/components/ab/icons'
import { ConfirmDialog } from '@/components/ab/Modal'
import { useToast } from '@/components/ab/Toast'
import { useDebounce } from '@/hooks/useDebounce'
import apiClient from '@/lib/api-client'
import {
  useEmployees,
  useCreateEmployee,
  useActivateEmployee,
  type Employee,
} from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { usePositions } from '@/lib/query/positions'
import { usePermission } from '@/hooks/usePermission'
import { ACTION_KEYS } from '@ablework/shared-constants'
import EmployeeCreateDialog, { type CreateEmployeeFormValues } from './EmployeeCreateDialog'

// ── Constants ─────────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<string, string> = {
  SUPER_ADMIN: '최고관리자',
  GENERAL_ADMIN: '총괄관리자',
  ORG_ADMIN: '조직관리자',
  EMPLOYEE: '직원',
}
const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  regular: '정규직',
  contract: '계약직',
  part_time: '파트타임',
  daily: '일용직',
}
const LEVEL_BADGE: Record<string, BadgeKind> = {
  SUPER_ADMIN: 'b-prog',
  GENERAL_ADMIN: 'b-force',
  ORG_ADMIN: 'b-done',
  EMPLOYEE: 'b-submit',
}

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_LIMIT = 20

type SegTab = 'basic' | 'work'

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenOrgs(orgs: Organization[], depth = 0): (Organization & { depth: number })[] {
  return orgs.flatMap((o) => [
    { ...o, depth },
    ...(o.children ? flattenOrgs(o.children, depth + 1) : []),
  ])
}

/** 본조직(isPrimary) 우선 + 그 외 조직 수 요약 */
function formatOrganizations(emp: Employee): { primary: string; others: number } {
  const orgs = emp.organizations ?? []
  if (orgs.length === 0) return { primary: '—', others: 0 }
  const primary = orgs.find((o) => o.isPrimary) ?? orgs[0]
  return { primary: primary.organization.name, others: orgs.length - 1 }
}

function formatPosition(emp: Employee): string {
  const positions = emp.positions ?? []
  if (positions.length === 0) return '—'
  return positions.map((p) => p.position.name).join(', ')
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 직원 관리 본문 패널.
 * 표준 라우트(/admin/employees)와 회사 설정 임베드(설정 > 직원) 양쪽에서 동일하게 사용.
 * PageHead는 호출하는 page가 렌더하고, 패널은 자체 툴바(다운로드/업로드/직원 추가)를 가진다.
 */
export default function EmployeesPanel() {
  const router = useRouter()
  const toast = useToast()
  const perm = usePermission()
  const canCreate = perm.can(ACTION_KEYS.EMPLOYEE_CREATE)
  const canManage = perm.can(ACTION_KEYS.EMPLOYEE_MANAGE)

  // ── 필터 상태 ──────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [tab, setTab] = useState<SegTab>('basic')
  const [page, setPage] = useState(1)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS)

  const [createOpen, setCreateOpen] = useState(false)
  const [activateTarget, setActivateTarget] = useState<Employee | null>(null)

  // ── 데이터 ────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useEmployees({
    search: debouncedSearch || undefined,
    organizationId: organizationId || undefined,
    positionId: positionId || undefined,
    isActive: !showInactive,
    page,
    limit: DEFAULT_LIMIT,
  })
  const employees = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT))

  const { data: orgsRaw = [] } = useOrganizations()
  const { data: positions = [] } = usePositions()
  const flatOrgs = flattenOrgs(orgsRaw)

  const createMutation = useCreateEmployee()
  const activateMutation = useActivateEmployee()

  const hasFilter = !!debouncedSearch || !!organizationId || !!positionId

  // ── 선택 상태 ──────────────────────────────────────────────
  const selectedIds = employees.filter((e) => checked[e.id]).map((e) => e.id)
  const allOn = employees.length > 0 && employees.every((e) => checked[e.id])
  const someOn = selectedIds.length > 0

  function toggleAll() {
    if (allOn) {
      setChecked({})
    } else {
      setChecked(Object.fromEntries(employees.map((e) => [e.id, true])))
    }
  }

  function toggleOne(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function resetPage() {
    setPage(1)
    setChecked({})
  }

  // ── 핸들러 ────────────────────────────────────────────────
  const handleCreate = (values: CreateEmployeeFormValues) => {
    // 빈 비밀번호는 전송하지 않는다 (비활성 계정으로 생성)
    const { initialPassword, ...rest } = values
    const payload = initialPassword ? { ...rest, initialPassword } : rest
    createMutation.mutate(payload, {
      onSuccess: () => {
        setCreateOpen(false)
        toast(
          initialPassword
            ? `직원을 추가했습니다. ${values.email} 계정으로 바로 로그인할 수 있습니다`
            : `직원을 추가했습니다. 상세에서 "비밀번호 재설정"으로 로그인 계정을 활성화하세요`,
        )
      },
      onError: () => toast('직원 추가에 실패했습니다'),
    })
  }

  const handleActivate = () => {
    if (!activateTarget) return
    activateMutation.mutate(activateTarget.id, {
      onSuccess: () => {
        setActivateTarget(null)
        toast('직원을 재활성화했습니다')
      },
      onError: () => toast('재활성화에 실패했습니다'),
    })
  }

  function handleExport(rows: Employee[]) {
    const headers = ['이름', '사번', '이메일', '본조직', '직무', '고용형태', '입사일', '권한', '상태']
    const csvRows = rows.map((emp) => {
      const { primary } = formatOrganizations(emp)
      return [
        emp.name,
        emp.employeeNumber ?? '',
        emp.user?.email ?? '',
        primary,
        formatPosition(emp),
        EMPLOYMENT_TYPE_LABEL[emp.employmentType] ?? emp.employmentType,
        new Date(emp.joinedAt).toLocaleDateString('ko-KR'),
        LEVEL_LABEL[emp.accessLevel] ?? emp.accessLevel,
        emp.isActive ? '재직' : '퇴사',
      ]
    })
    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `직원목록_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('엑셀로 내보냈습니다')
  }

  // 전체 직원 export: 현재 필터를 유지한 채 전체를 조회해 내보낸다(현재 페이지 한정 문제 해소)
  async function handleExportAll() {
    try {
      const res = (await apiClient.get('/employees', {
        params: {
          search: debouncedSearch || undefined,
          organizationId: organizationId || undefined,
          positionId: positionId || undefined,
          isActive: !showInactive,
          limit: 1000, // 서버 employees limit 상한(1000)에 맞춤 — 중소기업 규모 전 직원 수용
        },
      })) as unknown as { items?: Employee[] }
      handleExport(res.items?.length ? res.items : employees)
    } catch {
      handleExport(employees)
      toast('전체 조회에 실패해 현재 페이지만 내보냈습니다')
    }
  }

  // ── CSV 일괄 업로드 (D-5) ────────────────────────────────────────────────────
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const CSV_HEADER = '이름,이메일,입사일(YYYY-MM-DD),고용형태,조직명,사번,전화'

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    setUploading(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      if (lines.length < 2) {
        toast('데이터 행이 없습니다. 헤더 + 1행 이상 필요합니다')
        return
      }
      // 헤더는 무시하고 컬럼 순서 고정: 이름,이메일,입사일,고용형태,조직명,사번,전화
      const rows = lines.slice(1).map((line) => {
        const c = line.split(',').map((v) => v.trim())
        return {
          name: c[0] ?? '',
          email: c[1] ?? '',
          joinedAt: c[2] ?? '',
          employmentType: c[3] || undefined,
          organizationName: c[4] || undefined,
          employeeNumber: c[5] || undefined,
          phone: c[6] || undefined,
        }
      })
      const res = (await apiClient.post('/employees/bulk', { rows })) as unknown as {
        created: number
        errors: { row: number; message: string }[]
      }
      qc.invalidateQueries({ queryKey: ['employees'] })
      if (res.errors.length === 0) {
        toast(`${res.created}명을 일괄 등록했습니다`)
      } else {
        toast(`${res.created}명 등록 · ${res.errors.length}건 실패 (${res.errors[0].row}행: ${res.errors[0].message})`)
      }
    } catch {
      toast('업로드 처리 중 오류가 발생했습니다 (CSV 형식 확인)')
    } finally {
      setUploading(false)
    }
  }

  const colCount = tab === 'work' ? 8 : 8

  return (
    <div style={{ minWidth: 0 }}>
      {/* 패널 툴바 — PageHead 우측에 있던 액션을 임베드에서도 보이도록 패널 내부로 이동 */}
      <div className="tbl-bar" style={{ marginBottom: 14 }}>
        <span className="tbl-count">
          총 직원수 <b>{total}</b>명
        </span>
        <div className="head-actions">
          <button
            className="btn btn-line btn-sm"
            onClick={handleExportAll}
          >
            {I.down({ style: { marginRight: 7 } })}다운로드
          </button>
          <button
            className="btn btn-line btn-sm"
            disabled={uploading}
            title={`CSV 컬럼: ${CSV_HEADER}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {HRI.up({ style: { marginRight: 7 } })}{uploading ? '업로드 중…' : '업로드'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleUploadFile}
          />
          {canCreate && (
            <button className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(true)}>
              {I.plus({ style: { marginRight: 6 } })}직원 추가하기
            </button>
          )}
        </div>
      </div>

      {/* 필터 칩 행 */}
      <div className="fbar">
        <div className="inp-wrap" style={{ width: 240 }}>
          <input
            className="inp"
            placeholder="이름 / 사번 / 전화번호 검색"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              resetPage()
            }}
          />
          <span className="ic">{I.search()}</span>
        </div>
        <select
          className="sel"
          value={organizationId}
          onChange={(e) => {
            setOrganizationId(e.target.value)
            resetPage()
          }}
        >
          <option value="">전체 조직</option>
          {flatOrgs.map((o) => (
            <option key={o.id} value={o.id}>
              {' '.repeat(o.depth * 2)}
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="sel"
          value={positionId}
          onChange={(e) => {
            setPositionId(e.target.value)
            resetPage()
          }}
        >
          <option value="">전체 직무</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {isFetching && !isLoading && (
          <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>불러오는 중…</span>
        )}
      </div>

      <div className="tbl-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <Toggle
            on={showInactive}
            onChange={(v) => {
              setShowInactive(v)
              resetPage()
            }}
            label="비활성(퇴사) 직원 보기"
          />
        </div>
        <Seg<SegTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'basic', label: '직원' },
            { value: 'work', label: '근로정보' },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <>
          <div className="tbl-scroll wide">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 44 }} className="c">
                    <input
                      type="checkbox"
                      className="ck"
                      checked={allOn}
                      onChange={toggleAll}
                      disabled={employees.length === 0}
                    />
                  </th>
                  <th style={{ width: 200 }}>이름</th>
                  <th style={{ width: 110 }}>액세스 권한</th>
                  <th style={{ width: 110 }}>입사일</th>
                  <th style={{ width: 140 }}>본조직</th>
                  <th style={{ width: 120 }}>직무</th>
                  {tab === 'work' ? (
                    <>
                      <th style={{ width: 110 }}>고용 형태</th>
                      <th>사번</th>
                    </>
                  ) : (
                    <>
                      <th style={{ width: 90 }} className="c">
                        상태
                      </th>
                      <th>이메일</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <TableEmpty
                    colSpan={colCount}
                    message={
                      hasFilter
                        ? '조건에 맞는 직원이 없습니다'
                        : showInactive
                          ? '비활성(퇴사) 직원이 없습니다'
                          : '등록된 직원이 없습니다'
                    }
                  />
                ) : (
                  employees.map((emp) => {
                    const { primary, others } = formatOrganizations(emp)
                    return (
                      <tr key={emp.id} style={emp.isActive ? undefined : { opacity: 0.5 }}>
                        <td className="c" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="ck"
                            checked={!!checked[emp.id]}
                            onChange={() => toggleOne(emp.id)}
                          />
                        </td>
                        <td>
                          <span className="tbl-link" onClick={() => router.push(`/admin/employees/${emp.id}`)}>
                            <Emp name={emp.name} on={emp.isActive} />
                          </span>
                        </td>
                        <td>
                          <Badge kind={LEVEL_BADGE[emp.accessLevel] ?? 'b-submit'}>
                            {LEVEL_LABEL[emp.accessLevel] ?? emp.accessLevel}
                          </Badge>
                        </td>
                        <td className="muted att-dur">
                          {new Date(emp.joinedAt).toLocaleDateString('ko-KR')}
                        </td>
                        <td>
                          {primary}
                          {others > 0 && <span className="cell-sub">외 {others}</span>}
                        </td>
                        <td className="muted">{formatPosition(emp)}</td>
                        {tab === 'work' ? (
                          <>
                            <td className="muted">
                              {EMPLOYMENT_TYPE_LABEL[emp.employmentType] ?? emp.employmentType}
                            </td>
                            <td className="muted att-dur">{emp.employeeNumber ?? <span className="zero">—</span>}</td>
                          </>
                        ) : (
                          <>
                            <td className="c">
                              {emp.isActive ? (
                                <span style={{ color: 'var(--ok)' }}>재직</span>
                              ) : (
                                <span className="zero">퇴사</span>
                              )}
                            </td>
                            <td className="muted" style={{ fontSize: 12 }}>
                              {emp.user?.email ?? '—'}
                              {!emp.isActive && canManage && (
                                <button
                                  className="btn btn-line btn-sm"
                                  style={{ marginLeft: 12 }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setActivateTarget(emp)
                                  }}
                                >
                                  재활성화
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="tbl-bar" style={{ marginTop: 16 }}>
            <button
              className="btn btn-line btn-sm"
              disabled={!someOn}
              onClick={() => {
                handleExport(employees.filter((e) => checked[e.id]))
                setChecked({})
              }}
            >
              선택 직원 내보내기
            </button>
            <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>
              {someOn ? `${selectedIds.length}명 선택됨` : ''}
            </span>
          </div>

          <Pager page={page} totalPages={totalPages} onChange={(p) => { setPage(p); setChecked({}) }} />
        </>
      )}

      {/* 직원 추가 Dialog (react-hook-form/zod 검증 유지) */}
      {createOpen && (
        <EmployeeCreateDialog
          open={createOpen}
          loading={createMutation.isPending}
          onSubmit={handleCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {/* 재활성화 Confirm */}
      <ConfirmDialog
        open={!!activateTarget}
        title="직원 재활성화"
        message={`${activateTarget?.name} 직원을 재활성화하시겠습니까? 재직 상태로 전환되고 퇴사일이 초기화됩니다.`}
        confirmLabel="재활성화"
        onConfirm={handleActivate}
        onCancel={() => setActivateTarget(null)}
      />
    </div>
  )
}
