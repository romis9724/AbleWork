-- CreateTable
CREATE TABLE "messenger_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "external_user_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messenger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messenger_accounts_company_id_idx" ON "messenger_accounts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "messenger_accounts_platform_external_user_id_key" ON "messenger_accounts"("platform", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "messenger_accounts_company_id_employee_id_platform_key" ON "messenger_accounts"("company_id", "employee_id", "platform");

-- AddForeignKey
ALTER TABLE "messenger_accounts" ADD CONSTRAINT "messenger_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messenger_accounts" ADD CONSTRAINT "messenger_accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
