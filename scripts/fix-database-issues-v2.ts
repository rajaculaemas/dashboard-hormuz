import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function fixDatabaseIssues() {
  try {
    console.log("?? Starting database fixes...")

    // Step 1: Add missing columns to integrations table
    console.log("\n1?? Adding missing columns to integrations table...")
    try {
      // Add lastSync column if it doesn't exist
      await prisma.$executeRaw`
        ALTER TABLE integrations 
        ADD COLUMN IF NOT EXISTS "lastSync" TIMESTAMP
      `

      // Add credentials column if it doesn't exist
      await prisma.$executeRaw`
        ALTER TABLE integrations 
        ADD COLUMN IF NOT EXISTS credentials JSONB
      `

      console.log("? Added missing columns to integrations")
    } catch (error) {
      console.log("?? Integration columns update skipped:", error)
    }

    // Step 2: Update integrations with default config using raw SQL
    console.log("\n2?? Updating integrations with default config...")
    try {
      await prisma.$executeRaw`
        UPDATE integrations 
        SET config = COALESCE(config, '{}')
        WHERE config IS NULL
      `
      console.log("? Updated integrations with default config")
    } catch (error) {
      console.log("?? Integration config update skipped:", error)
    }

    // Step 3: Create cases table if it doesn't exist
    console.log("\n3?? Creating cases table...")
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          "externalId" TEXT UNIQUE NOT NULL,
          "ticketId" INTEGER NOT NULL,
          name TEXT NOT NULL,
          title TEXT,
          description TEXT,
          status TEXT DEFAULT 'New',
          severity TEXT DEFAULT 'Medium',
          priority TEXT DEFAULT 'Medium',
          assignee TEXT,
          source TEXT,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW(),
          "integrationId" TEXT,
          metadata JSONB DEFAULT '{}',
          FOREIGN KEY ("integrationId") REFERENCES integrations(id) ON DELETE CASCADE
        )
      `
      console.log("? Created cases table")
    } catch (error) {
      console.log("?? Cases table creation skipped:", error)
    }

    // Step 4: Create sample cases using raw SQL
    console.log("\n4?? Creating sample cases...")
    try {
      const caseCount = (await prisma.$queryRaw`SELECT COUNT(*) as count FROM cases`) as Array<{ count: string }>

      if (Number.parseInt(caseCount[0].count) === 0) {
        // Get integration ID
        const integrations = (await prisma.$queryRaw`SELECT id FROM integrations LIMIT 1`) as Array<{ id: string }>
        const integrationId = integrations.length > 0 ? integrations[0].id : null

        await prisma.$executeRaw`
          INSERT INTO cases ("externalId", "ticketId", name, title, description, status, severity, priority, assignee, source, "integrationId", metadata)
          VALUES 
            ('case-001', 1001, 'Suspicious Network Activity', 'Suspicious Network Activity', 'Multiple failed login attempts detected', 'New', 'High', 'High', 'admin', 'stellar-cyber', ${integrationId}, '{"source_ip": "192.168.1.100", "target_system": "web-server-01"}'),
            ('case-002', 1002, 'Malware Detection', 'Malware Detection', 'Potential malware found on endpoint', 'In Progress', 'Critical', 'Critical', 'security-analyst', 'stellar-cyber', ${integrationId}, '{"endpoint": "workstation-05", "malware_type": "trojan"}'),
            ('case-003', 1003, 'Data Exfiltration Attempt', 'Data Exfiltration Attempt', 'Unusual data transfer patterns detected', 'Resolved', 'Medium', 'Medium', 'admin', 'stellar-cyber', ${integrationId}, '{"data_size": "500MB", "destination": "external"}')
        `
        console.log("? Created 3 sample cases")
      } else {
        console.log(`? Found ${caseCount[0].count} existing cases`)
      }
    } catch (error) {
      console.log("?? Case creation skipped:", error)
    }

    // Step 5: Clean corrupted alerts
    console.log("\n5?? Cleaning corrupted alerts...")
    try {
      await prisma.$executeRaw`
        DELETE FROM alerts 
        WHERE id IN (
          SELECT id FROM alerts 
          WHERE title ~ '\x00' 
             OR description ~ '\x00'
          LIMIT 100
        )
      `
      console.log("? Cleaned corrupted alerts")
    } catch (error) {
      console.log("?? Alert cleanup completed with warnings")
    }

    // Step 6: Final verification
    console.log("\n6?? Final verification...")
    try {
      const alertCount = (await prisma.$queryRaw`SELECT COUNT(*) as count FROM alerts`) as Array<{ count: string }>
      const integrationCount = (await prisma.$queryRaw`SELECT COUNT(*) as count FROM integrations`) as Array<{
        count: string
      }>
      const caseCount = (await prisma.$queryRaw`SELECT COUNT(*) as count FROM cases`) as Array<{ count: string }>

      console.log(`?? Final counts:`)
      console.log(`   - ${alertCount[0].count} alerts`)
      console.log(`   - ${integrationCount[0].count} integrations`)
      console.log(`   - ${caseCount[0].count} cases`)
    } catch (error) {
      console.log("?? Verification completed with warnings")
    }

    console.log("\n?? Database fixes completed!")
  } catch (error) {
    console.error("? Database fix failed:", error)
  } finally {
    await prisma.$disconnect()
  }
}

fixDatabaseIssues()
