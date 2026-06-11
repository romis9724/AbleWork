-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "business_number" VARCHAR(20),
    "founded_at" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "locale" TEXT NOT NULL DEFAULT 'ko',
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'KR',
    "logo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "approver_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_holidays" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_annual_repeat" BOOLEAN NOT NULL DEFAULT false,
    "type" VARCHAR(20) NOT NULL DEFAULT 'custom',

    CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "section" VARCHAR(50) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(20),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "employee_number" VARCHAR(50),
    "name" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(20),
    "joined_at" DATE NOT NULL,
    "resigned_at" DATE,
    "employment_type" VARCHAR(20) NOT NULL,
    "access_level" VARCHAR(20) NOT NULL,
    "device_id" VARCHAR(255),
    "device_bound_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_organizations" (
    "employee_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_organizations_pkey" PRIMARY KEY ("employee_id","organization_id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_positions" (
    "employee_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,

    CONSTRAINT "employee_positions_pkey" PRIMARY KEY ("employee_id","position_id")
);

-- CreateTable
CREATE TABLE "employee_custom_fields" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "field_name" VARCHAR(100) NOT NULL,
    "field_type" VARCHAR(30) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_custom_field_values" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "field_id" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "employee_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_infos" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "hourly_wage" INTEGER NOT NULL DEFAULT 0,
    "contracted_work_days" VARCHAR(50) NOT NULL,
    "contracted_hours_per_week" DECIMAL(5,2) NOT NULL,
    "weekly_paid_holiday_day" VARCHAR(10),
    "max_hours_per_week" DECIMAL(5,2) NOT NULL DEFAULT 52,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wage_infos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeclock_areas" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "auth_method" VARCHAR(20) NOT NULL,
    "location_lat" DECIMAL(10,7),
    "location_lng" DECIMAL(10,7),
    "location_radius_meters" INTEGER,
    "wifi_ssid" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timeclock_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_types" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "color" VARCHAR(20),
    "is_overtime" BOOLEAN NOT NULL DEFAULT false,
    "is_night" BOOLEAN NOT NULL DEFAULT false,
    "is_holiday" BOOLEAN NOT NULL DEFAULT false,
    "is_deemed_work" BOOLEAN NOT NULL DEFAULT false,
    "deemed_work_hours" INTEGER,
    "no_clock_in_required" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_alert" TEXT,
    "note_templates" JSONB,
    "org_scope_ids" JSONB,
    "position_scope_ids" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "shift_type_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20),
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_patterns" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "repeat_cycle_days" INTEGER NOT NULL,
    "pattern_definition" JSONB NOT NULL,
    "holiday_handling" VARCHAR(30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "shift_type_id" TEXT NOT NULL,
    "template_id" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "is_offsite" BOOLEAN NOT NULL DEFAULT false,
    "offsite_address" TEXT,
    "offsite_lat" DECIMAL(10,7),
    "offsite_lng" DECIMAL(10,7),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_break_times" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "break_type" VARCHAR(20) NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "is_auto" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shift_break_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "timeclock_area_id" TEXT,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "clock_in_lat" DECIMAL(10,7),
    "clock_in_lng" DECIMAL(10,7),
    "clock_out_lat" DECIMAL(10,7),
    "clock_out_lng" DECIMAL(10,7),
    "clock_in_method" VARCHAR(20),
    "clock_out_method" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "is_oncall" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_breaks" (
    "id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "break_type" VARCHAR(20) NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "is_manual" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "attendance_breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_groups" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20),
    "overage_limit_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(100),
    "code" VARCHAR(20),
    "time_option" VARCHAR(20) NOT NULL DEFAULT 'full_day',
    "paid_hours" INTEGER,
    "deduction_days" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "special_option" VARCHAR(30),
    "min_consecutive_days" INTEGER,
    "max_consecutive_days" INTEGER,
    "include_holidays_in_consecutive" BOOLEAN NOT NULL DEFAULT false,
    "allow_arbitrary_time" BOOLEAN NOT NULL DEFAULT false,
    "time_fixed_type" VARCHAR(30),
    "base_hours" DECIMAL(5,2),
    "confirm_before_clockin" TEXT,
    "reason_display" BOOLEAN NOT NULL DEFAULT false,
    "delete_enclosed_shifts" BOOLEAN NOT NULL DEFAULT false,
    "org_scope_ids" JSONB,
    "position_scope_ids" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_accrual_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "leave_group_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "memo" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_accrual_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_accrual_rule_items" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "accrual_basis" VARCHAR(10) NOT NULL,
    "tenure_months" INTEGER,
    "tenure_years" INTEGER,
    "accrual_days" DECIMAL(5,2) NOT NULL,
    "valid_months" INTEGER,
    "period_start_md" VARCHAR(5),
    "period_end_md" VARCHAR(5),
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "leave_accrual_rule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "accrued_days" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "used_days" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "remaining_days" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "expires_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TIME,
    "end_time" TIME,
    "days_used" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_request_types" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "enable_pdf" BOOLEAN NOT NULL DEFAULT false,
    "allow_employee_pdf" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_request_type_fields" (
    "id" TEXT NOT NULL,
    "custom_type_id" TEXT NOT NULL,
    "field_name" VARCHAR(100) NOT NULL,
    "field_type" VARCHAR(30) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "description" TEXT,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "custom_request_type_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "request_type" VARCHAR(30) NOT NULL,
    "custom_type_id" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scope_org_ids" JSONB,
    "scope_position_ids" JSONB,
    "max_approval_rounds" INTEGER NOT NULL DEFAULT 1,
    "is_auto_approve" BOOLEAN NOT NULL DEFAULT false,
    "advanced_settings" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_rule_details" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "tag" VARCHAR(30),
    "round" INTEGER NOT NULL DEFAULT 1,
    "required_count" INTEGER NOT NULL DEFAULT 1,
    "approver_position_id" TEXT,
    "is_forbidden" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "approval_rule_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_approvals" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "approver_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "comment" TEXT,
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_forms" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "form_owner_id" TEXT,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100),
    "fields_schema" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "allow_re_draft" BOOLEAN NOT NULL DEFAULT false,
    "allow_pre_approval" BOOLEAN NOT NULL DEFAULT false,
    "allow_zip_upload" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_access_rules" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_id" TEXT NOT NULL,

    CONSTRAINT "form_access_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_number_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "pattern" VARCHAR(200) NOT NULL,
    "current_seq" INTEGER NOT NULL DEFAULT 0,
    "reset_yearly" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_number_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "request_id" TEXT,
    "doc_number" VARCHAR(100),
    "title" VARCHAR(200) NOT NULL,
    "content" JSONB NOT NULL,
    "drafter_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "visibility_scope" VARCHAR(20) NOT NULL DEFAULT 'PRIVATE',
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_lines" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "name" VARCHAR(100),
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "shared_line_ref_id" TEXT,

    CONSTRAINT "approval_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "role" VARCHAR(30) NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "is_parallel" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "is_proxy" BOOLEAN NOT NULL DEFAULT false,
    "proxy_id" TEXT,
    "proxy_reason" TEXT,
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_history" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "step_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy_settings" (
    "id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "proxy_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proxy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_approval_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "steps" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_approval_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standardization_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "position_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "calculation_basis" VARCHAR(20) NOT NULL,
    "start_time_rule" VARCHAR(20) NOT NULL,
    "end_time_rule" VARCHAR(20) NOT NULL,
    "exclude_no_checkin" BOOLEAN NOT NULL DEFAULT false,
    "include_manual_break" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standardization_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_snapshot_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "column_config" JSONB NOT NULL,
    "include_leave_stats" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_snapshot_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "template_id" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "column_config" JSONB NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_snapshot_rows" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "calculation_basis" JSONB NOT NULL,

    CONSTRAINT "report_snapshot_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_report_columns" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "formula" TEXT NOT NULL,
    "filter_leave_type_id" TEXT,
    "filter_shift_type_id" TEXT,
    "date_specified" VARCHAR(10),
    "position_ids" JSONB,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "custom_report_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "has_variables" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_automations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "automation_type" VARCHAR(30) NOT NULL,
    "leave_type_id" TEXT,
    "trigger_basis" VARCHAR(20) NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "send_time" TIME NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "template_id" TEXT NOT NULL,
    "send_email" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "automation_id" TEXT,
    "type" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200),
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "channel_type" VARCHAR(20) NOT NULL,
    "webhook_url" TEXT,
    "trigger_condition" JSONB,
    "embed_template" JSONB,
    "message_template_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "cron_expression" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT,
    "event_type" VARCHAR(50) NOT NULL,
    "payload" JSONB,
    "status" VARCHAR(20) NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_company_id_is_active_idx" ON "organizations"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "company_holidays_company_id_holiday_date_idx" ON "company_holidays"("company_id", "holiday_date");

-- CreateIndex
CREATE INDEX "company_settings_company_id_section_key_idx" ON "company_settings"("company_id", "section", "key");

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_company_id_section_key_key" ON "company_settings"("company_id", "section", "key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_company_id_is_active_idx" ON "employees"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "employees_company_id_access_level_idx" ON "employees"("company_id", "access_level");

-- CreateIndex
CREATE UNIQUE INDEX "employee_custom_field_values_employee_id_field_id_key" ON "employee_custom_field_values"("employee_id", "field_id");

-- CreateIndex
CREATE INDEX "wage_infos_employee_id_effective_from_idx" ON "wage_infos"("employee_id", "effective_from" DESC);

-- CreateIndex
CREATE INDEX "shift_types_company_id_is_active_idx" ON "shift_types"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "shifts_employee_id_start_at_end_at_idx" ON "shifts"("employee_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "shifts_organization_id_start_at_end_at_idx" ON "shifts"("organization_id", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_shift_id_key" ON "attendances"("shift_id");

-- CreateIndex
CREATE INDEX "attendances_employee_id_clock_in_at_idx" ON "attendances"("employee_id", "clock_in_at");

-- CreateIndex
CREATE INDEX "attendances_employee_id_status_idx" ON "attendances"("employee_id", "status");

-- CreateIndex
CREATE INDEX "leave_balances_employee_id_idx" ON "leave_balances"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_id_year_key" ON "leave_balances"("employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "leaves_employee_id_start_date_end_date_idx" ON "leaves"("employee_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "requests_document_id_key" ON "requests"("document_id");

-- CreateIndex
CREATE INDEX "requests_requester_id_status_idx" ON "requests"("requester_id", "status");

-- CreateIndex
CREATE INDEX "requests_company_id_status_idx" ON "requests"("company_id", "status");

-- CreateIndex
CREATE INDEX "document_forms_company_id_is_active_idx" ON "document_forms"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "documents_request_id_key" ON "documents"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_doc_number_key" ON "documents"("doc_number");

-- CreateIndex
CREATE INDEX "documents_company_id_status_idx" ON "documents"("company_id", "status");

-- CreateIndex
CREATE INDEX "documents_drafter_id_status_idx" ON "documents"("drafter_id", "status");

-- CreateIndex
CREATE INDEX "approval_steps_assignee_id_status_idx" ON "approval_steps"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "approval_history_document_id_created_at_idx" ON "approval_history"("document_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "report_snapshots_company_id_period_start_period_end_idx" ON "report_snapshots"("company_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "messages_company_id_sent_at_idx" ON "messages"("company_id", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "message_recipients_recipient_id_read_at_idx" ON "message_recipients"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_rules_company_id_event_type_is_active_idx" ON "notification_rules"("company_id", "event_type", "is_active");

-- CreateIndex
CREATE INDEX "notification_logs_rule_id_sent_at_idx" ON "notification_logs"("rule_id", "sent_at" DESC);

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_holidays" ADD CONSTRAINT "company_holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_organizations" ADD CONSTRAINT "employee_organizations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_organizations" ADD CONSTRAINT "employee_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_positions" ADD CONSTRAINT "employee_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_custom_fields" ADD CONSTRAINT "employee_custom_fields_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_custom_field_values" ADD CONSTRAINT "employee_custom_field_values_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_custom_field_values" ADD CONSTRAINT "employee_custom_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "employee_custom_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_infos" ADD CONSTRAINT "wage_infos_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeclock_areas" ADD CONSTRAINT "timeclock_areas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_shift_type_id_fkey" FOREIGN KEY ("shift_type_id") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_patterns" ADD CONSTRAINT "schedule_patterns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shift_type_id_fkey" FOREIGN KEY ("shift_type_id") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_break_times" ADD CONSTRAINT "shift_break_times_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_timeclock_area_id_fkey" FOREIGN KEY ("timeclock_area_id") REFERENCES "timeclock_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_breaks" ADD CONSTRAINT "attendance_breaks_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_groups" ADD CONSTRAINT "leave_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "leave_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_accrual_rules" ADD CONSTRAINT "leave_accrual_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_accrual_rules" ADD CONSTRAINT "leave_accrual_rules_leave_group_id_fkey" FOREIGN KEY ("leave_group_id") REFERENCES "leave_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_accrual_rule_items" ADD CONSTRAINT "leave_accrual_rule_items_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "leave_accrual_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_request_types" ADD CONSTRAINT "custom_request_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_request_type_fields" ADD CONSTRAINT "custom_request_type_fields_custom_type_id_fkey" FOREIGN KEY ("custom_type_id") REFERENCES "custom_request_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_custom_type_id_fkey" FOREIGN KEY ("custom_type_id") REFERENCES "custom_request_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rule_details" ADD CONSTRAINT "approval_rule_details_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "approval_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_rule_details" ADD CONSTRAINT "approval_rule_details_approver_position_id_fkey" FOREIGN KEY ("approver_position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_approvals" ADD CONSTRAINT "request_approvals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_forms" ADD CONSTRAINT "document_forms_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_access_rules" ADD CONSTRAINT "form_access_rules_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "document_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_number_rules" ADD CONSTRAINT "document_number_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_number_rules" ADD CONSTRAINT "document_number_rules_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "document_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "document_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_drafter_id_fkey" FOREIGN KEY ("drafter_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_lines" ADD CONSTRAINT "approval_lines_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_lines" ADD CONSTRAINT "approval_lines_shared_line_ref_id_fkey" FOREIGN KEY ("shared_line_ref_id") REFERENCES "shared_approval_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "approval_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_proxy_id_fkey" FOREIGN KEY ("proxy_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_settings" ADD CONSTRAINT "proxy_settings_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proxy_settings" ADD CONSTRAINT "proxy_settings_proxy_id_fkey" FOREIGN KEY ("proxy_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_approval_lines" ADD CONSTRAINT "shared_approval_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standardization_rules" ADD CONSTRAINT "standardization_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standardization_rules" ADD CONSTRAINT "standardization_rules_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshot_templates" ADD CONSTRAINT "report_snapshot_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "report_snapshot_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_snapshot_rows" ADD CONSTRAINT "report_snapshot_rows_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "report_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_report_columns" ADD CONSTRAINT "custom_report_columns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_report_columns" ADD CONSTRAINT "custom_report_columns_filter_leave_type_id_fkey" FOREIGN KEY ("filter_leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_report_columns" ADD CONSTRAINT "custom_report_columns_filter_shift_type_id_fkey" FOREIGN KEY ("filter_shift_type_id") REFERENCES "shift_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_automations" ADD CONSTRAINT "message_automations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_automations" ADD CONSTRAINT "message_automations_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_automations" ADD CONSTRAINT "message_automations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_message_template_id_fkey" FOREIGN KEY ("message_template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "notification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
