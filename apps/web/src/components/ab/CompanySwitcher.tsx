'use client'
import { useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import ListSubheader from '@mui/material/ListSubheader'
import { useAuthStore } from '@/stores/auth.store'
import { usePermission } from '@/hooks/usePermission'
import { useToast } from './Toast'
import { useMyCompanies, useSwitchCompany } from '@/lib/query/auth'
import { parseJwt, writeAuthCookies } from '@/lib/auth-session'
import { getApiErrorMessage } from '@/lib/api-error'

/**
 * 회사 전환 스위처 — 헤더 공용(ThemeSwitcher 패턴).
 * 내 소속 회사 목록을 보여주고, 선택 시 토큰을 재발급받아 활성 회사를 전환한다.
 * SUPER_ADMIN에게는 "회사 추가" 진입점을 노출한다.
 * 전환할 회사가 없고 추가 권한도 없으면 렌더하지 않는다.
 */

function BuildingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="11" height="18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15 8h5v13h-5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 7h4M7.5 11h4M7.5 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  )
}

export function CompanySwitcher({ className = 'hd-lang' }: { className?: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const { isSuperAdmin } = usePermission()
  const { data: companies = [] } = useMyCompanies(Boolean(user))
  const switchCompany = useSwitchCompany()

  const [anchor, setAnchor] = useState<null | HTMLElement>(null)
  const open = Boolean(anchor)

  const current = companies.find((c) => c.isCurrent)
  const currentLabel = current?.companyName ?? user?.name ?? '회사'

  // 전환 대상이 1개뿐이고 추가 권한도 없으면 스위처를 숨긴다.
  if (companies.length <= 1 && !isSuperAdmin) return null

  const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)
  const handleClose = () => setAnchor(null)

  const handleSwitch = async (companyId: string) => {
    handleClose()
    if (companyId === user?.companyId || switchCompany.isPending) return
    try {
      const { accessToken, refreshToken } = await switchCompany.mutateAsync(companyId)
      writeAuthCookies(accessToken, refreshToken)
      const claims = parseJwt(accessToken)
      setUser({
        userId: claims.sub,
        employeeId: claims.employeeId,
        companyId: claims.companyId,
        accessLevel: claims.accessLevel,
        name: user?.name,
      })
      // 이전 회사 데이터가 잔존하지 않도록 전체 캐시를 비운다.
      qc.clear()
      router.push('/admin/dashboard')
      router.refresh()
    } catch (e) {
      toast(getApiErrorMessage(e, '회사 전환에 실패했습니다.'))
    }
  }

  const handleAdd = () => {
    handleClose()
    router.push('/admin/settings/company/add')
  }

  return (
    <>
      <div
        className={className}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="회사 전환"
        title="회사 전환"
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpen(e as unknown as MouseEvent<HTMLElement>)
          }
        }}
      >
        <BuildingIcon />
        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentLabel}
        </span>
      </div>

      <Menu
        anchorEl={anchor}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
      >
        <ListSubheader
          disableSticky
          sx={{
            bgcolor: 'transparent',
            color: 'var(--fg-5)',
            fontFamily: 'var(--font-display)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            lineHeight: '28px',
          }}
        >
          회사 전환
        </ListSubheader>
        {companies.map((c) => (
          <MenuItem
            key={c.companyId}
            selected={c.isCurrent}
            onClick={() => handleSwitch(c.companyId)}
            sx={{ gap: 1.25, py: 1, fontSize: 13 }}
          >
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.companyName}
            </span>
            {c.isCurrent && (
              <span style={{ color: 'var(--ab-orange)', display: 'inline-flex' }}>
                <CheckIcon />
              </span>
            )}
          </MenuItem>
        ))}
        {isSuperAdmin && [
          <Divider key="div" sx={{ my: 0.5 }} />,
          <MenuItem key="add" onClick={handleAdd} sx={{ gap: 1, py: 1, fontSize: 13, color: 'var(--ab-orange)' }}>
            <span style={{ fontWeight: 700 }}>＋</span>
            <span>회사 추가</span>
          </MenuItem>,
        ]}
      </Menu>
    </>
  )
}
