-- AddColumn domain to qradar_offenses
ALTER TABLE "qradar_offenses" ADD COLUMN "domain" TEXT;

-- AddColumn domain to qradar_events  
ALTER TABLE "qradar_events" ADD COLUMN "domain" TEXT;
