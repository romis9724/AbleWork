-- 출퇴근 장소 ↔ 조직 관계를 1:N → N:N 으로 전환
-- 1) timeclock_areas.company_id 추가(직접 회사 스코프)
-- 2) organization_timeclock_areas 조인 테이블 생성 + 기존 organization_id 이관
-- 3) timeclock_areas.organization_id 제거

-- ── 1) company_id 컬럼 추가 (우선 nullable) ─────────────────────────────────
ALTER TABLE "timeclock_areas" ADD COLUMN "company_id" TEXT;

-- 기존 데이터 백필: 장소의 조직이 속한 회사로 company_id 채움
UPDATE "timeclock_areas" t
SET "company_id" = o."company_id"
FROM "organizations" o
WHERE t."organization_id" = o."id";

-- ── 2) 조인 테이블 생성 ─────────────────────────────────────────────────────
CREATE TABLE "organization_timeclock_areas" (
    "organization_id" TEXT NOT NULL,
    "timeclock_area_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_timeclock_areas_pkey" PRIMARY KEY ("organization_id","timeclock_area_id")
);

CREATE INDEX "organization_timeclock_areas_timeclock_area_id_idx" ON "organization_timeclock_areas"("timeclock_area_id");

-- 기존 1:N 매핑을 조인 테이블로 이관
INSERT INTO "organization_timeclock_areas" ("organization_id", "timeclock_area_id")
SELECT "organization_id", "id" FROM "timeclock_areas";

-- ── 3) company_id NOT NULL + FK + 인덱스 ────────────────────────────────────
ALTER TABLE "timeclock_areas" ALTER COLUMN "company_id" SET NOT NULL;
CREATE INDEX "timeclock_areas_company_id_is_active_idx" ON "timeclock_areas"("company_id", "is_active");
ALTER TABLE "timeclock_areas" ADD CONSTRAINT "timeclock_areas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 4) 조인 테이블 FK ───────────────────────────────────────────────────────
ALTER TABLE "organization_timeclock_areas" ADD CONSTRAINT "organization_timeclock_areas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_timeclock_areas" ADD CONSTRAINT "organization_timeclock_areas_timeclock_area_id_fkey" FOREIGN KEY ("timeclock_area_id") REFERENCES "timeclock_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5) 기존 organization_id 컬럼/FK 제거 ────────────────────────────────────
ALTER TABLE "timeclock_areas" DROP CONSTRAINT IF EXISTS "timeclock_areas_organization_id_fkey";
ALTER TABLE "timeclock_areas" DROP COLUMN "organization_id";
