-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "assigneeId" TEXT;

-- CreateTable
CREATE TABLE "wazuh_cases" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL,
    "assigneeId" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "alert_count" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdById" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "wazuh_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wazuh_case_alerts" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wazuh_case_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wazuh_case_alerts_case_id_alert_id_key" ON "wazuh_case_alerts"("case_id", "alert_id");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wazuh_cases" ADD CONSTRAINT "wazuh_cases_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wazuh_case_alerts" ADD CONSTRAINT "wazuh_case_alerts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "wazuh_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wazuh_case_alerts" ADD CONSTRAINT "wazuh_case_alerts_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
