import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 0. 그룹 생성 (멀티컴퍼니 — 회사 묶음 컨테이너)
  const group = await prisma.group.upsert({
    where: { id: 'seed-group-001' },
    update: {},
    create: {
      id: 'seed-group-001',
      name: 'AbleWork 테스트 그룹',
    },
  })
  console.log('✅ Group:', group.name)

  // 1. 테스트 회사 생성
  const company = await prisma.company.upsert({
    where: { id: 'seed-company-001' },
    update: {},
    create: {
      id: 'seed-company-001',
      groupId: group.id,
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
    where: { id: 'seed-emp-admin' },
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

  // 2-1. 멀티컴퍼니 데모: 같은 그룹의 2번째 회사 + 관리자 멤버십
  const company2 = await prisma.company.upsert({
    where: { id: 'seed-company-002' },
    update: {},
    create: {
      id: 'seed-company-002',
      groupId: group.id,
      name: 'AbleWork 2호점',
      timezone: 'Asia/Seoul',
      locale: 'ko',
      countryCode: 'KR',
    },
  })
  await prisma.employee.upsert({
    where: { id: 'seed-emp-admin-co2' },
    update: {},
    create: {
      id: 'seed-emp-admin-co2',
      companyId: company2.id,
      userId: adminUser.id,
      name: '최고관리자',
      joinedAt: new Date('2024-01-01'),
      employmentType: 'regular',
      accessLevel: 'SUPER_ADMIN',
    },
  })
  console.log('✅ Company 2 (multi-company demo):', company2.name)

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
    where: { id: 'seed-emp-001' },
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

  // 4-1. 제2 조직 — 영업팀
  const salesOrg = await prisma.organization.upsert({
    where: { id: 'seed-org-sales' },
    update: {},
    create: {
      id: 'seed-org-sales',
      companyId: company.id,
      name: '영업팀',
      depth: 0,
      sortOrder: 2,
    },
  })
  console.log('✅ Organization:', salesOrg.name)

  // 4-2. 조직관리자 (ORG_ADMIN) — 개발팀 소속 + 개발팀 결재자
  const orgAdminHash = await bcrypt.hash('orgadmin1234!', 10)
  const orgAdminUser = await prisma.user.upsert({
    where: { email: 'orgadmin@ablework.io' },
    update: {},
    create: {
      id: 'seed-user-orgadmin',
      email: 'orgadmin@ablework.io',
      passwordHash: orgAdminHash,
      name: '김조직',
      timezone: 'Asia/Seoul',
    },
  })

  await prisma.employee.upsert({
    where: { id: 'seed-emp-orgadmin' },
    update: {},
    create: {
      id: 'seed-emp-orgadmin',
      companyId: company.id,
      userId: orgAdminUser.id,
      name: '김조직',
      joinedAt: new Date('2024-02-01'),
      employmentType: 'regular',
      accessLevel: 'ORG_ADMIN',
    },
  })

  await prisma.employeeOrganization.upsert({
    where: {
      employeeId_organizationId: { employeeId: 'seed-emp-orgadmin', organizationId: org.id },
    },
    update: { isPrimary: true },
    create: { employeeId: 'seed-emp-orgadmin', organizationId: org.id, isPrimary: true },
  })

  // 개발팀의 결재자(approverId)로 지정
  await prisma.organization.update({
    where: { id: org.id },
    data: { approverId: 'seed-emp-orgadmin' },
  })
  console.log('✅ Org admin user:', orgAdminUser.email, '(개발팀 결재자)')

  // 4-3. 영업팀 직원 (EMPLOYEE)
  const salesHash = await bcrypt.hash('sales1234!', 10)
  const salesUser = await prisma.user.upsert({
    where: { email: 'sales@ablework.io' },
    update: {},
    create: {
      id: 'seed-user-sales',
      email: 'sales@ablework.io',
      passwordHash: salesHash,
      name: '박영업',
      timezone: 'Asia/Seoul',
    },
  })

  await prisma.employee.upsert({
    where: { id: 'seed-emp-sales' },
    update: {},
    create: {
      id: 'seed-emp-sales',
      companyId: company.id,
      userId: salesUser.id,
      name: '박영업',
      joinedAt: new Date('2024-04-01'),
      employmentType: 'regular',
      accessLevel: 'EMPLOYEE',
    },
  })

  await prisma.employeeOrganization.upsert({
    where: {
      employeeId_organizationId: { employeeId: 'seed-emp-sales', organizationId: salesOrg.id },
    },
    update: { isPrimary: true },
    create: { employeeId: 'seed-emp-sales', organizationId: salesOrg.id, isPrimary: true },
  })
  console.log('✅ Sales employee:', salesUser.email)

  // 4-4. 일반관리자 (GENERAL_ADMIN) — 회사 전체 관리 (권한 4단계 전수 점검용)
  const genAdminHash = await bcrypt.hash('genadmin1234!', 10)
  const genAdminUser = await prisma.user.upsert({
    where: { email: 'genadmin@ablework.io' },
    update: {},
    create: {
      id: 'seed-user-genadmin',
      email: 'genadmin@ablework.io',
      passwordHash: genAdminHash,
      name: '이총무',
      timezone: 'Asia/Seoul',
    },
  })

  await prisma.employee.upsert({
    where: { id: 'seed-emp-genadmin' },
    update: {},
    create: {
      id: 'seed-emp-genadmin',
      companyId: company.id,
      userId: genAdminUser.id,
      name: '이총무',
      joinedAt: new Date('2024-01-15'),
      employmentType: 'regular',
      accessLevel: 'GENERAL_ADMIN',
    },
  })

  await prisma.employeeOrganization.upsert({
    where: {
      employeeId_organizationId: { employeeId: 'seed-emp-genadmin', organizationId: org.id },
    },
    update: { isPrimary: true },
    create: { employeeId: 'seed-emp-genadmin', organizationId: org.id, isPrimary: true },
  })
  console.log('✅ General admin user:', genAdminUser.email)

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

  // 7-1. 휴가 잔액 (현재 연도 — 연차 15일)
  const currentYear = new Date().getFullYear()
  for (const empId of ['seed-emp-001', 'seed-emp-admin', 'seed-emp-orgadmin', 'seed-emp-sales']) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: empId,
          leaveTypeId: 'seed-leave-type-annual',
          year: currentYear,
        },
      },
      update: {},
      create: {
        employeeId: empId,
        leaveTypeId: 'seed-leave-type-annual',
        year: currentYear,
        accruedDays: 15,
        usedDays: 0,
        remainingDays: 15,
      },
    })
  }
  console.log('✅ Leave balances seeded (연차 15일)')

  // 8. 회사 기본 설정 (키/기본값은 company-settings.service.ts SETTING_DEFAULTS와 일치 유지)
  const defaultSettings = [
    { section: 'attendance', key: 'late_grace_minutes', value: 10 },
    { section: 'attendance', key: 'clockin_before_shift_minutes', value: 30 },
    { section: 'attendance', key: 'allow_unscheduled', value: 'if_no_shift' },
    { section: 'attendance', key: 'pc_timeclock_enabled', value: true },
    { section: 'attendance', key: 'enable_confirmation', value: true },
    { section: 'shift', key: 'enable_confirmation', value: true },
    { section: 'shift', key: 'template_code_enabled', value: false },
    { section: 'shift', key: 'deemed_work_enabled', value: false },
    { section: 'break', key: 'auto_break_enabled', value: false },
    { section: 'break', key: 'shift_break_enabled', value: false },
    { section: 'general', key: 'week_start_day', value: 'monday' },
    { section: 'general', key: 'time_format', value: '24h' },
    { section: 'general', key: 'night_work_start', value: '22:00' },
    { section: 'general', key: 'night_work_end', value: '06:00' },
  ]

  for (const s of defaultSettings) {
    await prisma.companySetting.upsert({
      where: { companyId_section_key: { companyId: company.id, section: s.section, key: s.key } },
      update: { value: s.value },
      create: { companyId: company.id, section: s.section, key: s.key, value: s.value },
    })
  }
  console.log('✅ Company settings seeded')

  // 8-1. 기안 양식 (요청 → 전자결재 자동 연동의 전제 — REQUEST_TYPE_CATEGORY_MAP과 일치)
  const documentForms = [
    { id: 'seed-form-leave', name: '휴가 신청서', category: 'leave_request' },
    { id: 'seed-form-shift', name: '근무일정 변경 신청서', category: 'shift_change_request' },
    { id: 'seed-form-attendance', name: '출퇴근 정정 신청서', category: 'attendance_correction_request' },
    { id: 'seed-form-device', name: '기기 변경 신청서', category: 'device_change_request' },
    { id: 'seed-form-offsite', name: '근무지 외 근무 신청서', category: 'offsite_work_request' },
    { id: 'seed-form-custom', name: '일반 기안서', category: 'custom_request' },
  ]

  for (const f of documentForms) {
    await prisma.documentForm.upsert({
      where: { id: f.id },
      update: { name: f.name, category: f.category, isActive: true },
      create: {
        id: f.id,
        companyId: company.id,
        name: f.name,
        category: f.category,
        fieldsSchema: {},
        isActive: true,
      },
    })
  }
  console.log('✅ Document forms seeded:', documentForms.length)

  // 8-2. 기본 승인 규칙 (1차 결재 — 승인자 직무 미지정 시 관리자 fallback)
  const approvalRules = [
    { id: 'seed-rule-leave-create', name: '휴가 신청 기본 결재', requestType: 'LEAVE_CREATE' },
    { id: 'seed-rule-shift-create', name: '근무일정 신청 기본 결재', requestType: 'SHIFT_CREATE' },
    { id: 'seed-rule-attendance-edit', name: '출퇴근 정정 기본 결재', requestType: 'ATTENDANCE_EDIT' },
  ]

  for (const r of approvalRules) {
    await prisma.approvalRule.upsert({
      where: { id: r.id },
      update: { isActive: true },
      create: {
        id: r.id,
        companyId: company.id,
        name: r.name,
        requestType: r.requestType,
        priority: 0,
        maxApprovalRounds: 1,
        isAutoApprove: false,
        isActive: true,
        details: {
          create: [{ round: 1, requiredCount: 1, sortOrder: 0 }],
        },
      },
    })
  }
  console.log('✅ Approval rules seeded:', approvalRules.length)

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

  // 9-1. 전자결재 알림 규칙 (Discord mock URL — 개발 환경 비활성)
  const documentNotificationRules = [
    { id: 'seed-notif-doc-submitted', eventType: 'document.submitted' },
    { id: 'seed-notif-doc-approved', eventType: 'document.approved' },
  ]

  for (const rule of documentNotificationRules) {
    await prisma.notificationRule.upsert({
      where: { id: rule.id },
      update: {},
      create: {
        id: rule.id,
        companyId: company.id,
        eventType: rule.eventType,
        channelType: 'discord',
        webhookUrl: 'https://discord.com/api/webhooks/test/mock',
        isActive: false, // 개발 환경에서는 비활성
      },
    })
  }
  console.log('✅ Document notification rules seeded:', documentNotificationRules.length)

  // 17. 감사 로그 샘플 (멱등 — id 고정으로 upsert)
  const now = Date.now()
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  const auditLogs: Array<{
    id: string
    actorId: string | null
    actorName: string
    action: string
    targetType: string
    targetId: string | null
    targetLabel: string | null
    result: string
    detail: object | null
    createdAt: Date
  }> = [
    {
      id: 'seed-audit-01',
      actorId: 'seed-emp-admin',
      actorName: '최고관리자',
      action: 'SETTINGS_UPDATE',
      targetType: 'COMPANY',
      targetId: company.id,
      targetLabel: company.name,
      result: 'SUCCESS',
      detail: { changedKeys: ['name', 'timezone'] },
      createdAt: new Date(now - 1 * HOUR),
    },
    {
      id: 'seed-audit-02',
      actorId: 'seed-emp-admin',
      actorName: '최고관리자',
      action: 'ATTENDANCE_UPDATE',
      targetType: 'ATTENDANCE',
      targetId: 'seed-att-001',
      targetLabel: '홍길동 2026-06-12',
      result: 'SUCCESS',
      detail: { before: { status: 'LATE' }, after: { status: 'NORMAL' } },
      createdAt: new Date(now - 3 * HOUR),
    },
    {
      id: 'seed-audit-03',
      actorId: 'seed-emp-orgadmin',
      actorName: '김조직',
      action: 'LEAVE_GRANT',
      targetType: 'LEAVE_BALANCE',
      targetId: null,
      targetLabel: '1명 / 3일',
      result: 'SUCCESS',
      detail: { employeeIds: ['seed-emp-001'], days: 3, year: 2026 },
      createdAt: new Date(now - 5 * HOUR),
    },
    {
      id: 'seed-audit-04',
      actorId: 'seed-emp-admin',
      actorName: '최고관리자',
      action: 'ATTENDANCE_UPDATE',
      targetType: 'ATTENDANCE',
      targetId: 'seed-att-002',
      targetLabel: '김영업 2026-06-11',
      result: 'FAIL',
      detail: { reason: '확정된 기록 수정 시도' },
      createdAt: new Date(now - 1 * DAY - 2 * HOUR),
    },
    {
      id: 'seed-audit-05',
      actorId: 'seed-emp-orgadmin',
      actorName: '김조직',
      action: 'SETTINGS_UPDATE',
      targetType: 'COMPANY',
      targetId: company.id,
      targetLabel: company.name,
      result: 'SUCCESS',
      detail: { changedKeys: ['locale'] },
      createdAt: new Date(now - 1 * DAY - 6 * HOUR),
    },
    {
      id: 'seed-audit-06',
      actorId: 'seed-emp-admin',
      actorName: '최고관리자',
      action: 'LEAVE_GRANT',
      targetType: 'LEAVE_BALANCE',
      targetId: null,
      targetLabel: '3명 / 1일',
      result: 'SUCCESS',
      detail: { employeeIds: ['seed-emp-001', 'seed-emp-orgadmin', 'seed-emp-sales'], days: 1, year: 2026 },
      createdAt: new Date(now - 2 * DAY),
    },
    {
      id: 'seed-audit-07',
      actorId: 'seed-emp-orgadmin',
      actorName: '김조직',
      action: 'ATTENDANCE_UPDATE',
      targetType: 'ATTENDANCE',
      targetId: 'seed-att-003',
      targetLabel: '홍길동 2026-06-09',
      result: 'SUCCESS',
      detail: { before: { clockOutAt: null }, after: { clockOutAt: '2026-06-09T18:00:00' } },
      createdAt: new Date(now - 2 * DAY - 4 * HOUR),
    },
    {
      id: 'seed-audit-08',
      actorId: null,
      actorName: '시스템',
      action: 'LEAVE_GRANT',
      targetType: 'LEAVE_BALANCE',
      targetId: null,
      targetLabel: '연차 자동발생 (전사)',
      result: 'SUCCESS',
      detail: { trigger: 'cron', ruleId: 'seed-accrual-annual' },
      createdAt: new Date(now - 3 * DAY),
    },
    {
      id: 'seed-audit-09',
      actorId: 'seed-emp-admin',
      actorName: '최고관리자',
      action: 'SETTINGS_UPDATE',
      targetType: 'COMPANY',
      targetId: company.id,
      targetLabel: company.name,
      result: 'SUCCESS',
      detail: { changedKeys: ['businessNumber'] },
      createdAt: new Date(now - 4 * DAY),
    },
    {
      id: 'seed-audit-10',
      actorId: 'seed-emp-orgadmin',
      actorName: '김조직',
      action: 'ATTENDANCE_UPDATE',
      targetType: 'ATTENDANCE',
      targetId: 'seed-att-004',
      targetLabel: '김영업 2026-06-05',
      result: 'SUCCESS',
      detail: { before: { status: 'ABSENT' }, after: { status: 'NORMAL' } },
      createdAt: new Date(now - 5 * DAY),
    },
    {
      id: 'seed-audit-11',
      actorId: 'seed-emp-admin',
      actorName: '최고관리자',
      action: 'LEAVE_GRANT',
      targetType: 'LEAVE_BALANCE',
      targetId: null,
      targetLabel: '1명 / 5일',
      result: 'FAIL',
      detail: { reason: '존재하지 않는 휴가 유형' },
      createdAt: new Date(now - 6 * DAY),
    },
    {
      id: 'seed-audit-12',
      actorId: 'seed-emp-admin',
      actorName: '최고관리자',
      action: 'SETTINGS_UPDATE',
      targetType: 'COMPANY',
      targetId: company.id,
      targetLabel: company.name,
      result: 'SUCCESS',
      detail: { changedKeys: ['logoUrl'] },
      createdAt: new Date(now - 7 * DAY),
    },
  ]

  for (const log of auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: {},
      create: {
        id: log.id,
        companyId: company.id,
        actorId: log.actorId,
        actorName: log.actorName,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        targetLabel: log.targetLabel,
        result: log.result,
        detail: log.detail ?? undefined,
        createdAt: log.createdAt,
      },
    })
  }
  console.log('✅ Audit logs seeded:', auditLogs.length)

  console.log('\n✅ Seed completed!')
  console.log('─────────────────────────────────')
  console.log('관리자:     admin@ablework.io / admin1234! (SUPER_ADMIN)')
  console.log('일반관리자: genadmin@ablework.io / genadmin1234! (GENERAL_ADMIN)')
  console.log('조직관리자: orgadmin@ablework.io / orgadmin1234! (ORG_ADMIN·개발팀)')
  console.log('직원:       employee@ablework.io / employee1234! (EMPLOYEE)')
  console.log('영업팀원:   sales@ablework.io / sales1234! (EMPLOYEE·영업팀)')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
