-- AlterTable
ALTER TABLE "approval_steps" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "doc_manager_id" TEXT;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_doc_manager_id_fkey" FOREIGN KEY ("doc_manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
