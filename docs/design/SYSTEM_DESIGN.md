# AbleWork ERP 시스템 설계 문서

> 버전: 2.2.0  
> 작성일: 2026-06-11  
> 최종 점검: 2026-06-12 (5라운드 순환 점검 완료)  
> 대상: 중소규모 기업 (50~300인)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [모듈 구조](#3-모듈-구조)
4. [도메인 모델 (ERD)](#4-도메인-모델-erd)
5. [모듈별 기능 상세](#5-모듈별-기능-상세)
   - [5.1 인사/조직 관리](#51-인사조직-관리)
   - [5.2 근태 관리](#52-근태-관리)
   - [5.3 전자결재](#53-전자결재)
   - [5.4 리포트 / 표준화 규칙](#54-리포트--표준화-규칙)
   - [5.5 메시지](#55-메시지)
   - [5.6 Discord 알림 연동](#56-discord-알림-연동)
6. [권한 체계](#6-권한-체계)
   - [6.4 데이터 무결성 · 삭제 정책](#64-데이터-무결성--삭제-정책-참조무결성)
   - [6.5 결재 · 요청 보안 불변식](#65-결재--요청-보안-불변식)
   - [6.6 추가 권고 (진행 상황)](#66-추가-권고-진행-상황)
7. [API 설계](#7-api-설계)
8. [모듈 간 연동 흐름](#8-모듈-간-연동-흐름)
9. [알림 설계](#9-알림-설계)
10. [구현 로드맵](#10-구현-로드맵)

---

## 1. 프로젝트 개요

### 1.1 목표

HR 근태 관리와 전자결재를 **단일 통합 ERP 플랫폼**으로 구축한다. 중소규모 기업이 하나의 시스템에서 인사, 근태, 전자결재를 처리할 수 있도록 한다.

### 1.2 핵심 원칙

- **단일 사용자 계정**: 로그인 한 번으로 모든 모듈 접근
- **결재 통합**: HR 요청(휴가, 근무일정 변경 등)이 전자결재 워크플로우로 처리됨
- **실시간 알림**: Discord 웹훅으로 근태 이벤트 즉시 알림
- **한국 노동법 준수**: 주 52시간 초과 경고, 연차 자동 발생 (근로기준법 기준)

### 1.3 설계 반영 범위

| 모듈 | 반영 범위 |
|---|---|
| HR 근태 | 근태, 휴가, 요청, 조직 관리, 메시지 |
| 전자결재 | 기안 양식, 결재선, 승인/반려/협조/공람 |

### 1.4 구현 범위 외 항목

원본 소스에 존재하지만 이 ERP에서 **의도적으로 제외**한 항목:

| 항목 | 제외 이유 |
|---|---|
| 급여 정산 | 요구사항에서 선택되지 않음. 향후 별도 착수 가능 |
| 전자계약 | 글로싸인/모두싸인 등 외부 서비스 연동 필요. 별도 서비스로 분리 |
| 급여명세서 메시지 (`messageUseCasePaySlip`) | 급여 정산 모듈 부재로 제외 |
| Enterprise 전용 기능 | 생체인증, 2FA, IP 제어, 스케줄 게시, 비례 발생 등 — 소규모 ERP 범위 초과 |

### 1.5 핵심 용어 정의

| 용어 | 정의 | 구분 기준 |
|---|---|---|
| **요청 (Request)** | 직원이 HR 변경을 신청하는 행위 (근무일정 변경, 휴가 신청 등) | HR 모듈 개념 |
| **기안 (Document)** | 전자결재 워크플로우로 처리되는 문서 | 전자결재 모듈 개념 |
| **관계** | HR 요청이 접수되면 대응하는 기안 문서가 **자동 생성**됨. 기안 승인 완료 → HR 데이터 실제 반영 | 두 모듈의 연결 |
| **알림 (Notification)** | Discord 웹훅 기반 이벤트 알림 | 실시간, 이벤트 트리거 |
| **메시지 (Message)** | 앱 내 발송되는 텍스트 메시지 (수동/자동화) | 비실시간, 템플릿 기반 |

---

## 2. 시스템 아키텍처

```
┌────────────────────────────────────────────────────┐
│                   Frontend (Web)                    │
│      Next.js App Router + TypeScript + Tailwind     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │  HR/조직  │ │  근태관리  │ │     전자결재      │   │
└──┴──────────┴─┴──────────┴─┴──────────────────┴───┘
                     │ REST API / WebSocket
┌────────────────────────────────────────────────────┐
│                 Backend (API Server)                │
│           Node.js (NestJS) + TypeScript             │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ HR 서비스 │ │근태 서비스│ │    결재 서비스     │   │
│  └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │
│       └────────────┴────────────────┘               │
│             공통 인프라 레이어                          │
│    (Auth, Permission, Event Bus, Notification)      │
└────────────────────────────────────────────────────┘
                     │
┌──────────┬──────────┬──────────┬──────────────────┐
│PostgreSQL│  Redis   │S3/Object │ Discord Webhook   │
│ (메인 DB) │(캐시/세션) │(파일저장) │   (알림 연동)    │
└──────────┴──────────┴──────────┴──────────────────┘
```

### 2.1 기술 스택 권장안

| 레이어 | 기술 | 비고 |
|---|---|---|
| Frontend | Next.js 14+ (App Router) | SSR + CSR 혼합, TypeScript |
| Backend | NestJS (Node.js) | 모듈형 아키텍처 |
| Database | PostgreSQL 16 | 트랜잭션 보장 |
| Cache | Redis | 세션, 실시간 알림 큐 |
| Auth | JWT + Refresh Token | RBAC 권한 모델 |
| File | S3 호환 스토리지 | 첨부파일, 계약서 |
| Notification | Discord Webhook | 근태 알림 채널 |
| 배포 | Docker + Compose | 단일 서버 배포 가능 |

---

## 3. 모듈 구조

```
ablework-erp/
├── apps/
│   ├── web/                        # Next.js 프론트엔드
│   │   ├── app/
│   │   │   ├── (auth)/             # 로그인/회원가입
│   │   │   ├── (admin)/            # 관리자 화면
│   │   │   │   ├── organization/   # 조직 관리
│   │   │   │   ├── employees/      # 직원 관리
│   │   │   │   ├── shifts/         # 근무일정 관리
│   │   │   │   ├── attendance/     # 출퇴근 관리
│   │   │   │   ├── leave/          # 휴가 관리
│   │   │   │   ├── approval/       # 전자결재 관리
│   │   │   │   ├── messages/       # 메시지/자동화
│   │   │   │   └── reports/        # 리포트
│   │   │   └── (employee)/         # 직원 셀프서비스
│   │   │       ├── my-schedule/    # 내 근무일정
│   │   │       ├── my-attendance/  # 내 출퇴근
│   │   │       ├── my-leave/       # 내 휴가
│   │   │       ├── requests/       # 요청 내역
│   │   │       └── drafts/         # 기안함 (전자결재)
│   └── api/                        # NestJS 백엔드
│       ├── auth/
│       ├── organizations/
│       ├── employees/
│       ├── shifts/
│       ├── attendance/
│       ├── leave/
│       ├── requests/
│       ├── approval/
│       ├── messages/
│       └── notifications/
└── packages/
    ├── shared-types/               # 공통 TypeScript 타입
    └── shared-constants/           # 공통 상수
```

---

## 4. 도메인 모델 (ERD)

### 4.1 핵심 엔티티 관계

```
Company (회사)
  ├── Organization (조직/부서) [계층형, self-referential]
  │     └── Employee (직원) [N:M via EmployeeOrganization]
  ├── Position (직무)
  │     └── Employee [N:M via EmployeePosition]
  ├── Holiday (법인 휴일)
  └── CompanySettings (회사 설정)

Employee (직원)
  ├── WageInfo (근로정보) [이력 관리, 적용시점 기반]
  ├── Shift (근무일정) [1:N]
  ├── Attendance (출퇴근기록) [1:N]
  ├── Leave (휴가 일정) [1:N]
  ├── Request (요청) [1:N, 발신자]
  └── Document (기안문서) [1:N, 기안자]

Shift (근무일정)
  ├── ShiftType (근무일정 유형: 일반/연장/야간/휴일/재택)
  ├── ShiftTemplate (템플릿)
  └── BreakTime (휴게시간)

Attendance (출퇴근기록)
  ├── Shift [연결, nullable - 무일정 근무 허용]
  └── BreakTime (실제 휴게시간)

LeaveGroup (휴가 그룹)
  └── LeaveType (휴가 유형)
        └── Leave (휴가 일정)
              └── LeaveBalance (잔여 휴가)

Request (요청) [HR 요청: 근무일정/출퇴근/휴가 변경]
  ├── ApprovalRule (승인 규칙) [요청 종류별]
  └── RequestApproval (승인 이력) [차수별]

Document (기안문서) [전자결재]
  ├── DocumentForm (기안양식)
  ├── ApprovalLine (결재선)
  │     └── ApprovalStep (결재단계) [결재자, 협조자, 공람자, 참조자, 수신자]
  └── ApprovalHistory (결재 이력)

NotificationRule (알림 규칙)
  └── NotificationLog (알림 발송 이력)
```

### 4.2 주요 테이블 스키마

#### companies
```sql
id              UUID PRIMARY KEY
name            VARCHAR(100) NOT NULL
business_number VARCHAR(20)
founded_at      DATE
timezone        VARCHAR(50) DEFAULT 'Asia/Seoul'
created_at      TIMESTAMPTZ DEFAULT now()
```

#### organizations
```sql
id              UUID PRIMARY KEY
company_id      UUID REFERENCES companies
parent_id       UUID REFERENCES organizations  -- 계층 구조
name            VARCHAR(100) NOT NULL
approver_id     UUID REFERENCES employees      -- 결재권자
depth           INT DEFAULT 0
sort_order      INT DEFAULT 0
is_active       BOOLEAN DEFAULT true
```

#### employees
```sql
id              UUID PRIMARY KEY
company_id      UUID REFERENCES companies
user_id         UUID REFERENCES users          -- 계정 연결
employee_number VARCHAR(50)                    -- 사번
name            VARCHAR(50) NOT NULL
email           VARCHAR(255) UNIQUE
joined_at       DATE NOT NULL
resigned_at     DATE                           -- 퇴사 예정일
employment_type VARCHAR(20)                    -- 정규직/계약직/파트타임
access_level    VARCHAR(20) NOT NULL           -- 권한 레벨
is_active       BOOLEAN DEFAULT true
```

#### shifts
```sql
id              UUID PRIMARY KEY
employee_id     UUID REFERENCES employees
organization_id UUID REFERENCES organizations
shift_type_id   UUID REFERENCES shift_types
start_at        TIMESTAMPTZ NOT NULL
end_at          TIMESTAMPTZ NOT NULL
is_offsite      BOOLEAN DEFAULT false          -- 재택/외근
status          VARCHAR(20) DEFAULT 'draft'    -- draft/confirmed/cancelled
created_by      UUID REFERENCES employees
```

#### attendances
```sql
id              UUID PRIMARY KEY
employee_id     UUID REFERENCES employees
shift_id        UUID REFERENCES shifts         -- nullable
clock_in_at     TIMESTAMPTZ NOT NULL
clock_out_at    TIMESTAMPTZ
location_lat    DECIMAL(10,7)
location_lng    DECIMAL(10,7)
clock_in_method VARCHAR(20)                    -- gps/wifi/manual
status          VARCHAR(20)                    -- normal/late/early_leave/absent
note            TEXT
```

#### documents (전자결재 기안)
```sql
id              UUID PRIMARY KEY
company_id      UUID REFERENCES companies
form_id         UUID REFERENCES document_forms
doc_number      VARCHAR(50) UNIQUE             -- 문서번호 채번
title           VARCHAR(200) NOT NULL
content         JSONB                          -- 양식 필드 값
drafter_id      UUID REFERENCES employees
status          VARCHAR(20)                    -- draft/pending/approved/rejected/cancelled
submitted_at    TIMESTAMPTZ
completed_at    TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT now()
```

#### approval_steps (결재단계)
```sql
id              UUID PRIMARY KEY
line_id         UUID REFERENCES approval_lines
role            VARCHAR(20)                    -- approver/collaborator/viewer/cc/receiver/dept_collaborator/dept_receiver
assignee_id     UUID REFERENCES employees
step_order      INT NOT NULL
status          VARCHAR(20)                    -- pending/approved/rejected/forwarded/skipped
is_proxy        BOOLEAN DEFAULT false          -- 대결 여부
proxy_id        UUID REFERENCES employees      -- 실제 대결한 사람
proxy_reason    TEXT                           -- 위임 사유
acted_at        TIMESTAMPTZ
comment         TEXT
```

#### proxy_settings (대리결재자 설정)
```sql
id              UUID PRIMARY KEY
principal_id    UUID REFERENCES employees      -- 위임자
proxy_id        UUID REFERENCES employees      -- 대리인
start_date      DATE NOT NULL
end_date        DATE NOT NULL
reason          TEXT
is_active       BOOLEAN DEFAULT true
created_at      TIMESTAMPTZ DEFAULT now()
```

#### leave_accrual_rules (휴가 자동 발생 규칙)
```sql
id              UUID PRIMARY KEY
company_id      UUID REFERENCES companies
leave_group_id  UUID REFERENCES leave_groups
name            VARCHAR(100) NOT NULL
memo            TEXT
is_active       BOOLEAN DEFAULT true
-- 규칙 상세는 leave_accrual_rule_items 테이블로 분리
```

#### leave_accrual_rule_items (발생 규칙 상세 - 월기준/연기준 행)
```sql
id              UUID PRIMARY KEY
rule_id         UUID REFERENCES leave_accrual_rules
accrual_basis   VARCHAR(10)                    -- monthly / yearly
tenure_months   INT                            -- 근속 개월수 (월기준)
tenure_years    INT                            -- 근속 연수 (연기준)
accrual_days    DECIMAL(5,2) NOT NULL          -- 발생 일수
valid_months    INT                            -- 유효 개월수 (null=무기한)
period_start_md VARCHAR(5)                     -- 유효기간 시작 월일 (연기준, MM-DD)
period_end_md   VARCHAR(5)                     -- 유효기간 종료 월일 (연기준, MM-DD)
sort_order      INT NOT NULL
```

#### schedule_patterns (스케줄 패턴)
```sql
id              UUID PRIMARY KEY
company_id      UUID REFERENCES companies
name            VARCHAR(100) NOT NULL
description     TEXT
repeat_cycle_days INT NOT NULL                 -- 반복 주기 (일 단위, 예: 14 = 2주)
pattern_definition JSONB NOT NULL              -- 각 날짜별 shift_template_id 매핑
is_active       BOOLEAN DEFAULT true
```

#### message_templates (메시지 템플릿)
```sql
id              UUID PRIMARY KEY
company_id      UUID REFERENCES companies
name            VARCHAR(100) NOT NULL
content         TEXT NOT NULL
has_variables   BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT now()
```

#### message_automations (메시지 자동화 규칙)
```sql
id              UUID PRIMARY KEY
company_id      UUID REFERENCES companies
name            VARCHAR(100) NOT NULL
automation_type VARCHAR(30)                    -- leave_reminder / request_notice / etc.
leave_type_id   UUID REFERENCES leave_types    -- nullable
trigger_basis   VARCHAR(20)                    -- leave_start / leave_end
offset_days     INT NOT NULL                   -- -90 ~ 90
send_time       TIME NOT NULL                  -- 발송 시각
timezone        VARCHAR(50) DEFAULT 'Asia/Seoul'
template_id     UUID REFERENCES message_templates
send_email      BOOLEAN DEFAULT false
is_active       BOOLEAN DEFAULT true
starts_at       DATE NOT NULL
```

---

## 5. 모듈별 기능 상세

### 5.1 인사/조직 관리

#### 5.1.1 조직 관리

| 기능 | 설명 |
|---|---|
| 조직 계층 관리 | 부서/팀/지점 트리 구조, 무제한 depth |
| 결재권자 지정 | 조직당 1인 결재권자 설정 (전자결재 연동) |
| 법인 휴일 등록 | 국가 공휴일 + 법인 자체 휴일 관리, 매년 반복 옵션 |
| 관리 단위 변경 | 회사 단위 ↔ 지점 단위 전환 |

#### 5.1.2 직원 관리

| 기능 | 설명 |
|---|---|
| 직원 등록 | 기본정보 + 조직/직무 배정 + 합류코드 발송 |
| 직원 정보 수정 | 입사일, 퇴사일, 직급, 직군, 고용형태 |
| 직원 비활성화 | 퇴사 처리 (퇴사일 입력 시 근무계획 자동 생성), 이력 보존 |
| 권한 관리 | 최고관리자 / 총괄관리자 / 조직관리자 / 직원 |
| 근로정보 관리 | 시급, 소정근로요일, 주휴요일, 적용시점 이력 |
| 직무 관리 | 직무 코드 추가/수정/삭제, 승인 규칙 연동 |
| 직원 커스텀 필드 | 회사 정의 추가 정보 필드 |
| 엑셀 일괄 등록 | 직원 일괄 업로드 (xlsx) |
| 입사일 일괄 등록 | 미등록 직원 엑셀 다운로드 → 입사일 입력 → 업로드 |
| 결재권자 미설정 조직 배치 | 조직별 결재권자 일괄 지정 팝업 |
| 모바일 기기 초기화 | 직원 1인 1기기 제한, 기기 변경 시 초기화 |

#### 5.1.3 근로정보

근로정보는 **소정근로규칙**과 **최대근로규칙** 두 개념으로 구분된다.

> `hourly_wage` 필드는 초과근무 기준 계산(리포트)에 활용하며, 향후 급여 정산 모듈 추가 시 그대로 재사용 가능하도록 보존한다.

| 구분 | 항목 | 용도 |
|---|---|---|
| 소정근로규칙 | 소정근로요일, 소정근로시간/주, 주휴요일 | 연차 발생 판단, 초과근무 기준 |
| 최대근로규칙 | 최대근로시간/주 (기본 52시간) | 근무일정 생성 시 초과 경고 |

```
WageInfo {
  employeeId
  -- 소정근로규칙
  contractedWorkDays      // 소정근로요일 (월~일 복수선택, JSON 배열)
  contractedHoursPerWeek  // 소정근로시간/주 (초과근무 기준선)
  weeklyPaidHolidayDay    // 주휴요일
  -- 최대근로규칙
  maxHoursPerWeek         // 최대근로시간/주 (법정 52시간, 커스텀 가능)
  -- 이력 관리
  effectiveFrom           // 적용시점
}
```

---

### 5.2 근태 관리

#### 5.2.1 근무일정 관리

| 기능 | 설명 |
|---|---|
| 근무일정 유형 | 일반/연장/야간/휴일/재택/외근 (커스텀 추가 가능) |
| 근무일정 유형 속성 | 간주근로 시간, 출근 전 확인사항, 출퇴근 기록 불필요 설정 |
| 템플릿 관리 | 자주 쓰는 패턴을 템플릿으로 저장 (코드 기능 포함) |
| 일정 추가 | 개별/조직별/직무별/직원별 일괄 추가 |
| 스케줄 패턴 | 주기적 반복 패턴 (2주 교대, 격주 근무 등) |
| 근무일정 확정 | 초안 → 확정 단계로 Lock (확정 해제는 최고/총괄관리자만 가능) |
| 엑셀 업로드/다운로드 | 대량 등록 및 현황 추출 |
| 간주근로 | 재택/외근 유형에 간주근로 시간 고정/무제한 설정 |
| 휴게시간 설정 | 근무일정별 자동/수동 휴게시간 구성 |
| 최대근로 초과 검증 | 근무일정 생성 시 주 52시간 초과 경고 |

**근무일정 상태 흐름:**
```
draft → confirmed → cancelled
  └─ (직원 요청 시) → Request → approved → confirmed
  확정 해제 권한: 최고관리자/총괄관리자만
```

#### 5.2.2 출퇴근 장소 관리

출퇴근 장소는 **조직별**로 등록하며, 하나의 조직에 복수 장소를 설정할 수 있다.

| 인증 방식 | 설명 |
|---|---|
| GPS 좌표 | 반경(미터) 설정, 위치정보 즉시 폐기 |
| WiFi SSID | 특정 WiFi 연결 시 인증, 위치정보 미저장 |
| GPS + WiFi | 두 조건 AND / OR 선택 가능 |
| 무인증 | 인증 없이 출퇴근 기록 허용 |

#### 5.2.3 출퇴근 기록

| 기능 | 설명 |
|---|---|
| 출퇴근 기록 방식 | GPS / WiFi / 수동 입력 / PC 웹 |
| 출퇴근 장소 설정 | 조직별 복수 장소 (5.2.2 참고) |
| 무일정 근무 | 회사 설정에 따라 항상/조건부/불허 |
| 상태 자동 판단 | 정상 / 지각 / 조퇴 / 결근 자동 분류 |
| 휴게시간 기록 | 자동 집계 + 수동 기록 이원 관리 |
| 출퇴근 확정 | 관리자가 기간 확정 처리 (Lock, 확정 후 수정 불가) |
| 누락 알림 | 출퇴근 미기록 직원에게 알림 발송 |
| 현재 근무현황 | 실시간 대시보드 (근무중/무일정/간주근로/휴가/지각 분류) |
| 엑셀 업로드/다운로드 | 일괄 보정 및 데이터 추출 |
| 근무노트 | 출퇴근 기록마다 메모 첨부 가능 |

**출퇴근 상태 규칙:**
```
표준화 규칙(standardization_rules)에 따라 커스터마이징 가능:
- 기본: 근무일정 시작시간 이후 출근 → 지각
- 커스터마이징: `late_grace_minutes` 설정으로 0~120분 유예 가능
- 근무일정 시작 전 `clockin_before_shift_minutes` 초과 시 → 무일정 근무로 처리
```

**출퇴근 핵심 비즈니스 규칙:**

| 규칙 | 내용 |
|---|---|
| 지각 판정 | 근무일정 시작 + `late_grace_minutes` 초과 시 지각 상태 |
| 조기 출근 | `clockin_before_shift_minutes` 이전 출근 시 무일정 근무로 분리 기록 |
| 무일정 출근 | 승인 대기 중 근무일정이 있으면 해당 일정으로 미리 출근 가능 (승인 후 자동 연결) |
| 휴가 잔액 검증 | 잔액 차감 시 `leave_balances.expires_at` 이내 발생 건에 대해서만 차감 |
| 휴가 그룹 일치 검증 | 휴가 사용 시 `leave_types.group_id` ↔ `leave_balances.leave_type_id` 그룹 일치 확인 |

#### 5.2.4 휴가 관리

| 기능 | 설명 |
|---|---|
| 휴가 그룹 | 연차/병가/특별휴가 등 그룹 분류, 초과사용 제한 설정 |
| 휴가 유형 | 하루 종일/시간 단위, 유급/무급, 장기/휴무/휴일 특별 옵션 |
| 자동 발생 규칙 | 입사일/회계연도 기준 연차 자동 계산 (한국 근로기준법) |
| 수동 발생 | 관리자가 임의 부여 |
| 보상휴가 | 휴일근로 → 보상휴가 자동/수동 전환 |
| 미사용 연차 엑셀 | 연차 자동 지정 엑셀 다운로드 |
| 특정 조직/직무 제한 | 특정 조직이나 직무에만 허용되는 휴가 유형 |
| 표시 이름 | 다른 직원에게 보이는 이름(display_name)과 관리 이름 분리 |
| 사유 표시 설정 | 휴가 사유를 다른 직원에게 공개할지 여부 |
| 연속 사용 제한 | 최소/최대 연속 가능 일수, 휴무/휴일 포함 여부 설정 |
| 출근 전 확인사항 | 휴가일 출근 시 안내 팝업 메시지 설정 |
| 근무일정 자동 삭제 | 휴가 생성 시 겹치는 근무일정 자동 삭제 옵션 |

**휴가 자동 발생 규칙 구조:**

| 구분 | 설명 |
|---|---|
| 월 기준 발생 | 근속 N개월 도달 시 M일 발생, 유효 개월수 설정 가능 |
| 연 기준 발생 | 근속 N년 시 M일 발생, 유효기간 (시작 월일 ~ 종료 월일) 설정 |

```
예시: 한국 근로기준법 기준 연차 발생 규칙
월 기준: 1개월→1일, 2개월→1일, ..., 11개월→1일 (유효 12개월)
         12개월→15일
연 기준: 2년→15일, 3년→16일, 4년→16일, 5년→17일, ... 최대 25일
```

#### 5.2.5 요청 (HR 결재 연동)

HR 요청은 **전자결재 모듈의 기안**과 연동되어 처리된다.

| 요청 유형 | 기안양식 연동 |
|---|---|
| 근무일정 생성/수정/삭제 요청 | 근무일정 변경 기안 |
| 출퇴근기록 생성/수정/삭제 요청 | 출퇴근 정정 기안 |
| 휴가 생성/수정/삭제 요청 | 휴가 신청 기안 |
| 근무지 외 출퇴근 요청 | 재택/외근 신청 기안 |
| **기기 변경 요청** | 모바일 기기 교체 승인 기안 |
| **커스텀 요청** | 관리자가 정의한 자유 양식 요청 (비용처리, 증명서 등) |

**커스텀 요청 유형 관리:**
- 관리자가 필드 직접 설계 (텍스트/숫자/날짜/체크박스/드롭다운/자유양식)
- 필드별 필수/선택 설정
- PDF 추출 옵션 (직원 PDF 다운로드 허용 여부 포함)
- 이미지 첨부 설명 가능

**승인 규칙 advanced_settings 내용:**

| 설정 키 | 설명 |
|---|---|
| `past_tag_grace_period` | 과거 태그 유예기간 (분/시간/일 단위) |
| `overtime_tag_basis` | 연장근무 태그 산정기준 (유급시간/근로시간/커스텀) |
| `max_work_tag_basis` | 최대근로 태그 산정기준 |
| `core_time_start` | 코어타임 시작 시각 |
| `core_time_end` | 코어타임 종료 시각 |

**요청 상태값 전체:**
- `PENDING` → 승인 대기
- `APPROVED` / `FORCE_APPROVED` → 승인됨/강제승인
- `REJECTED` / `FORCE_REJECTED` → 거절됨/강제거절
- `CANCELLED` → 요청자 취소

---

### 5.3 전자결재

#### 5.3.1 주체별 역할

| 역할 | 설명 |
|---|---|
| 기안자 | 기안 작성, 상신, 회수, 삭제, 재기안 |
| 결재자 | 승인 / 반려 / 전결 / 전단계반려 / 결재취소 / 대결 |
| 협조자 | 협조 승인/반려 (결재 진행에 영향 없음, 단 부서협조는 영향) |
| 공람자 | 결재 완료 후 열람만 가능 |
| 참조자 | 상신 이후 모든 진행상태 열람 가능 |
| 수신자 | 결재 완료 후 수신확인/반송 |
| 문서담당자 | 부서협조/수신 접수 처리 담당 |

#### 5.3.2 기안 양식 관리

| 기능 | 설명 |
|---|---|
| 양식 CRUD | 양식 종류/분류/순서 관리 |
| 양식 필드 | 텍스트/날짜/숫자/드롭다운/첨부파일 등 커스텀 필드 |
| 기본 결재선 | 양식별 공용 결재선 설정 |
| 재기안 허용 | 양식별 재기안 사용 여부 설정 |
| 문서번호 채번 | 회사/부서/양식/연도/일련번호 조합 규칙 |

#### 5.3.3 결재선 구성

```
결재선 (ApprovalLine)
  │
  ├── [결재] 단계 N (순차 또는 병렬)
  │     └── 결재자 (개인 또는 직책/직무)
  │
  ├── [협조] 단계 (결재 진행 중 추가 가능)
  │     └── 협조자 또는 부서협조
  │
  ├── [참조] (상신 전에만 지정)
  │
  ├── [공람] (상신 전 또는 완료 후 추가 가능)
  │
  └── [수신] (상신 시 지정, 완료 후 처리)
```

#### 5.3.4 기안 상태 흐름

```
[저장됨] ──상신──▶ [진행중] ──마지막 승인──▶ [완료]
    ▲                  │                        │
    │              반려/전단계반려               수신 처리
    │                  │
    └──────────▶ [반려됨] ──재상신──▶ [진행중]
    
[진행중] ──회수──▶ [회수됨] ──재상신──▶ [진행중]
```

#### 5.3.5 주요 기능

| 기능 | 설명 |
|---|---|
| 기안 작성/상신 | 양식 선택 → 필드 입력 → 결재선 설정 → 상신 |
| 임시저장 | 상신 전 임시저장, 이후 자유 수정 가능 |
| 결재 승인/반려 | 결재 의견 입력 필수 또는 선택 |
| 전결 | 최종 결재자 이전 단계에서 결재 완료 처리 |
| 대결 | 결재자 부재시 대리인 설정 + 기간/사유 지정, 이력 보존 |
| 전단계 반려 | 직전 결재자에게 결재권 반환 |
| 결재 취소 | 다음 결재자가 처리 전 취소 가능 |
| 협조 | 개인 협조 처리 (승인 흐름에 영향 없음) |
| 부서협조 | 내부결재 후 처리, 내부결재 반려 시 부서협조도 반려 |
| 부서수신 | 문서담당자가 [접수]/[수신확인]/[반송] 처리 |
| 문서담당자 지정 | 부서별 담당자 **다중 지정**(`organization_doc_managers`) — 전용 메뉴(전자결재>문서담당 관리). 첫 번째=대표, 미지정 시 팀장(approverId) fallback |
| 문서대장 | 완료 문서 조회, 권한별 가시성 다름 |
| 공용 결재선 | 인사이동 시 일괄 변경 가능한 공유 결재선 |
| 결재 현황 (관리자) | 진행중 전자결재(상신/진행중/반려)만 조회 — 카카오워크 동일. 상신일·기안양식·결재상태·제목 필터 + 체크박스 다중선택 [선택 삭제] |
| 백업 | 결재 완료 문서 백업 기능 |
| 압축파일 업로드 | 회사 설정에서 허용 여부 제어 |

#### 5.3.6 상태별 권한 제약

| 상태 | 제약 사항 |
|---|---|
| `PENDING` (진행중) | 이전 결재자 결재취소/결재의견 수정 불가 |
| `PENDING` (부서협조 진행중) | 문서담당자 협조승인/반려 처리 불가, 전단계 결재취소 불가 |
| `APPROVED` (결재완료) | 결재취소 불가 (최종결재자인 경우) |
| 재상신 | 이전 상신 이력은 삭제되지 않고 보존됨 |

#### 5.3.7 부서협조/부서수신 상세 흐름

```
부서협조 처리:
  문서담당자 [접수] 클릭
    → 내부결재 작성 → 상신 → 부서협조 [진행중]
    → 내부결재 완료 → 부서협조 [승인]
    → 내부결재 반려 → 부서협조 [반려]
  ※ 진행중 상태에서는 전단계 결재 취소/수정 불가

부서수신 처리:
  문서담당자가 [접수] / [수신확인] / [반송] 선택
  - [접수]: 내부결재 생성 → 완료 시 수신확인, 반려 시 반송
  - [수신확인]: 일반 수신과 동일하게 처리
  - [반송]: 기안자의 반송된 문서함으로 이동
```

#### 5.3.8 감사 추적 (Audit Trail)

결재 관련 모든 행위는 `approval_history` 테이블에 기록하며, `proxy_settings` 테이블로 대리결재 설정 이력을 별도 보존한다.

| 추적 항목 | 저장 위치 |
|---|---|
| 결재 승인/반려/전결 이력 | `approval_history` |
| 결재 의견 수정 이력 | `approval_history` (action: comment_updated) |
| 결재 취소 이력 | `approval_history` (action: approval_cancelled) |
| 대리결재자 설정/해제 이력 | `proxy_settings` |
| 공용 결재선 변경 이력 | `shared_approval_lines.updated_at` + version 컬럼 |

---

### 5.4 리포트 / 표준화 규칙

#### 5.4.1 실시간 리포트

| 항목 | 설명 |
|---|---|
| 조회 기준 | 기간 + 조직 + 직원 복합 필터 |
| 집계 항목 | 정상근무일수, 지각횟수, 조퇴횟수, 결근횟수, 총근무시간, 초과근무시간 등 |
| 엑셀 다운로드 | 선택한 기간/직원/항목으로 xlsx 추출 |

#### 5.4.2 표준화 규칙

근태 리포트 집계 시 **어떤 기준으로 시간을 계산할지** 직무별로 다르게 설정한다.

| 설정 항목 | 옵션 | 설명 |
|---|---|---|
| 계산 기준 | attendance / shift | 출퇴근 기록 기준 vs 근무일정 기준 |
| 시작시간 처리 | 7가지 올림/내림/혼합 옵션 | 예: "근무일정 시작시간으로 올림" |
| 종료시간 처리 | 7가지 올림/내림/혼합 옵션 | 예: "실제 퇴근시간 그대로" |
| 출근 미기록 처리 | 포함/제외 | 출근 기록 없는 날을 0으로 처리할지 여부 |
| 수동 휴게시간 차감 | 포함/제외 | 직원이 수동 기록한 휴게시간 차감 여부 |

#### 5.4.3 리포트 스냅샷

특정 기간의 리포트를 저장(마감)하여 이후 데이터 변경에 영향받지 않도록 한다.

- 스냅샷 템플릿으로 반복 생성 가능
- 마감(Lock) 처리 후 수정 불가
- 퇴사자 정산용 3개월 자동 생성 옵션

#### 5.4.4 커스텀 리포트 항목

관리자가 직접 수식(formula)을 작성하여 새로운 집계 항목을 정의한다.

- 기존 리포트 항목 간 사칙연산 지원
- 특정 근무일정 유형/휴가 유형 필터 설정 가능
- 직무별 조회 권한 제어

---

### 5.5 메시지

#### 5.5.1 수동 메시지 발송

관리자가 직원 또는 조직을 선택하여 직접 메시지를 발송한다.

- 메시지 템플릿 사전 등록 후 재사용
- 변수 포함 템플릿 지원 (직원명, 조직명 등 동적 치환)
- 이미지 첨부 가능
- 발송 후 읽음 상태 추적 (`message_recipients.read_at`)

#### 5.5.2 메시지 자동화 규칙

Cron 기반으로 조건에 맞는 직원에게 자동으로 메시지를 발송한다.

| 설정 항목 | 설명 |
|---|---|
| 자동화 유형 | 현재 "휴가 알림"만 지원 |
| 트리거 기준 | 휴가 시작일 / 종료일 |
| 알림 시점 | -90일 ~ +90일 |
| 발송 시각 | 30분 단위, 시간대 선택 |
| 템플릿 | 변수 없는 템플릿만 자동화에 사용 가능 |
| 이메일 병행 | 선택 옵션 |

---

### 5.6 Discord 알림 연동

#### 5.6.1 알림 채널 구성

```
Discord Server
  ├── #근태-알림        출퇴근 기록, 지각/결근 알림
  ├── #결재-알림        기안 상신, 승인/반려 알림
  ├── #휴가-알림        휴가 신청/승인/거절 알림
  └── #시스템-알림      에러, 시스템 이벤트 등 관리자 알림
```

#### 5.6.2 알림 이벤트 목록

| 이벤트 | 채널 | 수신자 | 내용 |
|---|---|---|---|
| 출근 기록 | #근태-알림 | 관리자 | `[출근] {이름} {시간} {장소}` |
| 퇴근 기록 | #근태-알림 | 관리자 | `[퇴근] {이름} {시간} {근무시간}` |
| 지각 감지 | #근태-알림 | 관리자 + 본인 | `[지각] {이름} {근무일정} 미출근` |
| 결근 확정 | #근태-알림 | 관리자 | `[결근] {이름} {날짜}` |
| 기안 상신 | #결재-알림 | 결재자 | `[결재요청] {제목} {기안자}` |
| 결재 승인 | #결재-알림 | 기안자 | `[승인] {제목} {결재자}` |
| 결재 반려 | #결재-알림 | 기안자 | `[반려] {제목} {반려자} {사유}` |
| 휴가 신청 | #휴가-알림 | 관리자 | `[휴가신청] {이름} {날짜} {유형}` |
| 휴가 승인 | #휴가-알림 | 본인 | `[휴가승인] {이름} {날짜}` |

#### 5.6.3 메시지 자동화 규칙 (Cron 기반)

HR 모듈의 메시지 자동화는 Discord 알림과 별개로, **예약 발송(Cron)** 방식으로 동작한다.

| 항목 | 내용 |
|---|---|
| 자동화 유형 | 휴가 알림 (시작일 기준 / 종료일 기준) |
| 알림 시점 | -90일 ~ +90일 범위 설정 |
| 발송 시각 | 30분 단위 선택, 시간대 설정 가능 |
| 수신 채널 | 앱 내 메시지 + 이메일 (선택) |
| 메시지 템플릿 | 사전 등록 템플릿 사용 (변수 미지원) |

> 메시지 자동화 Cron Job은 Redis 큐 기반으로 실행하며, Discord 알림과 동일한 `notification_logs` 테이블로 이력을 관리한다.

#### 5.6.4 Discord Webhook 설계

```typescript
interface DiscordMessage {
  embeds: [{
    title: string       // 알림 제목
    description: string // 상세 내용
    color: number       // 0x2ecc71 (성공), 0xe74c3c (경고)
    fields: [{ name, value, inline }]
    timestamp: string   // ISO 8601
    footer: { text: string }
  }]
}

// 채널별 Webhook URL → notification_rules 테이블에 channel_type: 'discord' 로 저장
// 알림 발송 실패 시 3회 재시도 (exponential backoff), 실패 이력 notification_logs 기록
// notification_rules.trigger_condition (JSONB): 세부 발송 조건 (예: 지각 10분 이상만)
```

**notification_rules 보완 스키마:**
```sql
notification_rules {
  id              UUID PRIMARY KEY
  company_id      UUID REFERENCES companies
  event_type      VARCHAR(50)      -- attendance.clock_in / leave.approved / document.submitted
  channel_type    VARCHAR(20)      -- discord / email / in_app
  webhook_url     TEXT             -- Discord Webhook URL (discord 채널만)
  trigger_condition JSONB          -- 조건: { "min_late_minutes": 10 } 등
  message_template_id UUID         -- message_templates 참조 (in_app/email용)
  embed_template  JSONB            -- Discord embed 템플릿
  is_active       BOOLEAN DEFAULT true
  cron_expression VARCHAR(50)      -- null이면 이벤트 기반, 값이 있으면 Cron 기반
}

---

## 6. 권한 체계

### 6.1 접근 레벨 (HR 모듈)

| 레벨 | 코드 | 설명 |
|---|---|---|
| 최고관리자 | `SUPER_ADMIN` | 회사 설정 포함 모든 기능 (1인) |
| 총괄관리자 | `GENERAL_ADMIN` | 회사 설정/승인 규칙/휴가유형 제외 전체 |
| 조직관리자 | `ORG_ADMIN` | 배정된 조직에 대한 관리 권한 |
| 직원 | `EMPLOYEE` | 본인 근태 기록/요청 만 가능 |

### 6.2 전자결재 관리자 역할

| 역할 | 설명 |
|---|---|
| 서비스 관리자 | 전자결재 전체 설정 (양식, 결재선, 정책) |
| 양식 담당자 | 특정 기안양식 수정/관리 권한 |
| 문서 담당자 | 부서협조/수신 접수 처리 권한 |

### 6.3 기능별 권한 매트릭스

| 기능 | 직원 | 조직관리자 | 총괄관리자 | 최고관리자 |
|---|---|---|---|---|
| 본인 출퇴근 기록 | ✓ | ✓ | ✓ | ✓ |
| 타인 출퇴근 수정 | | ✓ (소속) | ✓ (전체) | ✓ |
| 출퇴근 확정 | | ✓ (소속) | ✓ (전체) | ✓ |
| 근무일정 확정 | | ✓ (소속) | ✓ (전체) | ✓ |
| 근무일정 생성 | (요청) | ✓ | ✓ | ✓ |
| 휴가 발생 | | ✓ | ✓ | ✓ |
| 휴가 유형 관리 | | | ✓ | ✓ |
| 승인 규칙 관리 | | | | ✓ |
| 회사 설정 | | | | ✓ |
| 기안 작성 | ✓ | ✓ | ✓ | ✓ |
| 결재 처리 | (결재자일 때) | ✓ | ✓ | ✓ |
| 스케줄 패턴 관리 | | ✓ | ✓ | ✓ |
| 표준화 규칙 설정 | | | ✓ | ✓ |
| 커스텀 요청 유형 관리 | | | | ✓ |
| 기안양식 관리 | | (양식담당자) | (서비스관리자) | ✓ |
| 공용 결재선 관리 | | | (서비스관리자) | ✓ |
| 문서담당자 지정 | | ✓ (소속) | ✓ | ✓ |
| 대결 설정 | ✓ (본인) | ✓ | ✓ | ✓ |
| 메시지 자동화 설정 | | | ✓ | ✓ |
| Discord/알림 설정 | | | | ✓ |
| 조직관리자 권한 상세 설정 | | | | ✓ |

### 6.4 데이터 무결성 · 삭제 정책 (참조무결성)

마스터 엔티티는 소프트 삭제(`isActive=false`)를 원칙으로 하며, **"사용 중"이면 삭제를 차단**한다.
차단 시 `403 Forbidden` + 도메인 에러코드/메시지를 반환한다. (멀티테넌시: 모든 검사 쿼리는 `companyId` 스코프 내에서 수행)
프론트엔드는 이 **구체 사유 메시지를 토스트로 그대로 노출**한다(공용 `getApiErrorMessage` 헬퍼) — generic "삭제에 실패했습니다" 대신 차단 이유를 사용자에게 전달.

| 엔티티 | 삭제 차단 조건 | 에러코드 |
|---|---|---|
| 조직 `Organization` | 하위 조직 존재 | `ORG_HAS_CHILDREN` |
| 조직 `Organization` | 소속 활성 직원 존재 | `ORG_HAS_EMPLOYEES` |
| 조직 `Organization` | 출퇴근 장소 존재 | `ORG_HAS_TIMECLOCK_AREAS` |
| 조직 `Organization` | 근무일정 존재 | `ORG_HAS_SHIFTS` |
| 직무 `Position` | 활성 직원에게 배정됨 | `POSITION_IN_USE` |
| 근무유형 `ShiftType` | 사용 중인 템플릿/근무일정 존재 | `SHIFT_TYPE_IN_USE` |
| 근무 템플릿 `ShiftTemplate` | 생성된 근무일정 존재 | `SHIFT_TEMPLATE_IN_USE` |
| 휴가 유형 `LeaveType` | 잔여 휴가(`remainingDays>0`) 보유 직원 존재 | `LEAVE_TYPE_IN_USE` |
| 휴가 그룹 `LeaveGroup` | 자식 유형에 잔여 휴가 보유 직원 존재 | `LEAVE_GROUP_IN_USE` |
| **기안양식 `DocumentForm`** | 이 양식으로 작성된 문서 존재 (`Document.form`은 `Cascade`이므로 hard-delete 시 문서 연쇄삭제 위험까지 방지) | `FORM_IN_USE` |
| **커스텀 요청유형 `CustomRequestType`** | 이 유형을 사용하는 활성 승인 규칙 존재 | `CUSTOM_TYPE_IN_USE` |
| **승인 규칙 `ApprovalRule`** | 해당 유형의 진행 중(`PENDING`) 요청 존재 (승인 시 규칙 재참조) | `APPROVAL_RULE_IN_USE` |
| **출퇴근 장소 `TimeclockArea`** | 이 장소로 기록된 출퇴근 존재 | `TIMECLOCK_AREA_IN_USE` |

**휴가 그룹 cascade**: 그룹 삭제 시(사용 중이 아니면) 자식 `LeaveType`을 함께 soft-delete 한다(`$transaction`).

**참조처가 없어 삭제가 안전한 기초 데이터**(가드 불필요, 검증 완료): 발생규칙 `LeaveAccrualRule`(자식 item만 `Cascade`, 잔액은 유형을 참조하므로 규칙 삭제와 무관), 표준화규칙 `StandardizationRule`(역참조 없음), 스케줄패턴 `SchedulePattern`(생성된 근무일정과 FK 분리), 공용결재선 `SharedApprovalLine`(`ApprovalLine.sharedLineRef` `SetNull`, 상신 시 단계가 복사되어 원본 삭제와 무관).

**수정(update) 정책**: 기초 데이터 수정은 차단하지 않되, **기존 데이터는 스냅샷으로 보존**한다.
- 기안양식 `fieldsSchema` 변경 → 기존 문서의 `content`는 작성 시점 값으로 보존(양식 스키마 변경이 과거 문서를 손상시키지 않음). `fieldsSchema`는 `{ fields: DocumentFieldDef[] }` 구조(AP-01-02) — `DocumentFieldDef`/`readFormFields` 단일 출처는 `@ablework/shared-constants`. 필드 타입: text/textarea/number/date/select. 작성 시 `DynamicFormFields`로 렌더해 값을 `content`의 `field.key`별로 저장한다.
- 휴가유형 `deductionDays` 변경 → 이미 승인된 휴가의 `daysUsed`는 불변(미래 신청부터 적용).
- 휴가 차감일수 계산: `daysUsed = 영업일수 × deductionDays`. **영업일수**는 시작~종료(양 끝 포함)에서 주말(토·일)과 회사 공휴일(`company_holidays`, `is_annual_repeat`=매년반복)을 제외해 센다(최소 1영업일). LEAVE_CREATE 사전검증·승인반영·LEAVE_MODIFY 모두 동일 계산.
- 커스텀 요청유형 `fields` 교체 → 기존 요청의 `payload` 스냅샷 보존.
- 승인규칙 변경의 진행 중 요청 소급 방지(규칙 스냅샷)는 §6.6 향후 과제.

**직원 퇴사(`deactivate`) 정합성:**
- 해당 직원이 결재자(assignee)인 미결 결재(`ApprovalStep.status ∈ {PENDING, WAITING}`)가 있으면 퇴사를 차단한다 → `EMPLOYEE_HAS_PENDING_APPROVALS`. (결재 위임/처리 후 가능)
- 퇴사 시 그 직원을 결재자(`approverId`)로 지정한 모든 조직의 `approverId`를 `null`로 해제한다(`$transaction`). → 비활성 직원이 결재자로 남는 고아 참조 방지.

**삭제/수정 엔드포인트 권한 일관성** (생성과 동일 레벨로 정렬):
- 근무 템플릿 삭제: `GENERAL_ADMIN` 이상
- 출퇴근 장소 수정/삭제: `ORG_ADMIN` 이상
- 근무일정 삭제: `ORG_ADMIN` 이상

**조직 계층 무결성**: 조직 상위(`parentId`) 수정 시 **자기 자신 또는 하위 조직을 상위로 지정하면 계층에 순환**이 발생하므로 차단한다 → `ORG_PARENT_CYCLE` (400). 검증은 지정하려는 부모의 조상 체인을 거슬러 올라가며 대상 조직을 만나는지 확인하고, 데이터 손상 대비로 탐색 깊이 상한을 둔다. 신규 생성은 자식이 없어 순환이 불가능하므로 **수정 경로에만** 적용한다.

**전자결재 문서 강제 삭제(AP-05-06 결재 현황)**: 기안자 본인의 `DRAFT` 삭제(`DELETE /documents/:id`)와 별도로, **관리자(`GENERAL_ADMIN` 이상)는 임의 상태 문서를 강제 삭제**할 수 있다(`DELETE /documents/:id/force`). 권한 미달 시 `DOCUMENT_FORCE_DELETE_FORBIDDEN`. 삭제는 `ApprovalHistory` 선삭제(미지정 FK=Restrict) 후 문서 삭제(→ `approvalLines`→`steps` Cascade). **단, HR 요청과 연결된 문서(`request.documentId`)는 삭제 시 연결이 `SetNull`로 끊겨 요청 워크플로가 깨지므로 차단**한다 → `DOCUMENT_LINKED_TO_REQUEST` (요청 취소로 처리).

**결재 현황 조회 박스(`box=status`)** — 카카오워크 정합: 관리자(`GENERAL_ADMIN` 이상)만 조회하며(`DOCUMENT_STATUS_FORBIDDEN`), 문서대장(`box=ledger`, 전 상태)과 달리 **진행 중인 문서(`PENDING`·`REJECTED`)만** 노출한다.
- **상신/진행중 구분**: `PENDING` 문서를 결재선에 액티드 step(`APPROVED`/`PROXY_APPROVED`/`PRE_APPROVED`)이 **없으면 `상신(SUBMITTED)`**, **있으면 `진행중(IN_PROGRESS)`**으로 파생한다(목록 응답 `phase`). `currentApprover`는 현재 차례(`stepOrder` 오름차순 첫 `PENDING` 결재/협조 단계)의 담당자.
- **필터**: `status`(전체/`SUBMITTED`/`IN_PROGRESS`/`REJECTED`), `formId`(기안양식), `dateFrom`/`dateTo`(상신일 기간, `submittedAt` gte/lte), `search`(제목·문서번호).
- **다중 삭제**(`POST /documents/bulk-force-delete`, 최대 100건): 체크박스 다중선택 후 일괄 삭제. **대상 상태를 `PENDING`/`REJECTED`로 제한**하고, HR 연동·미존재·삭제불가 상태는 삭제하지 않고 `skipped[{id, reason}]`(`STATUS_NOT_DELETABLE`/`LINKED_TO_REQUEST`/`NOT_FOUND`)로 반환한다. 응답 `{ deletedCount, deletedIds, skipped }`.

**기안 첨부파일(AP-02-01) — MinIO 오브젝트 스토리지**: 첨부 바이너리는 MinIO(S3 호환)에 저장하고 `document_attachments`에는 메타데이터(파일명·`storage_key`·MIME·크기·업로더)만 보관한다.
- 전역 `StorageModule`(`StorageService`)이 버킷을 부팅 시 자동 생성하며, 스토리지 미가용 시 부팅을 막지 않고 첨부 업로드 시점에 `STORAGE_UNAVAILABLE`(503)로만 실패한다.
- 엔드포인트: `POST /documents/:id/attachments`(multipart, field=`file`), `GET /documents/:id/attachments`(목록), `GET /documents/:id/attachments/:attId/download`(스트리밍, `Content-Disposition` RFC5987), `DELETE /documents/:id/attachments/:attId`.
- 권한: **업로드/삭제는 기안자 본인 + 작성 가능 상태(DRAFT/RECALLED/REJECTED)**, **목록/다운로드는 문서 열람 권한자(기안자/결재 관계자/관리자)**.
- 제약: 1건 최대 20MB, 문서당 최대 10개. 양식의 `allowZipUpload=false`이면 zip 첨부 차단(`ATTACHMENT_ZIP_NOT_ALLOWED`). 문서 삭제 시 `document_attachments`는 Cascade로 함께 제거(오브젝트는 삭제 API 경로에서 best-effort 제거).
- 환경변수(기본값=docker-compose): `MINIO_ENDPOINT`(localhost)·`MINIO_PORT`(9000)·`MINIO_USE_SSL`(false)·`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`(minioadmin)·`MINIO_BUCKET`(ablework).

**전자결재 서비스 사용 설정(게이트)**: 회사 설정 `approval.enable_service`(기본 `true`)로 전자결재 서비스 전체를 on/off 한다. `ApprovalEnabledGuard`가 전자결재 컨트롤러(`/documents`·`/document-forms`·`/shared-approval-lines`·`/proxy-settings`·`/documents/:id/attachments`)를 게이트하여, OFF면 `APPROVAL_SERVICE_DISABLED`(403)로 차단한다.
- 회사 설정 API(`/company-settings`)는 게이트하지 않으므로 **재활성화 경로는 항상 열려 있다**.
- HR 요청(`/requests`) 내부의 문서 자동생성·결재는 컨트롤러를 거치지 않으므로 **영향받지 않는다**(인사/근태 결재 흐름 유지). 설정 화면: 회사 설정 > 전자결재 탭(`approvalServiceEnabled`).

**기안양식 풀세트(AP-01)**: 양식을 분류·메타·공개범위로 관리한다.
- **양식함(분류, `form_categories`)**: `/form-categories` CRUD(목록 전 직원, 생성/수정/삭제 GENERAL_ADMIN). 분류를 사용하는 양식이 있으면 삭제 차단(`FORM_CATEGORY_IN_USE`). 양식은 `categoryId`로 분류에 소속(삭제 시 SetNull).
- **양식 메타**: `visibilityScope`(PUBLIC/DEPARTMENT/PRIVATE)·`retentionYears`(보존연한, 백업 retention과 연동)·`abbreviation`(문서번호 약어)·`description`(설명).
- **공개범위 enforcement**(`assertCanUseForm`): 접근규칙(`form_access_rules`)이 있으면 규칙 매칭(기존 동작). 규칙이 **없을 때** `PUBLIC`은 전체 허용(기존 동작 유지), `DEPARTMENT`/`PRIVATE`은 양식 담당자(`formOwnerId`)만 작성 가능(그 외 `FORM_ACCESS_DENIED`). 기존 양식은 마이그레이션 기본값 `PUBLIC`이라 동작 변화 없음.
- **확장 필드 타입**(`DocumentFieldDef.type`): text/textarea/number/date/select에 더해 **`richtext`**(서식 텍스트, 줄바꿈 유지 다행 입력)·**`table`**(표 — `columns[]` 헤더 정의 + 작성 시 행 추가/삭제, 값은 `string[][]`)를 추가. 양식 관리 화면은 **3탭 위저드(기본정보/입력필드/권한·옵션)** + 양식함 분류 관리 다이얼로그를 제공한다.

**부서 문서담당자 다중(AP-04-07)**: `organization_doc_managers`(부서 N:M 직원, `sortOrder` 순서) 조인으로 부서당 다수 담당자를 둔다.
- 관리: `GET/PATCH /organizations/:id/doc-managers`(목록/집합 교체, GENERAL_ADMIN) + 전용 화면 `전자결재 > 문서담당 관리`(조직 트리 + 담당자 Autocomplete). 조직 다이얼로그의 단일 담당자 입력은 제거. 교체 시 레거시 `Organization.docManagerId`를 **대표(첫 번째)** 로 동기화(점진 이관·fallback 유지).
- 부서 step assignee 해석(`resolveSteps`): **대표 담당자 ?? 레거시 docManagerId ?? 팀장(approverId)**. 모두 없으면 `DEPT_NO_MANAGER`.
- 결재 처리 권한(`resolveActor`): 부서 step은 **해당 부서 담당자 누구나** 처리 가능(assignee 불일치여도 `organization_doc_managers` 멤버면 허용). 부서문서함(`box=dept-docs`)도 assignee 또는 내가 담당하는 부서의 step을 노출.

**공용 결재선 정합(AP-01-08)**: `shared_approval_lines`에 작성자(`createdById`, SetNull)·작성일(`createdAt`)을 노출하고, 목록은 `search`(name contains) 필터를 지원한다.
- **이름 중복 차단**: 같은 회사 내 동일 이름 결재선 생성/수정 시 `SHARED_LINE_DUPLICATE_NAME`(수정은 자기 자신 제외).
- **최종결재자=협조자 금지**: 마지막 APPROVER 단계 담당자가 동일 결재선의 협조자(AGREEMENT/부서협조)로도 지정되면 `FINAL_APPROVER_IS_COLLABORATOR`. **공용 결재선에만 적용** — 개인 결재선은 개인 템플릿이라 이 제약을 적용하지 않는다(중복 인원 배치 자유, 상신 시점에도 동일 검증 없음).
- **중복 인원 배치 허용**: 동일 인원을 서로 다른 결재 단계(APPROVER 등)에 중복 배치하는 것은 허용한다(위 금지 규칙만 예외).

**개인 결재선(빠른 결재선 불러오기)**: `shared_approval_lines.scope`로 공용(`COMPANY`)/개인(`PERSONAL`)을 구분한다. 개인 결재선은 작성자 본인(`created_by_id`)만 조회·저장·수정·삭제한다.
- 엔드포인트 `/personal-approval-lines`(GET·POST·PATCH·DELETE, 인증된 전 직원). 소유자 외 접근은 `PERSONAL_LINE_FORBIDDEN`, 미존재는 `PERSONAL_LINE_NOT_FOUND`.
- 이름 중복은 본인(`created_by_id`)·`PERSONAL` 범위로만 판정 — 다른 직원과 같은 이름은 허용. 공용 목록(`/shared-approval-lines`)에는 `scope=COMPANY`만 노출된다.
- 기안 작성 화면에서 "내 결재선으로 저장"으로 현재 결재선 구성을 보관하고, "내 결재선 불러오기"로 즉시 prefill 한다.

**문서성격·문서번호 체계(채번 대분류)**: `document_categories`(이름·약어)를 회사 마스터로 관리(GENERAL_ADMIN, `/document-categories`)하고, 기안 작성 시 선택(`documents.categoryId`)한다. 양식함 분류(`form_categories`)와 별개 축이다.
- 문서번호 패턴(`DocumentNumberRule.pattern`) 토큰: `{CATEGORY}`(문서성격 약어)·`{ABBR}`(양식 약어)·`{YYYY}`/`{YY}`(연도)·`{MM}`(월)·`{SEQ:n}`(n자리 0패딩). 예) `{CATEGORY}-{ABBR}-{YY}-{SEQ:4}` → `사업-지출기안-26-0001`.
- 채번은 상신 시점에 문서의 `categoryId`로 약어를 해석해 치환한다(미지정이면 빈 문자열).
- 사용 중(문서 참조) 문서성격은 삭제 차단(`DOCUMENT_CATEGORY_IN_USE`), 이름·약어 중복 차단(`DOCUMENT_CATEGORY_DUPLICATE`).

**문서함 탭별 검색**: 문서함 목록(`/documents`)은 `searchField`(`all`/`title`/`form`/`drafter`)로 검색 대상을 지정한다. `all`(기본)은 제목·문서번호·양식명·기안자명 OR 검색, 나머지는 해당 단일 필드 검색. 모든 박스(기안함/결재함/문서대장 등)에 적용된다.

**결재 종료/진행 후 의견·첨부**: 상신된 문서(DRAFT 제외)에 사후 의견·첨부를 추가할 수 있다(계약 기안 완료 후 최종 날인 스캔본 등).
- 의견: `POST /documents/:id/opinions` → `ApprovalHistory(action=OPINION)`로 기록되어 결재 의견 타임라인에 함께 노출된다. 권한=기안자 + 결재 관계자(assignee/proxy) + 관리자. DRAFT 문서는 `DOCUMENT_OPINION_NOT_ALLOWED`.
- 첨부: 업로드 권한을 상신 후에도 기안자·결재 관계자·관리자로 확대한다(본문·결재선은 잠금 유지, 첨부만 허용). 완료(APPROVED) 문서의 첨부는 삭제 차단(`ATTACHMENT_DELETE_LOCKED`); 그 외 삭제는 업로더 본인/작성 가능 상태의 기안자/관리자만(`ATTACHMENT_DELETE_FORBIDDEN`).
- (follow-up) **소속부서 팀장 동적 결재자 토큰**: 상신 시 기안자 소속부서 팀장으로 해석되는 동적 단계는 `ApprovalStep.assigneeId` NOT NULL 제약 + 상신 시점 drafter-org 해석이 필요해 별도 단계로 보류.

**전자결재 공통 관리 정책(AP-01 공통)**:
- **문서번호 `{ABBR}` 토큰**: 채번 패턴(`DocumentNumberRule.pattern`)에서 `{ABBR}`는 양식의 `abbreviation`으로 치환(기존 `{YYYY}`/`{MM}`/`{SEQ:n}`에 추가). 예: `{ABBR}-{YYYY}-{SEQ:4}`.
- **전단계 반려 정책 토글**: `approval.enable_prev_step_reject`(기본 `true`). OFF면 `returnToPrevious`가 `APPROVAL_PREV_REJECT_DISABLED`(400)로 차단. 회사 설정 > 전자결재 탭에서 토글.
- (follow-up) `enable_upper_line_change`(상위 결재선 변경 허용)는 해당 기능(공람/협조 사후추가, AP-기안결재 정합 단계)과 함께, `Employee.nickname` 표시형식은 별도 단계로 진행.

### 6.5 결재 · 요청 보안 불변식

| 불변식 | 규칙 | 에러코드 |
|---|---|---|
| **레코드 소유권** | HR 요청의 승인 반영(`LEAVE/SHIFT/ATTENDANCE`의 `MODIFY/DELETE/EDIT`)은 대상 레코드가 **요청자 본인 소유**일 때만 수행한다. apply 단계 쿼리 `where`에 `employeeId`를 강제하여 타 직원 레코드 조작을 차단. | `LEAVE_NOT_FOUND` 등(소유 불일치 시 미발견 처리) |
| **요청 결재자 fallback** | HR 요청(휴가 등)에 적용 `ApprovalRule`이 없거나 직위로 결재자를 못 찾으면, ① 요청자 대표 부서의 팀장(`organization.approverId`, 본인 제외) → ② 회사 `GENERAL_ADMIN` 이상 순으로 결재자를 지정한다. 상신 알림(DM/이메일/인앱)은 이 1차 결재자(`assigneeId`)에게 발송된다(과거 `assigneeId` 누락으로 본인에게만 가던 버그 수정). | — |
| **자기결재 금지 ①** | 요청 생성 시 본인 외 결재 가능한 관리자(`GENERAL_ADMIN` 이상)가 없으면 요청을 거부한다(자기 자신을 결재자로 fallback 하지 않는다). | `REQUEST_NO_APPROVER` |
| **자기결재 금지 ②** | 결재 처리 시 `요청자 == 결재자`이면 차단한다(관리자 포함). | `REQUEST_SELF_APPROVAL` |
| **휴가 잔액 조회** | 본인 또는 `ORG_ADMIN` 이상만 타 직원 잔액을 조회할 수 있다. | `LEAVE_BALANCE_FORBIDDEN` |
| **비활성 유형 신청 금지** | 비활성화(소프트 삭제)된 휴가 유형으로는 신규 요청을 생성할 수 없다(기존 잔액·이력은 보존). 서버에서 강제하며, 직원 선택 드롭다운에서도 비활성 유형을 제외한다. | `LEAVE_TYPE_INACTIVE` |

### 6.6 추가 권고 (진행 상황)

무결성/정합성 심화 권고. 스키마 변경 또는 설계 결정이 필요한 항목은 별도 작업으로 분리한다.

1. ✅ **스키마 FK 정책 명시화** (구현 완료 — 마이그레이션 무발생): 실제 DB 제약 확인 결과 `documents.form_id`는 **이미 `ON DELETE RESTRICT`**, `approval_lines.shared_line_ref_id`는 **이미 `ON DELETE SET NULL`**이었다(초기 마이그레이션 기준. "Cascade" 우려는 별개 테이블 `form_access_rules.form_id`와 혼동된 것). `schema.prisma`에 두 관계의 `onDelete`(`Restrict`/`SetNull`)를 **명시적으로 선언**해 의도를 코드로 고정 — Prisma 기본값과 동일하여 `migrate diff` 결과 *empty migration*(DB 변경 없음, 클라이언트 타입 무영향).
2. ✅ **근무일정 확정(CONFIRMED) 정책 — 확정**: 출퇴근 정정은 확정 시 결재로도 차단(`ATTENDANCE_ALREADY_CONFIRMED`)한다. 반면 근무일정은 **결재가 변경의 정식 경로**이므로 확정 상태에서도 `SHIFT_MODIFY/DELETE` 승인을 허용한다 — 이 **비대칭은 의도된 정책으로 확정**한다(근태=기록 정정 차단, 근무일정=결재로 변경).
3. ⏳ **결재 규칙 스냅샷** (마이그레이션 필요): 진행 중 요청에 결재 규칙 변경이 소급되지 않도록 `Request`에 `ruleId`(또는 규칙 스냅샷)를 저장.
4. 조회/계층 무결성:
   - ✅ **조직 계층 순환 참조 검출** (구현 완료): `parentId` 수정 시 순환 차단 → `ORG_PARENT_CYCLE` (§6.4 참조).
   - ✅ **비활성 마스터 선택 노출 차단** (구현 완료): 원칙 = **선택 드롭다운은 active만 / 관리·이력 표시는 보존**. 직원 휴가신청 드롭다운은 비활성 유형을 제외하고, 서버는 비활성 유형 신청을 `LEAVE_TYPE_INACTIVE`로 차단(§6.5). 이미 active-only인 마스터(직무/근무유형/템플릿/출퇴근장소/기안양식)는 일치. **관리 화면(커스텀유형·휴가유형/그룹)은 재활성화 토글을 위해 비활성도 계속 표시**(의도된 차이). 결재규칙 설정은 정적 `REQUEST_TYPES`를 쓰므로 비활성 동적유형 노출 경로 없음.

---

## 7. API 설계

### 7.1 엔드포인트 구조

```
/api/v1/
├── auth/
│   ├── POST   /login
│   ├── POST   /logout
│   └── POST   /refresh
│
├── companies/
│   ├── POST   /                      # 회사 생성 (최초 가입 시)
│   ├── GET    /:id                   # 회사 정보 조회
│   ├── PATCH  /:id                   # 회사 정보 수정
│   ├── POST   /join                  # 합류코드로 회사 합류
│   └── POST   /invite-code           # 합류코드 발급/재발급
│
├── organizations/
│   ├── GET    /                      # 조직 트리 조회
│   ├── POST   /                      # 조직 생성
│   ├── PATCH  /:id                   # 조직 수정
│   └── DELETE /:id                   # 조직 삭제
│
├── employees/
│   ├── GET    /                      # 직원 목록 (필터/검색)
│   ├── POST   /                      # 직원 등록
│   ├── GET    /:id                   # 직원 상세
│   ├── PATCH  /:id                   # 직원 정보 수정
│   ├── POST   /:id/deactivate        # 직원 비활성화
│   ├── POST   /:id/reset-device      # 모바일 기기 초기화
│   ├── GET    /:id/wage-info         # 근로정보 이력
│   ├── POST   /:id/wage-info         # 근로정보 등록
│   ├── GET    /:id/custom-fields     # 커스텀 필드 값 조회
│   └── PATCH  /:id/custom-fields     # 커스텀 필드 값 수정
│
├── timeclock-areas/
│   ├── GET    /                      # 출퇴근 장소 목록 (조직 필터)
│   ├── POST   /                      # 출퇴근 장소 등록
│   ├── PATCH  /:id                   # 출퇴근 장소 수정
│   └── DELETE /:id                   # 출퇴근 장소 삭제
│
├── shifts/
│   ├── GET    /                      # 근무일정 조회 (기간/조직/직원 필터)
│   ├── POST   /                      # 근무일정 생성
│   ├── PATCH  /:id                   # 근무일정 수정
│   ├── DELETE /:id                   # 근무일정 삭제
│   ├── POST   /bulk                  # 일괄 생성 (템플릿 기반)
│   ├── POST   /:id/confirm           # 근무일정 확정
│   └── POST   /:id/unconfirm         # 근무일정 확정 해제 (최고/총괄만)
│
├── shift-templates/
│   ├── GET    /                      # 템플릿 목록
│   ├── POST   /                      # 템플릿 생성
│   ├── PATCH  /:id                   # 템플릿 수정
│   └── DELETE /:id                   # 템플릿 삭제
│
├── attendances/
│   ├── GET    /                      # 출퇴근 목록 조회
│   ├── POST   /clock-in              # 출근 기록
│   ├── POST   /clock-out             # 퇴근 기록
│   ├── POST   /break-start           # 휴게 시작
│   ├── POST   /break-end             # 휴게 종료
│   ├── PATCH  /:id                   # 출퇴근 수정 (관리자)
│   ├── DELETE /:id                   # 출퇴근 삭제 (관리자)
│   ├── GET    /now-at-work           # 현재 근무 현황 (실시간)
│   └── POST   /confirm-period        # 기간 확정
│
├── leaves/
│   ├── GET    /groups                # 휴가 그룹 목록
│   ├── POST   /groups                # 휴가 그룹 생성
│   ├── GET    /types                 # 휴가 유형 목록
│   ├── POST   /types                 # 휴가 유형 생성
│   ├── GET    /accrual-rules         # 발생 규칙 목록
│   ├── POST   /accrual-rules         # 발생 규칙 생성
│   ├── POST   /accrual-rules/:id/run # 규칙 기반 발생 실행
│   ├── GET    /balance/:employeeId   # 직원 휴가 잔여
│   ├── POST   /accrual               # 수동 발생
│   └── GET    /                      # 휴가 일정 조회
│
├── leaves/ (continued)
│   └── POST   /compensation          # 보상휴가 발생
│
├── requests/
│   ├── GET    /                      # 요청 목록
│   ├── POST   /                      # 요청 생성 → 기안 자동 생성
│   ├── GET    /approval-rules        # 승인 규칙 목록
│   ├── POST   /approval-rules        # 승인 규칙 생성/수정
│   ├── POST   /:id/approve           # 요청 승인
│   ├── POST   /:id/reject            # 요청 거절
│   ├── POST   /:id/force-approve     # 강제 승인 (최고관리자)
│   ├── POST   /:id/force-reject      # 강제 거절 (최고관리자)
│   └── POST   /bulk-approve          # 요청 일괄 승인
│
├── schedule-patterns/
│   ├── GET    /                      # 스케줄 패턴 목록
│   ├── POST   /                      # 스케줄 패턴 생성
│   ├── PATCH  /:id                   # 스케줄 패턴 수정
│   └── POST   /:id/apply             # 패턴 적용 (직원/기간 지정)
│
├── documents/ (전자결재)
│   ├── GET    /forms                 # 기안양식 목록
│   ├── POST   /forms                 # 기안양식 생성
│   ├── PATCH  /forms/:id             # 기안양식 수정
│   ├── GET    /shared-lines          # 공용 결재선 목록
│   ├── POST   /shared-lines          # 공용 결재선 생성
│   ├── GET    /                      # 기안문서 목록
│   ├── POST   /                      # 기안 작성 (임시저장)
│   ├── GET    /:id                   # 기안 상세
│   ├── POST   /:id/submit            # 기안 상신
│   ├── POST   /:id/recall            # 기안 회수
│   ├── POST   /:id/approve           # 결재 승인/반려/전결/전단계반려
│   ├── POST   /:id/cancel-approval   # 결재 취소
│   ├── POST   /:id/redraft           # 재기안
│   ├── POST   /:id/dept-collab       # 부서협조 접수/처리
│   ├── POST   /:id/dept-receive      # 부서수신 접수/수신확인/반송
│   └── GET    /registry              # 문서대장
│
├── standardization-rules/
│   ├── GET    /                      # 표준화 규칙 목록
│   ├── POST   /                      # 표준화 규칙 생성
│   ├── PATCH  /:id                   # 표준화 규칙 수정
│   └── DELETE /:id                   # 표준화 규칙 삭제
│
├── reports/
│   ├── GET    /realtime              # 실시간 리포트
│   ├── GET    /snapshots             # 스냅샷 목록
│   ├── POST   /snapshots             # 스냅샷 생성
│   ├── POST   /snapshots/:id/lock    # 스냅샷 마감
│   ├── GET    /custom-columns        # 커스텀 리포트 항목
│   ├── POST   /custom-columns        # 커스텀 리포트 항목 생성
│   └── GET    /export                # 리포트 엑셀 다운로드
│
├── messages/
│   ├── GET    /templates             # 메시지 템플릿 목록
│   ├── POST   /templates             # 메시지 템플릿 생성
│   ├── POST   /send                  # 수동 메시지 발송
│   ├── GET    /                      # 수신 메시지 목록
│   ├── GET    /automations           # 자동화 규칙 목록
│   └── POST   /automations           # 자동화 규칙 생성
│
├── proxy-settings/
│   ├── GET    /                      # 대결 설정 목록 (본인)
│   ├── POST   /                      # 대결 설정 생성
│   └── DELETE /:id                   # 대결 설정 취소
│
└── notifications/
    ├── GET    /rules                  # 알림 규칙 목록
    ├── POST   /rules                  # 알림 규칙 생성
    ├── PATCH  /rules/:id              # 알림 규칙 수정
    └── GET    /logs                   # 발송 이력
```

### 7.2 공통 응답 포맷

```typescript
// 성공
{
  success: true,
  data: T,
  meta?: { total, page, limit }
}

// 실패
{
  success: false,
  error: {
    code: string,     // "EMPLOYEE_NOT_FOUND"
    message: string,  // 한국어 사용자 메시지
    details?: any
  }
}
```

---

## 8. 모듈 간 연동 흐름

### 8.1 휴가 신청 → 전자결재 연동

```
직원 (앱/웹)
  │
  ├─1. 휴가 생성 요청 (POST /requests)
  │       { type: 'LEAVE_CREATE', payload: { leaveTypeId, startDate, endDate } }
  │
  │  [Server Side]
  ├─2. 요청 레코드 생성 (requests 테이블)
  ├─3. 해당 휴가유형의 승인 규칙 조회
  ├─4. '휴가 신청' 기안양식으로 Document 자동 생성
  ├─5. 승인 규칙에 따라 ApprovalLine 자동 구성
  ├─6. Document 상신 (status: pending)
  │
  ├─7. 결재자에게 알림 발송 (Discord + 이메일)
  │
  ├─8. [결재자] 승인 처리
  │       POST /documents/:id/approve
  │
  ├─9. Document 완료 → Request 완료 → Leave 일정 실제 생성
  │
  └─10. 직원에게 휴가 승인 알림 (Discord)
```

### 8.2 일반 전자결재 흐름

```
기안자
  │
  ├─1. 기안 양식 선택 및 작성
  ├─2. 결재선 설정 (공용 결재선 자동 로드, 직접 편집 가능)
  ├─3. 공람자/참조자/수신자 지정
  ├─4. 상신 → status: pending
  │
  └─ 결재자 루프:
       ├─ [승인] → 다음 결재자로 이동 (or 완료)
       ├─ [반려] → status: rejected, 기안자에게 알림
       ├─ [전결] → 이후 결재자 자동 승인, 완료
       ├─ [전단계반려] → 이전 결재자에게 반환
       └─ [결재취소] → 이전 상태로 복원 (다음 결재 전까지만)
```

### 8.3 근무일정 변경 요청 → 전자결재 연동

```
직원 (앱/웹)
  │
  ├─1. 근무일정 생성/수정/삭제 요청 (POST /requests)
  │       { type: 'SHIFT_CREATE', payload: { templateId, date, startAt, endAt } }
  │
  │  [Server Side]
  ├─2. 승인 규칙 조회 (request_type = 'SHIFT_CREATE', 태그 판별: 연장/휴일/야간)
  ├─3. '근무일정 변경' 기안양식으로 Document 자동 생성
  ├─4. 승인 → shift 레코드 생성/수정/삭제 실행
  │
  └─ 거절 → request.status = REJECTED, 직원에게 알림
```

### 8.4 출퇴근 정정 요청 → 전자결재 연동

```
직원 (앱/웹)
  │
  ├─1. 출퇴근 정정 요청 (POST /requests)
  │       { type: 'ATTENDANCE_EDIT', payload: { attendanceId, clockInAt, clockOutAt, reason } }
  │
  │  [Server Side]
  ├─2. 승인 규칙 조회 (request_type = 'ATTENDANCE_EDIT', 태그: 과거/연장)
  ├─3. '출퇴근 정정' 기안양식으로 Document 자동 생성
  ├─4. 승인 → attendance 레코드 수정 실행
  │
  └─ 거절 → 정정 미반영
```

### 8.5 기기 변경 요청

```
직원 (앱)
  │
  ├─1. 기기 변경 요청 (POST /requests)
  │       { type: 'DEVICE_CHANGE', payload: { newDeviceId, reason } }
  │
  ├─2. 관리자 승인
  ├─3. 승인 → employees.device_id, device_bound_at 업데이트
  └─4. 기존 기기 바인딩 해제
```

### 8.6 메시지 자동화 흐름 (휴가 알림)

```
관리자
  │
  ├─1. 메시지 템플릿 등록 ("OOO님, 내일은 휴가입니다")
  ├─2. 자동화 규칙 생성
  │       { leaveType: 연차, trigger: 시작일 기준, offset: -1일, time: 09:00 }
  │
  │  [Cron Job - 매일 09:00 실행]
  ├─3. 당일 + 1일 후 휴가 시작인 직원 조회
  ├─4. messages 레코드 생성 + message_recipients 생성
  ├─5. 해당 직원에게 앱 메시지 발송
  └─6. (이메일 옵션 시) 이메일 발송 + notification_logs 기록
```

---

## 9. 알림 설계

### 9.1 알림 트리거 이벤트 버스

```typescript
// 이벤트 발행
EventBus.emit('attendance.clock_in', {
  employeeId, organizationId,
  timestamp, location, status
})

// 알림 서비스에서 구독
EventBus.on('attendance.clock_in', async (event) => {
  const rules = await NotificationRule.findActive('attendance.clock_in')
  for (const rule of rules) {
    await sendDiscordWebhook(rule.webhookUrl, formatMessage(rule.template, event))
  }
})
```

### 9.2 Discord Embed 포맷 예시

```json
{
  "embeds": [{
    "title": "🕐 출근 기록",
    "color": 3066993,
    "fields": [
      { "name": "직원", "value": "홍길동 (개발팀)", "inline": true },
      { "name": "출근 시간", "value": "09:03", "inline": true },
      { "name": "상태", "value": "정상", "inline": true },
      { "name": "장소", "value": "본사 1층 (GPS)", "inline": false }
    ],
    "timestamp": "2026-06-11T09:03:00+09:00",
    "footer": { "text": "AbleWork ERP" }
  }]
}
```

---

## 10. 구현 로드맵

### Phase 1 (MVP) — 인사/근태 + Discord 알림

| 기간 | 항목 |
|---|---|
| W1-2 | 프로젝트 세팅, Auth, 조직/직원 관리 |
| W3-4 | 근무일정 관리 (CRUD, 템플릿, 스케줄 패턴, 확정) |
| W5-6 | 출퇴근 기록 (GPS 인증, 상태 분류, 현황) |
| W7-8 | 휴가 관리 (유형, 발생 규칙, 신청) |
| W9 | Discord 알림 연동 (근태/휴가 이벤트) |
| W10 | 메시지 자동화 (휴가 알림 Cron) + 기본 리포트 |

### Phase 2 — 전자결재 통합

| 기간 | 항목 |
|---|---|
| W11-12 | 기안양식 관리, 공용 결재선, 문서번호 채번 |
| W13-14 | 기안 작성/상신/결재 워크플로우 (승인/반려/전결/대결) |
| W15 | 전단계 반려, 결재 취소, 부서협조/부서수신 |
| W16 | HR 요청 → 전자결재 자동 연동 (기기변경 포함) |
| W17 | 문서대장, 공람/참조/수신함 + Discord 알림 (결재 이벤트) |

---

## 부록

### A. 전자결재 문서 상태 코드

| 코드 | 의미 |
|---|---|
| `DRAFT` | 임시저장 |
| `PENDING` | 진행중 (상신됨) |
| `APPROVED` | 결재 완료 |
| `REJECTED` | 반려됨 |
| `RECALLED` | 회수됨 |

### B. 근무일정 유형 분류

| 유형 | 설명 |
|---|---|
| `REGULAR` | 일반근로 |
| `OVERTIME` | 연장근로 (주 40h 초과) |
| `NIGHT` | 야간근로 (22:00~06:00) |
| `HOLIDAY` | 휴일근로 |
| `REMOTE` | 재택근무 (간주근로 가능) |
| `OFFSITE` | 외근 (간주근로 가능) |
| `PAID_LEAVE` | 유급휴가 |
| `UNPAID_LEAVE` | 무급휴가 |

### C. 한국 근로기준법 핵심 기준 (근태 관리 기준)

| 항목 | 기준 |
|---|---|
| 법정근로시간 | 주 40시간 (1일 8시간) |
| 최대근로시간 | 주 52시간 (연장 12시간 포함) — 초과 시 경고 |
| 야간근로시간대 | 22:00 ~ 06:00 |
| 연차 발생 | 1년 미만: 매월 1일, 1년 이상: 15일 (최대 25일) |
