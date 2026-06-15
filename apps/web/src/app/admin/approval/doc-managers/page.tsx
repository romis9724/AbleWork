/**
 * AB 전자결재 — 문서 담당 관리 (핸드오프 screens2.jsx DocOwners 네이티브 재구축).
 * .split 2-pane: 좌 조직(.pane, useOrganizations 평면) + 우 검색/구성원(.tbl)·담당자 설정 <Toggle>.
 * 데이터/로직은 기존 org doc-manager 훅(useOrgDocManagers/useSetOrgDocManagers) 보존.
 * API는 전체 employeeIds[] PATCH 방식이므로, 토글마다 현재 담당자 목록을 재구성해 저장한다.
 */
'use client'
import { useEffect, useMemo, useState } from 'react'
import { PageHead } from '@/components/ab/Page'
import { Toggle, TextInput, TableEmpty } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
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

/** 조직 트리를 깊이 들여쓰기용 평면 배열로 변환 */
function flatten(nodes: Organization[], depth = 0, acc: FlatOrg[] = []): FlatOrg[] {
  for (const n of nodes) {
    acc.push({ id: n.id, name: n.name, depth })
    if (n.children?.length) flatten(n.children, depth + 1, acc)
  }
  return acc
}

export default function DocManagersPage() {
  const toast = useToast()
  const { data: orgTree = [], isLoading: orgLoading } = useOrganizations()
  const { data: employeeData } = useEmployees({ limit: 500, isActive: true })
  const setManagers = useSetOrgDocManagers()

  const flatOrgs = useMemo(() => flatten(orgTree), [orgTree])
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // 최초 로드 시 첫 조직 자동 선택
  useEffect(() => {
    if (!selectedOrgId && flatOrgs.length) setSelectedOrgId(flatOrgs[0].id)
  }, [flatOrgs, selectedOrgId])

  const { data: managers, isLoading: mgrLoading } = useOrgDocManagers(selectedOrgId)
  const selectedOrg = flatOrgs.find((o) => o.id === selectedOrgId)

  // 선택 부서 소속 구성원 (검색 필터 적용)
  const members = useMemo(() => {
    if (!selectedOrgId) return []
    const all = (employeeData?.items ?? []).filter((e) =>
      (e.organizations ?? []).some((link) => link.organization.id === selectedOrgId),
    )
    const q = search.trim()
    return q ? all.filter((e) => e.name.includes(q)) : all
  }, [employeeData, selectedOrgId, search])

  // 현재 담당자 id 집합 (순서 유지)
  const managerIds = useMemo(() => (managers ?? []).map((m) => m.employeeId), [managers])
  const managerSet = useMemo(() => new Set(managerIds), [managerIds])

  const handleToggle = (employeeId: string, next: boolean) => {
    if (!selectedOrgId) return
    // 전체 담당자 목록을 재구성 (순서 유지: 기존 목록 + 신규 추가 / 해제 시 제거)
    const nextIds = next
      ? [...managerIds, employeeId]
      : managerIds.filter((id) => id !== employeeId)
    setManagers.mutate(
      { orgId: selectedOrgId, employeeIds: nextIds },
      {
        onSuccess: () => toast(next ? '담당자로 설정했습니다.' : '담당자를 해지했습니다.'),
        onError: (err) => toast(getApiErrorMessage(err, '저장에 실패했습니다.')),
      },
    )
  }

  const empSubLabel = (orgName: string, position?: string) =>
    position ? `${orgName} · ${position}` : orgName

  return (
    <>
      <PageHead eyebrow="Document Owners" title="문서 담당 관리" />

      {orgLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className="split">
          {/* 좌: 조직 목록 */}
          <div className="pane">
            <div className="pane-head"><span className="dot" /><span className="t">조직도</span></div>
            <div className="pane-list">
              {flatOrgs.map((o) => (
                <div
                  key={o.id}
                  className={'pane-li' + (selectedOrgId === o.id ? ' on' : '')}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedOrgId === o.id}
                  onClick={() => setSelectedOrgId(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedOrgId(o.id)
                    }
                  }}
                >
                  <span style={{ paddingLeft: o.depth * 14 }}>{o.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 우: 구성원 담당자 설정 */}
          <div>
            <div className="note">
              <div className="note-t">Notice</div>
              <ul>
                <li>부서별 전자결재 문서담당자를 지정합니다.</li>
                <li>부서협조·부서수신 결재는 지정된 담당자 누구나 처리할 수 있습니다.</li>
                <li>맨 앞 담당자가 대표(상신 시 1차 배정 대상)입니다.</li>
              </ul>
            </div>

            <div className="filter" style={{ padding: '20px 24px', marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <label style={{ fontSize: 13, color: 'var(--fg-3)', flex: '0 0 auto' }}>검색</label>
                <TextInput placeholder="ID 또는 이름 입력" icon={I.search()} value={searchInput} onChange={setSearchInput} />
                <button
                  className="btn btn-primary btn-sm"
                  style={{ flex: '0 0 auto', padding: '10px 28px' }}
                  onClick={() => setSearch(searchInput)}
                >
                  조회
                </button>
              </div>
            </div>

            {!selectedOrg ? (
              <div className="tbl-empty">조직을 선택하세요.</div>
            ) : mgrLoading ? (
              <div className="ab-loading">
                <span className="ab-spin" />
                불러오는 중…
              </div>
            ) : (
              <>
                <div className="tbl-bar">
                  <span className="tbl-count">구성원 <b>{members.length}</b>명</span>
                </div>
                <div className="tbl-scroll">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>구성원</th>
                        <th style={{ width: 200 }} className="c">담당자 설정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.length === 0 ? (
                        <TableEmpty colSpan={2} message="해당 조직의 구성원이 없습니다." />
                      ) : (
                        members.map((emp) => {
                          const position = emp.positions?.[0]?.position?.name
                          return (
                            <tr key={emp.id}>
                              <td className="lead">
                                {emp.name}
                                <span className="cell-sub"> · {empSubLabel(selectedOrg.name, position)}</span>
                              </td>
                              <td className="c">
                                <div style={{ display: 'inline-flex', justifyContent: 'flex-end', width: '100%' }}>
                                  <Toggle
                                    on={managerSet.has(emp.id)}
                                    onChange={(v) => handleToggle(emp.id, v)}
                                    label="담당자 설정"
                                  />
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
