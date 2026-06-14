-- AlterTable
ALTER TABLE "shared_approval_lines" ADD COLUMN "created_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "shared_approval_lines" ADD CONSTRAINT "shared_approval_lines_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
