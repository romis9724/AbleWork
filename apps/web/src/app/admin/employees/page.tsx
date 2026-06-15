'use client'
import { PageHead } from '@/components/ab/Page'
import EmployeesPanel from './EmployeesPanel'

export default function EmployeesPage() {
  return (
    <>
      <PageHead eyebrow="Employees" title="직원 관리" />
      <EmployeesPanel />
    </>
  )
}
