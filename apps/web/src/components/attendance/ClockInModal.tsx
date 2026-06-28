'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ab/Modal'
import { useToast } from '@/components/ab/Toast'
import { getApiErrorMessage } from '@/lib/api-error'
import { useEmployee } from '@/lib/query/employees'
import { useTimeclockAreas, type TimeclockArea, type AuthMethod } from '@/lib/query/timeclock-areas'
import { useClockIn, type ClockInPayload } from '@/lib/query/attendances'

interface ClockInModalProps {
  open: boolean
  /** 로그인 직원 ID — 본인 소속 조직/직무를 불러온다 */
  employeeId: string
  onClose: () => void
  onSuccess?: () => void
}

/** 웹에서 사용 가능한 인증 방식 (WiFi 필수 장소는 앱 전용) */
const WEB_AUTH_METHODS: AuthMethod[] = ['gps', 'gps_or_wifi', 'none']
/** GPS 좌표가 필요한(반경 검증) 인증 방식 */
const GPS_AUTH_METHODS: AuthMethod[] = ['gps', 'gps_or_wifi', 'gps_and_wifi']

const AUTH_SHORT: Record<AuthMethod, string> = {
  gps: 'GPS',
  wifi: 'WiFi',
  gps_or_wifi: 'GPS/WiFi',
  gps_and_wifi: 'GPS+WiFi',
  none: '인증 없음',
}

const isAppOnly = (m: AuthMethod): boolean => m === 'wifi' || m === 'gps_and_wifi'

/** 두 좌표 간 거리(m) — haversine */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-3)', fontWeight: 500, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

interface Coords {
  lat: number
  lng: number
  accuracy: number
}

/**
 * 출근 모달 — 조직·출퇴근 장소·직무를 선택하고 현재 위치를 확인해 출근한다.
 *
 * - 조직: 본인 소속 조직만 노출 (기본 = 주 소속)
 * - 출퇴근 장소: 선택 조직의 장소만. WiFi 필수 장소(wifi/gps_and_wifi)는 "앱 전용"으로 비활성
 * - 직무: 본인 직무 (선택)
 * - 위치: GPS 필수 장소 선택 시 현재 위치 확인 필수, 반경 밖이면 사전 경고(최종 검증은 서버)
 */
