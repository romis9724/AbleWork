# AbleWork ERP — 데이터베이스 ERD

> 버전: 2.2.0 (2026-06-12 5라운드 순환 점검 완료) · 2026-06-29 출퇴근 스키마 갱신  
> 표기법: Mermaid ERD (GitHub/GitBook 렌더링 지원)  
> 스키마 변경 이력은 [CHANGELOG.md](./CHANGELOG.md) 참조. 최근(2026-06-29): `20260629090000_add_attendance_position`(attendances.position_id), `20260629120000_timeclock_area_org_n_to_n`(timeclock_areas 회사 스코프 전환 + organization_timeclock_areas 조인 신설).

```mermaid
erDiagram

  %% ════════════════════════════════════════════════
  %% 1. 회사 / 조직
  %% ════════════════════════════════════════════════

  companies {
    uuid   id PK
    string name
    string business_number
    date   founded_at
    string timezone
    string locale
    string country_code
    string logo_url
    bool   is_active
  }

  organizations {
    uuid   id PK
    uuid   company_id FK
    uuid   parent_id FK
    string name
    int    depth
    int    sort_order
    uuid   approver_id FK
    uuid   doc_manager_id FK
    string address
    bool   is_active
  }

  organization_doc_managers {
    uuid   id PK
    uuid   organization_id FK
    uuid   employee_id FK
    int    sort_order
  }

  company_holidays {
    uuid   id PK
    uuid   company_id FK
    date   holiday_date
    string name
    bool   is_annual_repeat
    string type
  }

  company_settings {
    uuid   id PK
    uuid   company_id FK
    string section
    string key
    jsonb  value
  }

  companies ||--o{ organizations : "has"
  organizations ||--o{ organizations : "has children"
  organizations ||--o{ organization_doc_managers : "has managers"
  employees ||--o{ organization_doc_managers : "manages dept docs"
  companies ||--o{ company_holidays : "has"
  companies ||--o{ company_settings : "has"

  %% ════════════════════════════════════════════════
  %% 2. 계정 / 직원
  %% ════════════════════════════════════════════════

  users {
    uuid   id PK
    string email
    string password_hash
    string name
    string phone
    string timezone
    bool   two_factor_enabled
    bool   is_active
  }

  employees {
    uuid   id PK
    uuid   company_id FK
    uuid   user_id FK
    string employee_number
    string name
    string phone
    date   joined_at
    date   resigned_at
    string employment_type
    string access_level
    string device_id
    timestamptz device_bound_at
    bool   is_active
  }

  employee_organizations {
    uuid   employee_id FK
    uuid   organization_id FK
    bool   is_primary
  }

  positions {
    uuid   id PK
    uuid   company_id FK
    string name
    string color
    int    sort_order
  }

  employee_positions {
    uuid   employee_id FK
    uuid   position_id FK
  }

  employee_custom_fields {
    uuid   id PK
    uuid   company_id FK
    string field_name
    string field_type
    int    sort_order
    bool   is_active
  }

  employee_custom_field_values {
    uuid   id PK
    uuid   employee_id FK
    uuid   field_id FK
    text   value
  }

  users ||--o| employees : "linked to"
  companies ||--o{ employees : "has"
  employees ||--o{ employee_organizations : "belongs to"
  organizations ||--o{ employee_organizations : "contains"
  employees ||--o{ employee_positions : "has"
  positions ||--o{ employee_positions : "assigned to"
  companies ||--o{ employee_custom_fields : "defines"
  employees ||--o{ employee_custom_field_values : "has"

  %% ════════════════════════════════════════════════
  %% 3. 근로정보
  %% ════════════════════════════════════════════════

  wage_infos {
    uuid    id PK
    uuid    employee_id FK
    int     hourly_wage
    string  contracted_work_days
    decimal contracted_hours_per_week
    string  weekly_paid_holiday_day
    decimal max_hours_per_week
    date    effective_from
  }
  %% hourly_wage: 초과근무 기준 계산 및 향후 확장용 보존. 급여 정산 모듈은 현재 범위 외.

  employees ||--o{ wage_infos : "has history"

  %% ════════════════════════════════════════════════
  %% 4. 출퇴근 장소
  %% ════════════════════════════════════════════════

  timeclock_areas {
    uuid    id PK
    uuid    company_id FK
    string  name
    string  auth_method
    decimal location_lat
    decimal location_lng
    int     location_radius_meters
    string  wifi_ssid
    bool    is_active
  }
  %% auth_method: gps / wifi / gps_or_wifi / gps_and_wifi / none
  %% gps_and_wifi = GPS 반경 AND WiFi 연결 모두 충족해야 인증
  %% 회사 단위 스코프(company_id). 조직 연결은 organization_timeclock_areas(N:N)로 관리.

  organization_timeclock_areas {
    uuid   organization_id PK,FK
    uuid   timeclock_area_id PK,FK
    timestamptz created_at
  }
  %% 출퇴근 장소 ↔ 조직 N:N 조인 (한 장소를 여러 조직이 공유). 복합 PK.

  companies ||--o{ timeclock_areas : "owns"
  timeclock_areas ||--o{ organization_timeclock_areas : "linked via"
  organizations ||--o{ organization_timeclock_areas : "linked via"

  %% ════════════════════════════════════════════════
  %% 5. 근무일정
  %% ════════════════════════════════════════════════

  shift_types {
    uuid   id PK
    uuid   company_id FK
    string name
    string category
    string color
    bool   is_overtime
    bool   is_night
    bool   is_holiday
    bool   is_deemed_work
    int    deemed_work_hours
    bool   no_clock_in_required
    text   confirmed_alert
    jsonb  note_templates
    jsonb  org_scope_ids
    jsonb  position_scope_ids
  }

  shift_templates {
    uuid   id PK
    uuid   company_id FK
    uuid   shift_type_id FK
    string name
    string code
    time   start_time
    time   end_time
    bool   is_active
  }

  schedule_patterns {
    uuid   id PK
    uuid   company_id FK
    string name
    string description
    int    repeat_cycle_days
    jsonb  pattern_definition
    string holiday_handling
    bool   is_active
  }
  %% holiday_handling: skip_and_shift / skip_and_keep / no_skip

  shifts {
    uuid   id PK
    uuid   employee_id FK
    uuid   organization_id FK
    uuid   shift_type_id FK
    uuid   template_id FK
    timestamptz start_at
    timestamptz end_at
    bool   is_offsite
    string offsite_address
    decimal offsite_lat
    decimal offsite_lng
    string status
    uuid   confirmed_by FK
    timestamptz confirmed_at
    uuid   created_by FK
  }

  shift_break_times {
    uuid   id PK
    uuid   shift_id FK
    string break_type
    time   start_time
    time   end_time
    int    duration_minutes
    bool   is_auto
  }

  companies ||--o{ shift_types : "defines"
  companies ||--o{ shift_templates : "has"
  companies ||--o{ schedule_patterns : "has"
  employees ||--o{ shifts : "has"
  shift_types ||--o{ shifts : "categorizes"
  shifts ||--o{ shift_break_times : "has"

  %% ════════════════════════════════════════════════
  %% 6. 출퇴근 기록
  %% ════════════════════════════════════════════════

  attendances {
    uuid    id PK
    uuid    employee_id FK
    uuid    shift_id FK
    uuid    timeclock_area_id FK
    uuid    position_id FK
    timestamptz clock_in_at
    timestamptz clock_out_at
    decimal clock_in_lat
    decimal clock_in_lng
    decimal clock_out_lat
    decimal clock_out_lng
    string  clock_in_method
    string  clock_out_method
    string  status
    bool    is_oncall
    text    note
    bool    is_confirmed
    uuid    confirmed_by FK
    timestamptz confirmed_at
  }

  attendance_breaks {
    uuid  id PK
    uuid  attendance_id FK
    string break_type
    timestamptz start_at
    timestamptz end_at
    bool   is_manual
  }

  employees ||--o{ attendances : "records"
  shifts ||--o| attendances : "linked to"
  timeclock_areas ||--o{ attendances : "recorded at"
  positions ||--o{ attendances : "worked as"
  attendances ||--o{ attendance_breaks : "has"
  %% position_id: 무일정 출근 시 선택한 직무 기록 (nullable, onDelete SetNull)

  %% ════════════════════════════════════════════════
  %% 7. 휴가
  %% ════════════════════════════════════════════════

  leave_groups {
    uuid   id PK
    uuid   company_id FK
    string name
    string code
    int    overage_limit_days
  }

  leave_types {
    uuid    id PK
    uuid    group_id FK
    string  name
    string  display_name
    string  code
    string  time_option
    int     paid_hours
    decimal deduction_days
    string  special_option
    int     min_consecutive_days
    int     max_consecutive_days
    bool    include_holidays_in_consecutive
    bool    allow_arbitrary_time
    string  time_fixed_type
    decimal base_hours
    text    confirm_before_clockin
    bool    reason_display
    bool    delete_enclosed_shifts
    jsonb   org_scope_ids
    jsonb   position_scope_ids
    bool    is_active
  }
  %% time_fixed_type: paid_hours_based / not_fixed
  %% base_hours: time_fixed_type=not_fixed 일 때 기본 시간

  leave_accrual_rules {
    uuid   id PK
    uuid   company_id FK
    uuid   leave_group_id FK
    string name
    string memo
    bool   is_active
  }

  leave_accrual_rule_items {
    uuid    id PK
    uuid    rule_id FK
    string  accrual_basis
    int     tenure_months
    int     tenure_years
    decimal accrual_days
    int     valid_months
    string  period_start_md
    string  period_end_md
    int     sort_order
  }
  %% accrual_basis: monthly / yearly
  %% Enterprise 전용(소정근로시간 비례 발생, 출근율 기반) 제외

  leave_balances {
    uuid    id PK
    uuid    employee_id FK
    uuid    leave_type_id FK
    int     year
    decimal accrued_days
    decimal used_days
    decimal remaining_days
    date    expires_at
  }

  leaves {
    uuid    id PK
    uuid    employee_id FK
    uuid    leave_type_id FK
    date    start_date
    date    end_date
    time    start_time
    time    end_time
    decimal days_used
    string  status
    string  reason
  }

  companies ||--o{ leave_groups : "has"
  leave_groups ||--o{ leave_types : "contains"
  companies ||--o{ leave_accrual_rules : "has"
  leave_groups ||--o{ leave_accrual_rules : "scoped to"
  leave_accrual_rules ||--o{ leave_accrual_rule_items : "defined by"
  employees ||--o{ leave_balances : "has"
  leave_types ||--o{ leave_balances : "for"
  employees ||--o{ leaves : "takes"
  leave_types ||--o{ leaves : "categorized by"

  %% ════════════════════════════════════════════════
  %% 8. 요청 (HR 결재 연동)
  %% ════════════════════════════════════════════════

  custom_request_types {
    uuid   id PK
    uuid   company_id FK
    string name
    bool   is_active
    bool   enable_pdf
    bool   allow_employee_pdf
  }

  custom_request_type_fields {
    uuid   id PK
    uuid   custom_type_id FK
    string field_name
    string field_type
    bool   is_required
    jsonb  options
    text   description
    text   image_url
    int    sort_order
  }

  requests {
    uuid   id PK
    uuid   company_id FK
    uuid   requester_id FK
    string type
    jsonb  payload
    string status
    uuid   document_id FK
    timestamptz created_at
  }

  approval_rules {
    uuid   id PK
    uuid   company_id FK
    string name
    string request_type
    uuid   custom_type_id FK
    int    priority
    jsonb  scope_org_ids
    jsonb  scope_position_ids
    int    max_approval_rounds
    bool   is_auto_approve
    jsonb  advanced_settings
  }

  approval_rule_details {
    uuid   id PK
    uuid   rule_id FK
    string tag
    int    round
    int    required_count
    uuid   approver_position_id FK
    bool   is_forbidden
    int    sort_order
  }

  request_approvals {
    uuid    id PK
    uuid    request_id FK
    int     round
    uuid    approver_id FK
    string  status
    string  comment
    timestamptz acted_at
  }

  companies ||--o{ custom_request_types : "defines"
  custom_request_types ||--o{ custom_request_type_fields : "has"
  employees ||--o{ requests : "submits"
  companies ||--o{ approval_rules : "configures"
  approval_rules ||--o{ approval_rule_details : "has details"
  requests ||--o{ request_approvals : "processed by"
  custom_request_types ||--o{ approval_rules : "applies to"

  %% ════════════════════════════════════════════════
  %% 9. 전자결재
  %% ════════════════════════════════════════════════

  form_categories {
    uuid   id PK
    uuid   company_id FK
    string name
    int    sort_order
    bool   is_active
  }

  document_categories {
    uuid   id PK
    uuid   company_id FK
    string name "사업관리/일반관리/인사관리/LABL CHINA 등"
    string abbreviation "문서번호 {CATEGORY} 토큰"
    int    sort_order
    bool   is_active
  }

  document_forms {
    uuid   id PK
    uuid   company_id FK
    uuid   form_owner_id FK
    uuid   category_id FK
    string name
    string category
    jsonb  fields_schema
    string visibility_scope
    int    retention_years
    string abbreviation
    string description
    int    sort_order
    bool   allow_re_draft
    bool   allow_pre_approval
    bool   allow_zip_upload
    bool   is_active
  }

  form_access_rules {
    uuid   id PK
    uuid   form_id FK
    string scope_type
    uuid   scope_id
  }

  document_number_rules {
    uuid   id PK
    uuid   company_id FK
    uuid   form_id FK
    string pattern
    int    current_seq
    bool   reset_yearly
  }

  documents {
    uuid    id PK
    uuid    company_id FK
    uuid    form_id FK
    uuid    category_id FK "문서성격(채번 대분류)"
    uuid    request_id FK
    string  doc_number
    string  title
    jsonb   content
    uuid    drafter_id FK
    string  status
    string  visibility_scope
    timestamptz submitted_at
    timestamptz completed_at
    timestamptz created_at
  }

  document_attachments {
    uuid   id PK
    uuid   company_id FK
    uuid   document_id FK
    uuid   uploader_id FK
    string file_name
    string storage_key
    string content_type
    int    size
    timestamptz created_at
  }

  approval_lines {
    uuid   id PK
    uuid   document_id FK
    string name
    bool   is_shared
    uuid   shared_line_ref_id FK
  }

  approval_steps {
    uuid    id PK
    uuid    line_id FK
    string  role
    uuid    assignee_id FK
    int     step_order
    bool    is_parallel
    string  status
    string  comment
    bool    is_proxy
    uuid    proxy_id FK
    string  proxy_reason
    timestamptz acted_at
  }

  approval_history {
    uuid    id PK
    uuid    document_id FK
    uuid    step_id FK
    uuid    actor_id FK
    string  action
    string  comment
    timestamptz created_at
  }

  proxy_settings {
    uuid   id PK
    uuid   principal_id FK
    uuid   proxy_id FK
    date   start_date
    date   end_date
    string reason
    bool   is_active
    timestamptz created_at
  }

  shared_approval_lines {
    uuid   id PK
    uuid   company_id FK
    uuid   created_by_id FK
    string scope "COMPANY(공용)/PERSONAL(개인)"
    string name
    jsonb  steps
    int    version
    timestamptz created_at
    timestamptz updated_at
  }

  companies ||--o{ form_categories : "defines"
  form_categories ||--o{ document_forms : "groups"
  companies ||--o{ document_forms : "defines"
  document_forms ||--o{ form_access_rules : "restricts"
  document_forms ||--o{ document_number_rules : "has"
  document_forms ||--o{ documents : "used by"
  companies ||--o{ document_categories : "defines"
  document_categories ||--o{ documents : "classifies"
  employees ||--o{ documents : "drafts"
  documents ||--o{ document_attachments : "attaches"
  employees ||--o{ document_attachments : "uploads"
  documents ||--o{ approval_lines : "has"
  approval_lines ||--o{ approval_steps : "contains"
  documents ||--o{ approval_history : "logged in"
  requests ||--o| documents : "generates"
  employees ||--o{ proxy_settings : "sets"
  companies ||--o{ shared_approval_lines : "has"
  shared_approval_lines ||--o{ approval_lines : "referenced by"

  %% ════════════════════════════════════════════════
  %% 10. 표준화 규칙 / 리포트
  %% ════════════════════════════════════════════════

  standardization_rules {
    uuid   id PK
    uuid   company_id FK
    uuid   position_id FK
    string name
    string calculation_basis
    string start_time_rule
    string end_time_rule
    bool   exclude_no_checkin
    bool   include_manual_break
    bool   is_default
  }
  %% calculation_basis: attendance(출퇴근기록 기준) / shift(근무일정 기준)
  %% start_time_rule / end_time_rule 허용값:
  %%   actual       - 실제 기록 그대로
  %%   shift_start  - 근무일정 시작/종료 시간으로 맞춤
  %%   round_up_5   - 5분 단위 올림
  %%   round_down_5 - 5분 단위 내림
  %%   round_up_10  - 10분 단위 올림
  %%   round_down_10- 10분 단위 내림
  %%   round_up_30  - 30분 단위 올림

  report_snapshot_templates {
    uuid   id PK
    uuid   company_id FK
    string name
    jsonb  column_config
    bool   include_leave_stats
    bool   is_active
  }

  report_snapshots {
    uuid    id PK
    uuid    company_id FK
    uuid    template_id FK
    date    period_start
    date    period_end
    jsonb   column_config
    bool    is_locked
    uuid    locked_by FK
    timestamptz locked_at
    timestamptz created_at
  }

  report_snapshot_rows {
    uuid    id PK
    uuid    snapshot_id FK
    uuid    employee_id FK
    jsonb   values
    jsonb   calculation_basis
  }

  custom_report_columns {
    uuid   id PK
    uuid   company_id FK
    string name
    text   formula
    uuid   filter_leave_type_id FK
    uuid   filter_shift_type_id FK
    string date_specified
    jsonb  position_ids
    int    sort_order
  }

  companies ||--o{ standardization_rules : "has"
  companies ||--o{ report_snapshot_templates : "has"
  companies ||--o{ report_snapshots : "has"
  report_snapshot_templates ||--o{ report_snapshots : "used by"
  report_snapshots ||--o{ report_snapshot_rows : "contains"
  companies ||--o{ custom_report_columns : "has"

  %% ════════════════════════════════════════════════
  %% 11. 메시지 / 자동화
  %% ════════════════════════════════════════════════

  message_templates {
    uuid   id PK
    uuid   company_id FK
    string name
    text   content
    bool   has_variables
    timestamptz created_at
  }

  message_automations {
    uuid   id PK
    uuid   company_id FK
    string name
    string automation_type
    uuid   leave_type_id FK
    string trigger_basis
    int    offset_days
    time   send_time
    string timezone
    uuid   template_id FK
    bool   send_email
    bool   is_active
    date   starts_at
  }

  messages {
    uuid   id PK
    uuid   company_id FK
    uuid   sender_id FK
    uuid   automation_id FK
    string type
    string title
    text   content
    timestamptz sent_at
  }

  message_recipients {
    uuid   id PK
    uuid   message_id FK
    uuid   recipient_id FK
    timestamptz read_at
    text   note
  }

  companies ||--o{ message_templates : "has"
  companies ||--o{ message_automations : "has"
  message_automations ||--o| message_templates : "uses"
  companies ||--o{ messages : "has"
  messages ||--o{ message_recipients : "sent to"

  %% ════════════════════════════════════════════════
  %% 12. 알림
  %% ════════════════════════════════════════════════

  notification_rules {
    uuid   id PK
    uuid   company_id FK
    string event_type
    string channel_type
    string webhook_url
    jsonb  trigger_condition
    jsonb  embed_template
    uuid   message_template_id FK
    bool   is_active
    string cron_expression
  }

  notification_logs {
    uuid    id PK
    uuid    rule_id FK
    string  event_type
    jsonb   payload
    string  status
    int     retry_count
    string  error_message
    timestamptz sent_at
  }

  companies ||--o{ notification_rules : "configures"
  notification_rules ||--o{ notification_logs : "generates"

```

