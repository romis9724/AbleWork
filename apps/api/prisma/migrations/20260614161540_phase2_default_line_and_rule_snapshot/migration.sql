-- AlterTable
ALTER TABLE "document_forms" ADD COLUMN     "default_line_id" TEXT;

-- AlterTable
ALTER TABLE "requests" ADD COLUMN     "rule_id" TEXT;

-- AddForeignKey
ALTER TABLE "document_forms" ADD CONSTRAINT "document_forms_default_line_id_fkey" FOREIGN KEY ("default_line_id") REFERENCES "shared_approval_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requests" ADD CONSTRAINT "requests_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "approval_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
