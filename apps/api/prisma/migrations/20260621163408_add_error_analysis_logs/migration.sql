-- CreateTable
CREATE TABLE "error_analysis_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "message" TEXT NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "user_id" TEXT,
    "detail" JSONB,
    "stack" TEXT,
    "ai_analysis" TEXT,
    "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notified_email" BOOLEAN NOT NULL DEFAULT false,
    "notified_discord" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_analysis_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_analysis_logs_company_id_created_at_idx" ON "error_analysis_logs"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "error_analysis_logs_company_id_status_idx" ON "error_analysis_logs"("company_id", "status");

-- AddForeignKey
ALTER TABLE "error_analysis_logs" ADD CONSTRAINT "error_analysis_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
