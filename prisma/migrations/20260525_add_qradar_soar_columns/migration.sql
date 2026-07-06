-- Add dedicated SOAR columns on integrations for QRadar->SOAR mapping
ALTER TABLE "integrations"
  ADD COLUMN "soar_host" TEXT,
  ADD COLUMN "soar_org_id" TEXT,
  ADD COLUMN "soar_key_id" TEXT,
  ADD COLUMN "soar_key_secret" TEXT;