---

## 테이블 목록 (56개 도메인 테이블)

| # | 테이블 | 설명 |
|---|---|---|
| 1 | companies | 회사 기본정보 |
| 2 | organizations | 부서/팀/지점 계층 |
| 3 | company_holidays | 법인 휴일 |
| 4 | company_settings | 회사 설정 (key-value, section별) |
| 5 | users | 로그인 계정 |
| 6 | employees | 직원 정보 |
| 7 | employee_organizations | 직원-조직 N:M |
| 8 | positions | 직무 |
| 9 | employee_positions | 직원-직무 N:M |
| 10 | employee_custom_fields | 직원 커스텀 필드 정의 |
| 11 | employee_custom_field_values | 직원 커스텀 필드 값 |
| 12 | wage_infos | 근로정보 이력 (시급·소정근로규칙) |
| 13 | **timeclock_areas** | **출퇴근 장소 (GPS/WiFi, 회사 단위 스코프)** |
| 14 | shift_types | 근무일정 유형 |
| 15 | shift_templates | 근무일정 템플릿 |
| 16 | schedule_patterns | 반복 스케줄 패턴 |
| 17 | shifts | 근무일정 |
| 18 | shift_break_times | 근무일정 휴게시간 |
| 19 | attendances | 출퇴근 기록 |
| 20 | attendance_breaks | 출퇴근 휴게시간 기록 |
| 21 | leave_groups | 휴가 그룹 |
| 22 | leave_types | 휴가 유형 |
| 23 | leave_accrual_rules | 휴가 자동 발생 규칙 |
| 24 | leave_accrual_rule_items | 발생 규칙 상세 |
| 25 | leave_balances | 잔여 휴가 |
| 26 | leaves | 휴가 일정 |
| 27 | **custom_request_types** | **커스텀 요청 유형 정의** |
| 28 | **custom_request_type_fields** | **커스텀 요청 필드** |
| 29 | requests | HR 요청 |
| 30 | approval_rules | 승인 규칙 |
| 31 | approval_rule_details | 태그별 상세 승인 규칙 |
| 32 | request_approvals | 요청 승인 이력 |
| 33 | document_forms | 기안양식 |
| 34 | form_access_rules | 양식 접근 권한 |
| 35 | document_number_rules | 문서번호 채번 규칙 |
| 36 | documents | 기안문서 |
| 37 | approval_lines | 결재선 인스턴스 |
| 38 | approval_steps | 결재 단계 |
| 39 | approval_history | 결재 감사 이력 |
| 40 | proxy_settings | 대리결재 설정 이력 |
| 41 | shared_approval_lines | 공용 결재선 템플릿 |
| 42 | **standardization_rules** | **표준화 규칙 (지각/조퇴 기준)** |
| 43 | report_snapshot_templates | 리포트 스냅샷 템플릿 |
| 44 | report_snapshots | 리포트 스냅샷 |
| 45 | report_snapshot_rows | 스냅샷 행 데이터 |
| 46 | **custom_report_columns** | **커스텀 리포트 항목** |
| 47 | message_templates | 메시지 템플릿 |
| 48 | message_automations | 메시지 자동화 규칙 |
| 49 | **messages** | **수동/자동 메시지 발송** |
| 50 | **message_recipients** | **메시지 수신자** |
| 51 | notification_rules | Discord/이메일 알림 규칙 |
| 52 | notification_logs | 알림 발송 이력 |
| 53 | **document_attachments** | **기안 첨부파일 (MinIO 오브젝트 메타)** |
| 54 | **form_categories** | **기안양식 분류(양식함)** |
| 55 | **document_categories** | **문서성격(채번 대분류 — 사업/일반/인사/LABL CHINA)** |
| 56 | **organization_timeclock_areas** | **출퇴근 장소 ↔ 조직 N:N 조인** |