export function ClockInModal({ open, employeeId, onClose, onSuccess }: ClockInModalProps) {
  const toast = useToast()
  const { data: employee } = useEmployee(employeeId)
  const clockIn = useClockIn()

  const orgs = useMemo(
    () => (employee?.organizations ?? []).map((o) => ({ ...o.organization, isPrimary: o.isPrimary })),
    [employee],
  )
  const positions = useMemo(
    () => (employee?.positions ?? []).map((p) => p.position),
    [employee],
  )

  const [orgId, setOrgId] = useState('')
  const [areaId, setAreaId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [coords, setCoords] = useState<Coords | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')

  const { data: areas = [] } = useTimeclockAreas(orgId || undefined)

  // 모달 열릴 때 기본값(주 소속 조직·첫 직무) 세팅 + 위치 확인 시작
  useEffect(() => {
    if (!open) {
      setAreaId('')
      setCoords(null)
      setLocError('')
      return
    }
    const primary = orgs.find((o) => o.isPrimary) ?? orgs[0]
    setOrgId((prev) => prev || primary?.id || '')
    setPositionId((prev) => prev || positions[0]?.id || '')
    void requestLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgs.length, positions.length])

  // 조직 변경 시 장소 선택 초기화
  useEffect(() => {
    setAreaId('')
  }, [orgId])

  const requestLocation = async (): Promise<void> => {
    if (!navigator.geolocation) {
      setLocError('이 기기에서는 위치 서비스를 사용할 수 없습니다')
      return
    }
    setLocating(true)
    setLocError('')
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10_000,
        }),
      )
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      })
    } catch {
      setLocError('위치 정보를 가져오지 못했습니다. 권한을 허용한 뒤 다시 시도해 주세요')
    } finally {
      setLocating(false)
    }
  }

  // 웹 노출 가능 장소만 + 앱 전용 표시
  const selectableAreas: (TimeclockArea & { appOnly: boolean })[] = areas.map((a) => ({
    ...a,
    appOnly: isAppOnly(a.authMethod),
  }))
  const selectedArea = areas.find((a) => a.id === areaId) ?? null
  const needsGps = selectedArea ? GPS_AUTH_METHODS.includes(selectedArea.authMethod) : false

  // 선택 장소까지 거리(사전 경고용)
  const distanceInfo = useMemo(() => {
    if (!selectedArea || !coords) return null
    if (selectedArea.locationLat == null || selectedArea.locationLng == null) return null
    const d = Math.round(
      distanceMeters(coords.lat, coords.lng, Number(selectedArea.locationLat), Number(selectedArea.locationLng)),
    )
    const radius = selectedArea.locationRadiusMeters ?? 0
    return { distance: d, radius, outOfRange: radius > 0 && d > radius }
  }, [selectedArea, coords])

  const canSubmit =
    !!orgId &&
    !clockIn.isPending &&
    (!needsGps || !!coords)

  const handleSubmit = async (): Promise<void> => {
    if (!orgId) return toast('조직을 선택해 주세요')
    if (selectedArea && WEB_AUTH_METHODS.indexOf(selectedArea.authMethod) === -1) {
      return toast('WiFi 인증 장소는 모바일 앱에서만 출근할 수 있습니다')
    }
    if (needsGps && !coords) {
      return toast('현재 위치를 확인한 뒤 출근해 주세요')
    }
    if (distanceInfo?.outOfRange) {
      return toast(`선택한 장소 반경(${distanceInfo.radius}m)을 벗어났습니다. 장소에서 다시 시도해 주세요`)
    }

    const method = selectedArea?.authMethod === 'none' ? 'web' : coords ? 'gps' : 'web'
    const payload: ClockInPayload = {
      method,
      channel: 'web',
      organizationId: orgId,
      ...(areaId && { timeclockAreaId: areaId }),
      ...(positionId && { positionId }),
      ...(coords && { lat: coords.lat, lng: coords.lng }),
    }

    try {
      await clockIn.mutateAsync(payload)
      toast('출근 기록이 완료됐습니다')
      onClose()
      onSuccess?.()
    } catch (err) {
      toast(getApiErrorMessage(err, '출근 처리 중 오류가 발생했습니다'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Clock In"
      title="출근하기"
      maxWidth={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button
            data-testid="clockin-submit-btn"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {clockIn.isPending ? '처리 중…' : '출근'}
          </button>
        </>
      }
    >
      <div style={{ padding: '20px 24px' }}>
        <Field label="조직">
          <select
            data-testid="clockin-org"
            className="sel"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {orgs.length === 0 && <option value="">소속 조직 없음</option>}
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}{o.isPrimary ? ' (주 소속)' : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="출퇴근 장소">
          <select
            data-testid="clockin-area"
            className="sel"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
          >
            <option value="">장소 선택 안 함</option>
            {selectableAreas.map((a) => (
              <option key={a.id} value={a.id} disabled={a.appOnly}>
                {a.name} · {AUTH_SHORT[a.authMethod]}{a.appOnly ? ' (앱 전용)' : ''}
              </option>
            ))}
          </select>
          {areas.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fg-5)', marginTop: 6 }}>
              이 조직에 등록된 출퇴근 장소가 없습니다. 장소 없이 출근할 수 있습니다.
            </div>
          )}
        </Field>

        {positions.length > 0 && (
          <Field label="직무">
            <select
              data-testid="clockin-position"
              className="sel"
              value={positionId}
              onChange={(e) => setPositionId(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}

        {/* 위치 상태 */}
        <div className="note" style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>
              {locating
                ? '현재 위치 확인 중…'
                : coords
                  ? `위치 확인됨 (정확도 ±${coords.accuracy}m)`
                  : '위치 미확인'}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={locating}
              onClick={() => void requestLocation()}
            >
              {locating ? '확인 중…' : '위치 다시 확인'}
            </button>
          </div>
          {locError && (
            <div style={{ color: 'var(--danger, #e5484d)', marginTop: 6 }}>{locError}</div>
          )}
          {distanceInfo && (
            <div
              style={{
                marginTop: 6,
                color: distanceInfo.outOfRange ? 'var(--danger, #e5484d)' : 'var(--fg-4)',
              }}
            >
              선택 장소까지 약 <b className="tek">{distanceInfo.distance}m</b>
              {distanceInfo.radius > 0 && <> · 허용 반경 {distanceInfo.radius}m</>}
              {distanceInfo.outOfRange && ' · 반경을 벗어났습니다'}
            </div>
          )}
          {needsGps && !coords && !locating && (
            <div style={{ color: 'var(--fg-5)', marginTop: 6 }}>
              이 장소는 GPS 위치 확인이 필요합니다.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
