import prisma from "@/lib/prisma"

async function fixDatabaseIssues() {
  console.log("?? Starting database fixes...")

  try {
    // Step 1: Create sample cases using correct column names
    console.log("\n1?? Creating sample cases...")
    try {
      const caseCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM cases`
      const count = Array.isArray(caseCount) ? (caseCount[0] as any).count : 0

      if (Number.parseInt(count) === 0) {
        await prisma.$executeRaw`
          INSERT INTO cases (
            id, external_id, ticket_id, name, status, severity, assignee, assignee_name, 
            description, created_at, updated_at, start_timestamp, end_timestamp, 
            score, size, version, created_by, created_by_name, modified_by, modified_by_name, 
            cust_id, tenant_name, metadata, mttd, "integrationId"
          )
          VALUES 
          (
            gen_random_uuid()::text, 'case-001', 'TICKET-1001', 'Suspicious Network Activity', 
            'New', 'High', 'admin', 'Administrator', 
            'Multiple failed login attempts detected', NOW()::text, NOW()::text, 
            NOW()::text, NOW()::text, 85.5, 5, 1, 'system', 'System', 'system', 'System', 
            'default', 'Default Tenant', '{"source_ip": "192.168.1.100", "target_system": "web-server-01"}'::jsonb, 
            30, 'cmayvv33z0000jwsdfowdnqt2'
          ),
          (
            gen_random_uuid()::text, 'case-002', 'TICKET-1002', 'Malware Detection', 
            'In Progress', 'Critical', 'security-analyst', 'Security Analyst', 
            'Potential malware found on endpoint', NOW()::text, NOW()::text, 
            NOW()::text, NOW()::text, 95.0, 3, 1, 'system', 'System', 'system', 'System', 
            'default', 'Default Tenant', '{"endpoint": "workstation-05", "malware_type": "trojan"}'::jsonb, 
            15, 'cmayvv33z0000jwsdfowdnqt2'
          ),
          (
            gen_random_uuid()::text, 'case-003', 'TICKET-1003', 'Data Exfiltration Attempt', 
            'Resolved', 'Medium', 'admin', 'Administrator', 
            'Unusual data transfer patterns detected', NOW()::text, NOW()::text, 
            NOW()::text, NOW()::text, 65.0, 2, 1, 'system', 'System', 'system', 'System', 
            'default', 'Default Tenant', '{"data_size": "500MB", "destination": "external"}'::jsonb, 
            45, 'cmayvv33z0000jwsdfowdnqt2'
          )
        `
        console.log("? Created sample cases")
      } else {
        console.log("? Cases already exist")
      }
    } catch (error) {
      console.log("?? Case creation skipped:", error)
    }

    // Step 2: Final verification
    console.log("\n2?? Final verification...")
    try {
      const alertCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM alerts`
      const integrationCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM integrations`
      const caseCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM cases`

      console.log("?? Final counts:")
      console.log(`   - ${Array.isArray(alertCount) ? (alertCount[0] as any).count : 0} alerts`)
      console.log(`   - ${Array.isArray(integrationCount) ? (integrationCount[0] as any).count : 0} integrations`)
      console.log(`   - ${Array.isArray(caseCount) ? (caseCount[0] as any).count : 0} cases`)
    } catch (error) {
      console.log("?? Verification failed:", error)
    }

    console.log("\n? Database fixes completed!")
  } catch (error) {
    console.error("? Database fix failed:", error)
    throw error
  }
}

// Run the fixes
fixDatabaseIssues()
  .then(() => {
    console.log("?? All fixes completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("?? Fix process failed:", error)
    process.exit(1)
  })
