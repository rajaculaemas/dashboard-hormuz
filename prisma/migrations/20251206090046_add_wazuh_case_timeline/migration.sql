-- CreateTable
CREATE TABLE "wazuh_case_timeline" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "changed_by_user_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wazuh_case_timeline_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "wazuh_case_timeline" ADD CONSTRAINT "wazuh_case_timeline_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wazuh_case_timeline" ADD CONSTRAINT "wazuh_case_timeline_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "wazuh_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
