import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  try {
    console.log("Checking database connection...")
    await prisma.$connect()
    console.log("Database connected successfully.")

    console.log("Creating tables if they do not exist...")

    // Create integrations table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "integrations" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'disconnected',
        "method" TEXT NOT NULL,
        "description" TEXT,
        "icon" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "last_sync_at" TIMESTAMP WITH TIME ZONE,
        "credentials" JSONB NOT NULL
      )
    `

    // Create alerts table
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "alerts" (
        "id" TEXT PRIMARY KEY,
        "external_id" TEXT,
        "index" TEXT,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "severity" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL,
        "score" INTEGER,
        "metadata" JSONB,
        "integration_id" TEXT NOT NULL,
        FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE
      )
    `

    // Create indexes
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_alerts_integration_id" ON "alerts"("integration_id")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_alerts_external_id" ON "alerts"("external_id")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_alerts_timestamp" ON "alerts"("timestamp")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_alerts_severity" ON "alerts"("severity")`
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "idx_alerts_status" ON "alerts"("status")`

    console.log("Database initialization completed successfully.")
  } catch (error) {
    console.error("Error initializing database:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
