-- AlterTable
ALTER TABLE "wazuh_cases" ADD COLUMN "case_number" TEXT;

-- Update existing rows with case numbers using CTE
WITH numbered_cases AS (
  SELECT id, LPAD((ROW_NUMBER() OVER (ORDER BY "created_at"))::text, 4, '0') as new_number
  FROM "wazuh_cases"
  WHERE "case_number" IS NULL
)
UPDATE "wazuh_cases" 
SET "case_number" = numbered_cases.new_number
FROM numbered_cases
WHERE "wazuh_cases".id = numbered_cases.id;

-- Make case_number NOT NULL
ALTER TABLE "wazuh_cases" ALTER COLUMN "case_number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "wazuh_cases_case_number_key" ON "wazuh_cases"("case_number");
