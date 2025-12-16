import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function createSampleCases() {
  try {
    console.log("Creating sample cases...")

    // First, get or create an integration
    let integration
    try {
      const integrations = (await prisma.$queryRaw`
        SELECT id FROM integrations WHERE source = 'stellar-cyber' LIMIT 1
      `) as Array<{ id: string }>

      if (integrations.length > 0) {
        integration = integrations[0]
        console.log(`Using existing integration: ${integration.id}`)
      } else {
        // Create a sample integration
        await prisma.$executeRaw`
          INSERT INTO integrations (id, name, type, source, status, method, description, credentials, config)
          VALUES (
            'sample-stellar-cyber-integration', 'Stellar Cyber', 'siem', 'stellar-cyber', 
            'connected', 'api', 'Sample Stellar Cyber Integration', 
            '{}'::jsonb, '{}'::jsonb
          )
        `
        integration = { id: "sample-stellar-cyber-integration" }
        console.log("Created sample integration")
      }
    } catch (error) {
      console.error("Error with integration:", error)
      integration = { id: "sample-stellar-cyber-integration" }
    }

    // Create sample cases
    const sampleCases = [
      {
        externalId: "case-001-sample",
        ticketId: "TICKET-1001",
        name: "Suspicious Network Activity",
        status: "New",
        severity: "High",
        assignee: "admin",
        assigneeName: "Administrator",
        description: "Multiple failed login attempts detected from external IP",
      },
      {
        externalId: "case-002-sample",
        ticketId: "TICKET-1002",
        name: "Malware Detection",
        status: "In Progress",
        severity: "Critical",
        assignee: "security-analyst",
        assigneeName: "Security Analyst",
        description: "Malware detected on endpoint workstation",
      },
      {
        externalId: "case-003-sample",
        ticketId: "TICKET-1003",
        name: "Data Exfiltration Attempt",
        status: "Resolved",
        severity: "Medium",
        assignee: "admin",
        assigneeName: "Administrator",
        description: "Unusual data transfer patterns detected",
      },
    ]

    for (const caseData of sampleCases) {
      try {
        // Check if case already exists
        const existingCases = (await prisma.$queryRaw`
          SELECT id FROM cases WHERE external_id = ${caseData.externalId}
        `) as Array<{ id: string }>

        if (existingCases.length === 0) {
          await prisma.$executeRaw`
            INSERT INTO cases (
              id, external_id, ticket_id, name, status, severity, assignee, assignee_name, 
              description, created_at, updated_at, start_timestamp, end_timestamp, 
              score, size, version, created_by, created_by_name, modified_by, modified_by_name, 
              cust_id, tenant_name, metadata, mttd, "integrationId"
            )
            VALUES (
              gen_random_uuid()::text, ${caseData.externalId}, ${caseData.ticketId}, 
              ${caseData.name}, ${caseData.status}, ${caseData.severity}, 
              ${caseData.assignee}, ${caseData.assigneeName}, ${caseData.description}, 
              NOW(), NOW(), NOW(), NOW(), 75.5, 3, 1, 
              'system', 'System', 'system', 'System', 
              'default', 'Default Tenant', '{}'::jsonb, 30, ${integration.id}
            )
          `
          console.log(`Created case: ${caseData.name}`)
        } else {
          console.log(`Case already exists: ${caseData.name}`)
        }
      } catch (error) {
        console.error(`Error creating case ${caseData.name}:`, error)
      }
    }

    console.log("Sample cases creation completed!")

    // Verify cases were created
    const totalCases = (await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM cases
    `) as Array<{ count: bigint }>

    console.log(`Total cases in database: ${totalCases[0].count}`)
  } catch (error) {
    console.error("Error creating sample cases:", error)
  } finally {
    await prisma.$disconnect()
  }
}

createSampleCases()
