'use client'
import PageHeader from '@/components/common/PageHeader'
import NotificationsPanel from './NotificationsPanel'

export default function NotificationsSettingsPage() {
  return (
    <>
      <PageHeader title="Discord 알림 설정" />
      <NotificationsPanel />
    </>
  )
}
