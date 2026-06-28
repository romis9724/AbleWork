-- 출퇴근 기록에 직무(position) 연결 추가
-- 무일정 출근 시 직원이 선택한 직무를 기록한다. NULL 허용(기존 기록·직무 미선택 호환).

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN "position_id" TEXT;

-- CreateIndex
CREATE INDEX "attendances_position_id_idx" ON "attendances"("position_id");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
