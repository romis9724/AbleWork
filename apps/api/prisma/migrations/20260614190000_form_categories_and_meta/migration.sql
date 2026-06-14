-- CreateTable
CREATE TABLE "form_categories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_categories_company_id_is_active_idx" ON "form_categories"("company_id", "is_active");

-- AlterTable
ALTER TABLE "document_forms" ADD COLUMN "category_id" TEXT,
ADD COLUMN "visibility_scope" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN "retention_years" INTEGER,
ADD COLUMN "abbreviation" VARCHAR(20),
ADD COLUMN "description" TEXT;

-- AddForeignKey
ALTER TABLE "form_categories" ADD CONSTRAINT "form_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_forms" ADD CONSTRAINT "document_forms_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "form_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
