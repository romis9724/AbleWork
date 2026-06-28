'use client'
import { PageHead } from '@/components/ab/Page'
import TimeclockAreasPanel from './TimeclockAreasPanel'

// 출퇴근 장소 관리는 회사 설정 > 출퇴근 섹션에 통합되어 있으나,
// 직접 경로(/admin/timeclock-areas) 접근 시에도 동일 패널을 보여준다.
export default function TimeclockAreasPage() {
  return (
    <>
      <PageHead eyebrow="Timeclock" title="출퇴근 장소" />
      <TimeclockAreasPanel />
    </>
  )
}
