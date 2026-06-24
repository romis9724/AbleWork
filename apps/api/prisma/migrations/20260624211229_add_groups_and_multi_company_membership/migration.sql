-- 멀티컴퍼니(그룹) 확장 마이그레이션
-- 설계: docs/design/MULTI_COMPANY_GROUP.md
--   1) groups 테이블 신설
--   2) companies.group_id 추가 + 기존 회사 단독 그룹(1:1) 백필
--   3) employees.user_id 전역 UNIQUE 제거 → (company_id, user_id) UNIQUE
--   4) users.last_company_id 추가 (회사 전환 기억)

-- 1. groups 테이블 생성
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- 2. companies.group_id 컬럼 추가 (우선 NULL 허용 — 백필 후 NOT NULL)
ALTER TABLE "companies" ADD COLUMN "group_id" TEXT;

-- 3. 백필: 기존 회사마다 동명 단독 그룹 1:1 생성 + 연결
DO $$
DECLARE
    c RECORD;
    new_group_id TEXT;
BEGIN
    FOR c IN SELECT "id", "name" FROM "companies" WHERE "group_id" IS NULL LOOP
        new_group_id := gen_random_uuid()::text;
        INSERT INTO "groups" ("id", "name", "is_active", "created_at", "updated_at")
        VALUES (new_group_id, c."name", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        UPDATE "companies" SET "group_id" = new_group_id WHERE "id" = c."id";
    END LOOP;
END $$;

-- 4. group_id NOT NULL + 인덱스 + FK
ALTER TABLE "companies" ALTER COLUMN "group_id" SET NOT NULL;
CREATE INDEX "companies_group_id_idx" ON "companies"("group_id");
ALTER TABLE "companies" ADD CONSTRAINT "companies_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. employees: 전역 user_id UNIQUE 제거 → (company_id, user_id) 복합 UNIQUE + user_id 인덱스
DROP INDEX "employees_user_id_key";
CREATE UNIQUE INDEX "employees_company_id_user_id_key" ON "employees"("company_id", "user_id");
CREATE INDEX "employees_user_id_idx" ON "employees"("user_id");

-- 6. users.last_company_id 추가 (FK 미강제 — 로그인 시 유효성 재검증)
ALTER TABLE "users" ADD COLUMN "last_company_id" TEXT;