---

## 핵심 상태값 정의

### documents.status
| 값 | 의미 |
|---|---|
| `DRAFT` | 임시저장 |
| `PENDING` | 진행중 (상신됨) |
| `APPROVED` | 결재 완료 |
| `REJECTED` | 반려됨 |
| `RECALLED` | 회수됨 |

### approval_steps.status
| 값 | 의미 |
|---|---|
| `PENDING` | 결재 대기 |
| `APPROVED` | 승인 |
| `REJECTED` | 반려 |
| `PRE_APPROVED` | 전결 (이후 단계 자동 스킵) |
| `PROXY_APPROVED` | 대결 (proxy_id로 처리) |
| `RETURNED` | 전단계 반려 |
| `CANCELLED` | 결재 취소 |
| `SKIPPED` | 전결에 의해 자동 스킵됨 |

### approval_steps.role
| 값 | 의미 |
|---|---|
| `APPROVER` | 결재자 |
| `COLLABORATOR` | 협조자 |
| `DEPT_COLLABORATOR` | 부서협조 담당자 |
| `VIEWER` | 공람자 |
| `CC` | 참조자 |
| `RECEIVER` | 수신자 |
| `DEPT_RECEIVER` | 부서수신 담당자 |

### documents.visibility_scope
| 값 | 의미 |
|---|---|
| `PUBLIC` | 전체 공개 |
| `DEPT_ONLY` | 관련 부서만 |
| `PRIVATE` | 관계자만 |

