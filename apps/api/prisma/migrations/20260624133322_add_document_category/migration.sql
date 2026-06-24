-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "category_id" TEXT;

-- CreateTable
CREATE TABLE "document_categories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "abbreviation" VARCHAR(20) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_categories_company_id_is_active_idx" ON "document_categories"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_company_id_name_key" ON "document_categories"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_company_id_abbreviation_key" ON "document_categories"("company_id", "abbreviation");

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
