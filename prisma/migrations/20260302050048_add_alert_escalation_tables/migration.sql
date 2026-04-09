-- CreateTable
CREATE TABLE "alert_escalations" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "escalationLevel" INTEGER NOT NULL DEFAULT 1,
    "escalated_by_user_id" TEXT NOT NULL,
    "escalated_to_user_id" TEXT NOT NULL,
    "l1_analysis" TEXT,
    "l2_analysis" TEXT,
    "l3_analysis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "telegram_message_id" TEXT,
    "telegram_chat_id" TEXT,
    "escalated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replied_at" TIMESTAMP(3),
    "timeout_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_escalation_responses" (
    "id" TEXT NOT NULL,
    "escalation_id" TEXT NOT NULL,
    "responder_id" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "escalated_to_id" TEXT,
    "telegram_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_escalation_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_escalation_audits" (
    "id" TEXT NOT NULL,
    "escalation_id" TEXT,
    "alert_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_escalation_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_escalations_alert_id_idx" ON "alert_escalations"("alert_id");

-- CreateIndex
CREATE INDEX "alert_escalations_escalated_to_user_id_idx" ON "alert_escalations"("escalated_to_user_id");

-- CreateIndex
CREATE INDEX "alert_escalations_status_idx" ON "alert_escalations"("status");

-- CreateIndex
CREATE INDEX "alert_escalations_timeout_at_idx" ON "alert_escalations"("timeout_at");

-- CreateIndex
CREATE INDEX "alert_escalation_responses_escalation_id_idx" ON "alert_escalation_responses"("escalation_id");

-- CreateIndex
CREATE INDEX "alert_escalation_responses_responder_id_idx" ON "alert_escalation_responses"("responder_id");

-- CreateIndex
CREATE INDEX "alert_escalation_audits_alert_id_idx" ON "alert_escalation_audits"("alert_id");

-- CreateIndex
CREATE INDEX "alert_escalation_audits_escalation_id_idx" ON "alert_escalation_audits"("escalation_id");

-- AddForeignKey
ALTER TABLE "alert_escalations" ADD CONSTRAINT "alert_escalations_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_escalations" ADD CONSTRAINT "alert_escalations_escalated_by_user_id_fkey" FOREIGN KEY ("escalated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_escalations" ADD CONSTRAINT "alert_escalations_escalated_to_user_id_fkey" FOREIGN KEY ("escalated_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_escalation_responses" ADD CONSTRAINT "alert_escalation_responses_escalation_id_fkey" FOREIGN KEY ("escalation_id") REFERENCES "alert_escalations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_escalation_responses" ADD CONSTRAINT "alert_escalation_responses_responder_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
