-- CreateTable
CREATE TABLE "alert_timeline" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT,
    "changed_by_user_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_timeline_alert_id_idx" ON "alert_timeline"("alert_id");

-- AddForeignKey
ALTER TABLE "alert_timeline" ADD CONSTRAINT "alert_timeline_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_timeline" ADD CONSTRAINT "alert_timeline_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
