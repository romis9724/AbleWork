-- CreateTable
CREATE TABLE "organization_doc_managers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_doc_managers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_doc_managers_employee_id_idx" ON "organization_doc_managers"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_doc_managers_organization_id_employee_id_key" ON "organization_doc_managers"("organization_id", "employee_id");

-- AddForeignKey
ALTER TABLE "organization_doc_managers" ADD CONSTRAINT "organization_doc_managers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_doc_managers" ADD CONSTRAINT "organization_doc_managers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 기존 단일 doc_manager_id를 다중 담당자 조인으로 이관(대표=sort_order 0)
INSERT INTO "organization_doc_managers" ("id", "organization_id", "employee_id", "sort_order", "created_at")
SELECT gen_random_uuid(), "id", "doc_manager_id", 0, CURRENT_TIMESTAMP
FROM "organizations"
WHERE "doc_manager_id" IS NOT NULL;