### attendances.status
| 값 | 의미 |
|---|---|
| `NORMAL` | 정상 |
| `LATE` | 지각 |
| `EARLY_LEAVE` | 조퇴 |
| `ABSENT` | 결근 |
| `ON_LEAVE` | 휴가 중 |

### leaves.status
| 값 | 의미 |
|---|---|
| `PENDING` | 승인 대기 |
| `APPROVED` | 승인됨 |
| `REJECTED` | 거절됨 |
| `CANCELLED` | 취소됨 |

### requests.status
| 값 | 의미 |
|---|---|
| `PENDING` | 승인 대기 |
| `APPROVED` | 승인됨 |
| `FORCE_APPROVED` | 강제 승인 |
| `REJECTED` | 거절됨 |
| `FORCE_REJECTED` | 강제 거절 |
| `CANCELLED` | 요청자가 취소 |

---

## company_settings 섹션별 키 목록

| section | key | 설명 |
|---|---|---|
| general | week_start_day | 1주 시작 요일 |
| general | time_format | 12h / 24h |
| general | night_work_start | 야간근무 시작 시각 |
| general | night_work_end | 야간근무 종료 시각 |
| general | company_policy_markdown | 회사방침 마크다운 |
| employee | enable_employee_number | 사원번호 기능 활성화 |
| employee | enable_custom_fields | 커스텀 필드 기능 |
| attendance | enable_pc_clockin | PC 출퇴근 활성화 |
| attendance | allow_no_sim_device | 공기계 허용 |
| attendance | oncall_policy | always/if_no_shift/never |
| attendance | clockin_before_shift_minutes | 근무 시작 전 출근 허용 분 |
| attendance | enable_clockout_button | 퇴근 버튼 사용 여부 |
| attendance | allow_clockout_from_other_org | 다른 조직 근무지 퇴근 허용 |
| attendance | auto_clockout_hours | 출근 후 자동 퇴근 처리 시간(시) |
| attendance | enable_confirmation | 출퇴근 확정 기능 |
| break | auto_break_basis | total_hours / specific_time |
| break | auto_break_rules | JSONB 배열 (기준시간→휴게분) |
| break | enable_shift_break | 근무일정 휴게시간 기능 |
| break | enable_manual_break | 수동 휴게시간 기록 |
| break | min_break_minutes | 최소 휴게시간(분) |
| break | max_break_minutes | 최대 휴게시간(분) |
| shift | enable_template_code | 템플릿 코드 기능 |
| shift | enable_confirmation | 근무일정 확정 기능 |
| shift | enable_deemed_work | 간주근로 기능 |
| shift | enable_offsite | 근무지 외 출근 기능 |
| shift | max_overtime_hours_per_week | 주간 최대 연장근로시간 |
| shift | enable_other_employees_view | 직원이 다른 직원 근무일정 조회 허용 |
| shift | enable_core_time | 코어타임 기능 |
| leave | enable_type_code | 휴가 유형 코드 기능 |
| leave | enable_display_name | 표시 이름 기능 |
| leave | enable_reason_display | 사유 표시 기능 |
| request | enable_core_time | 코어타임 설정 |
| request | core_time_start | 코어타임 시작 시각 |
| request | core_time_end | 코어타임 종료 시각 |
| request | time_interval_minutes | 요청 시간 단위 간격 (15/30분) |
| permission | org_admin_permissions | JSONB: 조직관리자 세부 권한 목록 |
| permission | employee_permissions | JSONB: 직원 세부 권한 목록 |
| notification | admin_clock_in_alert | 관리자 출근 알림 활성화 |
| notification | late_alert_minutes | 지각 Discord 알림 발송 기준 분 |
| attendance | late_grace_minutes | 지각 판정 유예 시간 (0~120분, 0이면 1초라도 늦으면 지각) |
| notification | shift_start_alert_minutes | 근무 시작 전 알림 분 (최대 5개, JSONB) |
| notification | overtime_alert_enabled | 초과근무 알림 활성화 |
| security | auto_logout_minutes | 자동 로그아웃 분 |
| approval | enable_service | 전자결재 서비스 활성화 |
| approval | enable_prev_step_reject | 전단계 반려 허용 |
| approval | enable_upper_line_change | 상위 결재선 변경 허용 |
| approval | enable_zip_upload | 압축파일 업로드 허용 |
| approval | doc_number_display | 사용자 정보 표시 방식 |
| report | standardization_default_basis | 기본 표준화 기준 (attendance / shift) |
| message | enable_message_feature | 메시지 기능 활성화 |
| message | enable_message_automation | 메시지 자동화 기능 활성화 |
| advanced | enable_bulk_approve | 요청 일괄 승인 기능 |
