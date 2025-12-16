import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function migrateExistingData() {
  try {
    console.log("Starting data migration...")

    // Step 1: Add missing columns to alerts table if they don't exist
    console.log("Adding missing columns to alerts table...")

    try {
      await prisma.$executeRaw`
        ALTER TABLE alerts 
        ADD COLUMN IF NOT EXISTS "externalId" TEXT,
        ADD COLUMN IF NOT EXISTS "integrationId" TEXT,
        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3)
      `
      console.log("? Added missing columns to alerts table")
    } catch (error) {
      console.log("?? Columns might already exist:", error.message)
    }

    // Step 2: Add missing columns to integrations table if they don't exist
    console.log("Adding missing columns to integrations table...")

    try {
      await prisma.$executeRaw`
        ALTER TABLE integrations 
        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3)
      `
      console.log("? Added missing columns to integrations table")
    } catch (error) {
      console.log("?? Columns might already exist:", error.message)
    }

    // Step 3: Get existing integrations
    const existingIntegrations = await prisma.integration.findMany()
    console.log("Existing integrations:", existingIntegrations.length)

    let defaultIntegration
    if (existingIntegrations.length === 0) {
      // Create default integration if none exists
      defaultIntegration = await prisma.integration.create({
        data: {
          name: "Default Integration",
          source: "stellar_cyber",
          config: {},
          status: "active",
        },
      })
      console.log("Created default integration:", defaultIntegration.id)
    } else {
      defaultIntegration = existingIntegrations[0]
      console.log("Using existing integration:", defaultIntegration.id)
    }

    // Step 4: Update alerts with missing data
    console.log("Updating alerts with missing data...")

    const updateResult = await prisma.$executeRaw`
      UPDATE alerts 
      SET 
        "externalId" = COALESCE("externalId", 'legacy-' || id),
        "integrationId" = COALESCE("integrationId", ${defaultIntegration.id}),
        "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
      WHERE "externalId" IS NULL OR "integrationId" IS NULL OR "updatedAt" IS NULL
    `

    console.log(`? Updated ${updateResult} alerts`)

    // Step 5: Update integrations with missing data
    console.log("Updating integrations with missing data...")

    const integrationUpdateResult = await prisma.$executeRaw`
      UPDATE integrations 
      SET 
        "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
      WHERE "updatedAt" IS NULL
    `

    console.log(`? Updated ${integrationUpdateResult} integrations`)

    // Step 6: Make columns NOT NULL after populating data
    console.log("Making columns NOT NULL...")

    try {
      await prisma.$executeRaw`
        ALTER TABLE alerts 
        ALTER COLUMN "externalId" SET NOT NULL,
        ALTER COLUMN "integrationId" SET NOT NULL,
        ALTER COLUMN "updatedAt" SET NOT NULL
      `
      console.log("? Made alerts columns NOT NULL")
    } catch (error) {
      console.log("?? Could not make columns NOT NULL:", error.message)
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE integrations 
        ALTER COLUMN "updatedAt" SET NOT NULL
      `
      console.log("? Made integrations columns NOT NULL")
    } catch (error) {
      console.log("?? Could not make columns NOT NULL:", error.message)
    }

    // Step 7: Add unique constraint on externalId
    try {
      await prisma.$executeRaw`
        ALTER TABLE alerts 
        ADD CONSTRAINT IF NOT EXISTS "alerts_externalId_key" UNIQUE ("externalId")
      `
      console.log("? Added unique constraint on externalId")
    } catch (error) {
      console.log("?? Unique constraint might already exist:", error.message)
    }

    // Step 8: Add foreign key constraint
    try {
      await prisma.$executeRaw`
        ALTER TABLE alerts 
        ADD CONSTRAINT IF NOT EXISTS "alerts_integrationId_fkey" 
        FOREIGN KEY ("integrationId") REFERENCES integrations(id) ON DELETE CASCADE
      `
      console.log("? Added foreign key constraint")
    } catch (error) {
      console.log("?? Foreign key constraint might already exist:", error.message)
    }

    console.log("?? Migration completed successfully!")

    // Verify the migration
    const alertCount = await prisma.alert.count()
    const integrationCount = await prisma.integration.count()
    console.log(`?? Final counts: ${alertCount} alerts, ${integrationCount} integrations`)
  } catch (error) {
    console.error("? Migration failed:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

migrateExistingData()
