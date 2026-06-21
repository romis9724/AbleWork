'use client'
import { PageHead } from '@/components/ab/Page'
import PositionsPanel from './PositionsPanel'

export default function PositionsPage() {
  return (
    <>
      <PageHead eyebrow="Positions" title="직무 관리" />
      <PositionsPanel />
    </>
  )
}
