import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. 테스트 회사 생성
  const company = await prisma.company.upsert({
    where: { id: 'seed-company-001' },
    update: {},
    create: {
      id: 'seed-company-001',
      name: 'AbleWork 테스트 회사',
      timezone: 'Asia/Seoul',
      locale: 'ko',
      countryCode: 'KR',
    },
  })
  console.log('✅ Company:', company.name)

  // 2. 최고관리자 계정 생성
  const adminHash = await bcrypt.hash('admin1234!', 10)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ablework.io' },
    update: {},
    create: {
      id: 'seed-user-admin',
      email: 'admin@ablework.io',
      passwordHash: adminHash,
      name: '최고관리자',
      timezone: 'Asia/Seoul',
    },
  })

  await prisma.employee.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      id: 'seed-emp-admin',
      companyId: company.id,
      userId: adminUser.id,
      name: '최고관리자',
      joinedAt: new Date('2024-01-01'),
      employmentType: 'regular',
      accessLevel: 'SUPER_ADMIN',
    },
  })
  console.log('✅ Admin user:', adminUser.email)

  // 3. 일반 직원 계정
  const empHash = await bcrypt.hash('employee1234!', 10)
  const empUser = await prisma.user.upsert({
    where: { email: 'employee@ablework.io' },
    update: {},
    create: {
      id: 'seed-user-emp',
      email: 'employee@ablework.io',
      passwordHash: empHash,
      name: '홍길동',
      timezone: 'Asia/Seoul',
    },
  })

  // 4. 조직 생성
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org-dev' },
    update: {},
    create: {
      id: 'seed-org-dev',
      companyId: company.id,
      name: '개발팀',
      depth: 0,
      sortOrder: 1,
    },
  })

  await prisma.employee.upsert({
    where: { userId: empUser.id },
    update: {},
    create: {
      id: 'seed-emp-001',
      companyId: company.id,
      userId: empUser.id,
      name: '홍길동',
      joinedAt: new Date('2024-03-01'),
      employmentType: 'regular',
      accessLevel: 'EMPLOYEE',
    },
  })

  await prisma.employeeOrganization.upsert({
    where: { employeeId_organizationId: { employeeId: 'seed-emp-001', organizationId: org.id } },
    update: {},
    create: { employeeId: 'seed-emp-001', organizationId: org.id, isPrimary: true },
  })
  console.log('✅ Organization:', org.name)

  // 5. 기본 근무일정 유형
  const shiftType = await prisma.shiftType.upsert({
    where: { id: 'seed-shift-type-regular' },
    update: {},
    create: {
      id: 'seed-shift-type-regular',
      companyId: company.id,
      name: '일반근로',
      category: 'REGULAR',
      color: '#2196f3',
    },
  })
  console.log('✅ ShiftType:', shiftType.name)

  // 6. 근무일정 템플릿
  await prisma.shiftTemplate.upsert({
    where: { id: 'seed-template-9to6' },
    update: {},
    create: {
      id: 'seed-template-9to6',
      companyId: company.id,
      shiftTypeId: shiftType.id,
      name: '9시-18시',
      startTime: new Date('1970-01-01T09:00:00'),
      endTime: new Date('1970-01-01T18:00:00'),
    },
  })

  // 7. 기본 휴가 그룹 & 유형
  const leaveGroup = await prisma.leaveGroup.upsert({
    where: { id: 'seed-leave-group-annual' },
    update: {},
    create: {
      id: 'seed-leave-group-annual',
      companyId: company.id,
      name: '연차',
      code: 'ANNUAL',
    },
  })

  await prisma.leaveType.upsert({
    where: { id: 'seed-leave-type-annual' },
    update: {},
    create: {
      id: 'seed-leave-type-annual',
      groupId: leaveGroup.id,
      name: '연차',
      displayName: '연차',
      timeOption: 'full_day',
      deductionDays: 1,
    },
  })
  console.log('✅ LeaveGroup:', leaveGroup.name)

  // 8. 회사 기본 설정
  const defaultSettings = [
    { section: 'attendance', key: 'late_grace_minutes', value: 0 },
    { section: 'attendance', key: 'clockin_before_shift_minutes', value: 30 },
    { section: 'attendance', key: 'oncall_policy', value: 'if_no_shift' },
    { section: 'shift', key: 'enable_confirmation', value: true },
    { section: 'general', key: 'week_start_day', value: 1 },
    { section: 'general', key: 'time_format', value: '24h' },
    { section: 'general', key: 'night_work_start', value: '22:00' },
    { section: 'general', key: 'night_work_end', value: '06:00' },
  ]

  for (const s of defaultSettings) {
    await prisma.companySetting.upsert({
      where: { companyId_section_key: { companyId: company.id, section: s.section, key: s.key } },
      update: {},
      create: { companyId: company.id, section: s.section, key: s.key, value: s.value },
    })
  }
  console.log('✅ Company settings seeded')

  // 9. 기본 알림 규칙 (Discord mock URL)
  await prisma.notificationRule.upsert({
    where: { id: 'seed-notif-clock-in' },
    update: {},
    create: {
      id: 'seed-notif-clock-in',
      companyId: company.id,
      eventType: 'attendance.clock_in',
      channelType: 'discord',
      webhookUrl: 'https://discord.com/api/webhooks/test/mock',
      isActive: false, // 개발 환경에서는 비활성
    },
  })

  console.log('\n✅ Seed completed!')
  console.log('─────────────────────────────────')
  console.log('관리자: admin@ablework.io / admin1234!')
  console.log('직원:   employee@ablework.io / employee1234!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
