'use client'
import PageHeader from '@/components/common/PageHeader'
import OrganizationsPanel from './OrganizationsPanel'

export default function OrganizationsPage() {
  return (
    <>
      <PageHeader title="조직 관리" />
      <OrganizationsPanel />
    </>
  )
}
