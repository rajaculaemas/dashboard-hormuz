-- Add unique constraint on escalation_response to prevent duplicate messages per escalation
-- This ensures L1's reply to Alert A won't be confused with L1's reply to Alert B

ALTER TABLE "alert_escalation_responses" ADD CONSTRAINT "alert_escalation_responses_escalation_id_telegram_message_id_key" UNIQUE ("escalation_id", "telegram_message_id");

-- Add index for faster message lookup queries
CREATE INDEX "alert_escalation_responses_telegram_message_id_idx" ON "alert_escalation_responses"("telegram_message_id");
