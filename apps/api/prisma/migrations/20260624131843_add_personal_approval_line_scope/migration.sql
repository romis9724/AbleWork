-- AlterTable
ALTER TABLE "shared_approval_lines" ADD COLUMN     "scope" VARCHAR(20) NOT NULL DEFAULT 'COMPANY';

-- CreateIndex
CREATE INDEX "shared_approval_lines_company_id_scope_created_by_id_idx" ON "shared_approval_lines"("company_id", "scope", "created_by_id");
