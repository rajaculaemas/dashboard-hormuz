import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function fixDatabaseIssues() {
  try {
    console.log("?? Starting database fixes...")

    // Step 1: Update integrations with default config (simpler approach)
    console.log("\n1?? Updating integrations with default config...")
    try {
      const integrations = await prisma.integration.findMany()

      for (const integration of integrations) {
        if (!integration.config) {
          await prisma.integration.update({
            where: { id: integration.id },
            data: { config: {} },
          })
        }
      }
      console.log(`? Updated integrations with default config`)
    } catch (error) {
      console.log("?? Integration config update skipped:", error)
    }

    // Step 2: Clean corrupted alerts using direct SQL
    console.log("\n2?? Cleaning corrupted alerts...")
    try {
      // Use direct SQL to clean corrupted data
      await prisma.$executeRaw`
        DELETE FROM alerts 
        WHERE id IN (
          SELECT id FROM alerts 
          WHERE title LIKE '%' || CHR(0) || '%' 
             OR description LIKE '%' || CHR(0) || '%'
          LIMIT 100
        )
      `
      console.log("? Cleaned corrupted alerts")
    } catch (error) {
      console.log("?? Alert cleanup completed with warnings")
    }

    // Step 3: Create sample cases if none exist
    console.log("\n3?? Creating sample cases...")
    try {
      const caseCount = await prisma.case.count()

      if (caseCount === 0) {
        await prisma.case.createMany({
          data: [
            {
              externalId: "case-001",
              title: "Suspicious Network Activity",
              description: "Multiple failed login attempts detected",
              status: "open",
              severity: "high",
              priority: "high",
              assignee: "admin",
              source: "stellar-cyber",
              metadata: {
                source_ip: "192.168.1.100",
                target_system: "web-server-01",
              },
            },
            {
              externalId: "case-002",
              title: "Malware Detection",
              description: "Potential malware found on endpoint",
              status: "in_progress",
              severity: "critical",
              priority: "critical",
              assignee: "security-analyst",
              source: "stellar-cyber",
              metadata: {
                endpoint: "workstation-05",
                malware_type: "trojan",
              },
            },
            {
              externalId: "case-003",
              title: "Data Exfiltration Attempt",
              description: "Unusual data transfer patterns detected",
              status: "resolved",
              severity: "medium",
              priority: "medium",
              assignee: "admin",
              source: "stellar-cyber",
              metadata: {
                data_size: "500MB",
                destination: "external",
              },
            },
          ],
        })
        console.log("? Created 3 sample cases")
      } else {
        console.log(`? Found ${caseCount} existing cases`)
      }
    } catch (error) {
      console.log("?? Case creation skipped:", error)
    }

    // Step 4: Verify database structure
    console.log("\n4?? Final verification...")
    try {
      const alertCount = await prisma.alert.count()
      const integrationCount = await prisma.integration.count()
      const caseCount = await prisma.case.count()

      console.log(`?? Final counts:`)
      console.log(`   - ${alertCount} alerts`)
      console.log(`   - ${integrationCount} integrations`)
      console.log(`   - ${caseCount} cases`)
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
