-- AlterTable
ALTER TABLE "error_analysis_logs" ADD COLUMN     "resolution_status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolved_by_id" TEXT;

-- CreateIndex
CREATE INDEX "error_analysis_logs_company_id_resolution_status_idx" ON "error_analysis_logs"("company_id", "resolution_status");

-- AddForeignKey
ALTER TABLE "error_analysis_logs" ADD CONSTRAINT "error_analysis_logs_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
