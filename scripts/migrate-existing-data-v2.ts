import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function migrateExistingData() {
  try {
    console.log("?? Starting comprehensive data migration...")

    // Step 1: Check current table structure
    console.log("\n1?? Checking current alerts table structure...")
    const alertsColumns = (await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'alerts'
    `) as Array<{ column_name: string }>

    const existingAlertColumns = alertsColumns.map((col) => col.column_name)
    console.log("Existing alert columns:", existingAlertColumns)

    // Step 2: Add missing columns to alerts table
    console.log("\n2?? Adding missing columns to alerts table...")

    // Add externalId if not exists
    if (!existingAlertColumns.includes("externalId")) {
      await prisma.$executeRaw`ALTER TABLE alerts ADD COLUMN "externalId" TEXT`
      console.log("? Added externalId column")
    }

    // Add integrationId if not exists
    if (!existingAlertColumns.includes("integrationId")) {
      await prisma.$executeRaw`ALTER TABLE alerts ADD COLUMN "integrationId" TEXT`
      console.log("? Added integrationId column")
    }

    // Add createdAt if not exists
    if (!existingAlertColumns.includes("createdAt")) {
      await prisma.$executeRaw`ALTER TABLE alerts ADD COLUMN "createdAt" TIMESTAMP(3) DEFAULT NOW()`
      console.log("? Added createdAt column")
    }

    // Add updatedAt if not exists
    if (!existingAlertColumns.includes("updatedAt")) {
      await prisma.$executeRaw`ALTER TABLE alerts ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT NOW()`
      console.log("? Added updatedAt column")
    }

    // Step 3: Check integrations table structure
    console.log("\n3?? Checking integrations table structure...")
    const integrationsColumns = (await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'integrations'
    `) as Array<{ column_name: string }>

    const existingIntegrationColumns = integrationsColumns.map((col) => col.column_name)
    console.log("Existing integration columns:", existingIntegrationColumns)

    // Add missing columns to integrations
    if (!existingIntegrationColumns.includes("createdAt")) {
      await prisma.$executeRaw`ALTER TABLE integrations ADD COLUMN "createdAt" TIMESTAMP(3) DEFAULT NOW()`
      console.log("? Added createdAt to integrations")
    }

    if (!existingIntegrationColumns.includes("updatedAt")) {
      await prisma.$executeRaw`ALTER TABLE integrations ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT NOW()`
      console.log("? Added updatedAt to integrations")
    }

    // Step 4: Get existing integrations
    const existingIntegrations = (await prisma.$queryRaw`SELECT * FROM integrations LIMIT 1`) as Array<any>
    console.log("\n4?? Found integrations:", existingIntegrations.length)

    let defaultIntegrationId
    if (existingIntegrations.length > 0) {
      defaultIntegrationId = existingIntegrations[0].id
      console.log("Using existing integration:", defaultIntegrationId)
    } else {
      // Create default integration
      const result = await prisma.$executeRaw`
        INSERT INTO integrations (id, name, source, status, config, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'Default Integration', 'stellar_cyber', 'active', '{}', NOW(), NOW())
        RETURNING id
      `
      console.log("Created default integration")

      const newIntegrations = (await prisma.$queryRaw`SELECT id FROM integrations LIMIT 1`) as Array<{ id: string }>
      defaultIntegrationId = newIntegrations[0].id
    }

    // Step 5: Update alerts with missing data
    console.log("\n5?? Updating alerts with missing data...")

    // Update externalId for records that don't have it
    await prisma.$executeRaw`
      UPDATE alerts 
      SET "externalId" = 'legacy-' || id
      WHERE "externalId" IS NULL OR "externalId" = ''
    `

    // Update integrationId for records that don't have it
    await prisma.$executeRaw`
      UPDATE alerts 
      SET "integrationId" = ${defaultIntegrationId}
      WHERE "integrationId" IS NULL OR "integrationId" = ''
    `

    // Update timestamps if they're null
    await prisma.$executeRaw`
      UPDATE alerts 
      SET 
        "createdAt" = COALESCE("createdAt", NOW()),
        "updatedAt" = COALESCE("updatedAt", NOW())
      WHERE "createdAt" IS NULL OR "updatedAt" IS NULL
    `

    console.log("? Updated alerts with missing data")

    // Step 6: Update integrations timestamps
    await prisma.$executeRaw`
      UPDATE integrations 
      SET 
        "createdAt" = COALESCE("createdAt", NOW()),
        "updatedAt" = COALESCE("updatedAt", NOW())
      WHERE "createdAt" IS NULL OR "updatedAt" IS NULL
    `

    console.log("? Updated integrations with missing data")

    // Step 7: Create cases table if it doesn't exist
    console.log("\n6?? Creating cases table...")

    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "externalId" TEXT UNIQUE NOT NULL,
          "ticketId" INTEGER NOT NULL,
          name TEXT NOT NULL,
          status TEXT DEFAULT 'New',
          severity TEXT DEFAULT 'Medium',
          assignee TEXT,
          "assigneeName" TEXT,
          description TEXT,
          "createdAt" TIMESTAMP(3) DEFAULT NOW(),
          "updatedAt" TIMESTAMP(3) DEFAULT NOW(),
          "acknowledgedAt" TIMESTAMP(3),
          "closedAt" TIMESTAMP(3),
          "startTimestamp" TIMESTAMP(3),
          "endTimestamp" TIMESTAMP(3),
          score DOUBLE PRECISION,
          size INTEGER,
          tags TEXT[] DEFAULT '{}',
          version INTEGER,
          "createdBy" TEXT,
          "createdByName" TEXT,
          "modifiedBy" TEXT,
          "modifiedByName" TEXT,
          "custId" TEXT,
          "tenantName" TEXT,
          mttd INTEGER,
          metadata JSONB,
          "integrationId" TEXT NOT NULL,
          FOREIGN KEY ("integrationId") REFERENCES integrations(id) ON DELETE CASCADE
        )
      `
      console.log("? Created cases table")
    } catch (error) {
      console.log("?? Cases table might already exist")
    }

    // Step 8: Create junction tables
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS case_alerts (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "caseId" TEXT NOT NULL,
          "alertId" TEXT NOT NULL,
          FOREIGN KEY ("caseId") REFERENCES cases(id) ON DELETE CASCADE,
          FOREIGN KEY ("alertId") REFERENCES alerts(id) ON DELETE CASCADE,
          UNIQUE("caseId", "alertId")
        )
      `
      console.log("? Created case_alerts table")
    } catch (error) {
      console.log("?? case_alerts table might already exist")
    }

    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS case_comments (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "caseId" TEXT NOT NULL,
          content TEXT NOT NULL,
          author TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) DEFAULT NOW(),
          FOREIGN KEY ("caseId") REFERENCES cases(id) ON DELETE CASCADE
        )
      `
      console.log("? Created case_comments table")
    } catch (error) {
      console.log("?? case_comments table might already exist")
    }

    console.log("\n?? Migration completed successfully!")

    // Verify the migration
    const alertCount = (await prisma.$queryRaw`SELECT COUNT(*) as count FROM alerts`) as Array<{ count: string }>
    const integrationCount = (await prisma.$queryRaw`SELECT COUNT(*) as count FROM integrations`) as Array<{
      count: string
    }>

    console.log(`?? Final counts: ${alertCount[0].count} alerts, ${integrationCount[0].count} integrations`)
  } catch (error) {
    console.error("? Migration failed:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

migrateExistingData()
