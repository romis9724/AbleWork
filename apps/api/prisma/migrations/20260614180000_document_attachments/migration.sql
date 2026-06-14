-- CreateTable
CREATE TABLE "document_attachments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(150) NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_attachments_storage_key_key" ON "document_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "document_attachments_document_id_idx" ON "document_attachments"("document_id");

-- AddForeignKey
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
