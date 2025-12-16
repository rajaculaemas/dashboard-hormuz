import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function inspectDatabase() {
  try {
    console.log("?? Inspecting database structure...")

    // Check alerts table structure
    console.log("\n?? ALERTS TABLE STRUCTURE:")
    const alertsColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'alerts' 
      ORDER BY ordinal_position
    `
    console.table(alertsColumns)

    // Check integrations table structure
    console.log("\n?? INTEGRATIONS TABLE STRUCTURE:")
    const integrationsColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'integrations' 
      ORDER BY ordinal_position
    `
    console.table(integrationsColumns)

    // Check sample data
    console.log("\n?? SAMPLE ALERTS DATA:")
    const sampleAlerts = await prisma.$queryRaw`
      SELECT * FROM alerts LIMIT 3
    `
    console.table(sampleAlerts)

    console.log("\n?? SAMPLE INTEGRATIONS DATA:")
    const sampleIntegrations = await prisma.$queryRaw`
      SELECT * FROM integrations LIMIT 3
    `
    console.table(sampleIntegrations)

    // Check all tables
    console.log("\n?? ALL TABLES:")
    const allTables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    console.table(allTables)
  } catch (error) {
    console.error("? Inspection failed:", error)
  } finally {
    await prisma.$disconnect()
  }
}

inspectDatabase()
