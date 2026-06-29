-- CreateTable
CREATE TABLE "body_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "body_templates_company_id_is_active_idx" ON "body_templates"("company_id", "is_active");

-- AddForeignKey
ALTER TABLE "body_templates" ADD CONSTRAINT "body_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
