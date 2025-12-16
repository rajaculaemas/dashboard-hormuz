import prisma from "@/lib/prisma"

async function main() {
  try {
    // Get all WazuhCases
    const wazuhCases = await prisma.wazuhCase.findMany({
      take: 5,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    console.log("=== WazuhCases in database ===")
    if (wazuhCases.length > 0) {
      console.log(`Found ${wazuhCases.length} WazuhCases:`)
      wazuhCases.forEach((wc) => {
        console.log(`- ID: ${wc.id}`)
        console.log(`  Title: ${wc.title}`)
        console.log(`  Status: ${wc.status}`)
        console.log(`  Severity: ${wc.severity}`)
        console.log(`  Assignee: ${wc.assignee?.name || "Unassigned"}`)
        console.log(`  Created: ${wc.createdAt}`)
        console.log("")
      })
    } else {
      console.log("No WazuhCases found in database")
    }

    // Try to fetch a specific case if provided
    if (process.argv[2]) {
      const caseId = process.argv[2]
      console.log(`\n=== Trying to fetch WazuhCase: ${caseId} ===`)
      const specificCase = await prisma.wazuhCase.findUnique({
        where: { id: caseId },
      })
      if (specificCase) {
        console.log("Found!")
        console.log(JSON.stringify(specificCase, null, 2))
      } else {
        console.log("Not found in WazuhCase table")

        // Check if it exists in Case table
        const caseRecord = await prisma.case.findUnique({
          where: { id: caseId },
        })
        if (caseRecord) {
          console.log("But found in Case table:", caseRecord.name)
        }
      }
    }
  } catch (error) {
    console.error("Error:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
