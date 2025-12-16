import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function inspectDatabaseStructure() {
  try {
    console.log("?? Inspecting database structure...")

    // Check integrations table structure
    console.log("\n?? Integrations table structure:")
    const integrationColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'integrations'
      ORDER BY ordinal_position
    `
    console.table(integrationColumns)

    // Check alerts table structure
    console.log("\n?? Alerts table structure:")
    const alertColumns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'alerts'
      ORDER BY ordinal_position
    `
    console.table(alertColumns)

    // Check if cases table exists
    console.log("\n?? Cases table structure:")
    try {
      const caseColumns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'cases'
        ORDER BY ordinal_position
      `
      console.table(caseColumns)
    } catch (error) {
      console.log("? Cases table does not exist")
    }

    // Check all tables in database
    console.log("\n?? All tables in database:")
    const allTables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `
    console.table(allTables)

    console.log("\n? Database inspection completed!")
  } catch (error) {
    console.error("? Database inspection failed:", error)
  } finally {
    await prisma.$disconnect()
  }
}

inspectDatabaseStructure()
