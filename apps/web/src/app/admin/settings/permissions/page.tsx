'use client'
import PageHeader from '@/components/common/PageHeader'
import PermissionsPanel from './PermissionsPanel'

export default function PermissionsSettingsPage() {
  return (
    <>
      <PageHeader title="권한 설정" />
      <PermissionsPanel />
    </>
  )
}
