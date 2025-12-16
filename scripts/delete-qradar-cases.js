const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    const integrations = await prisma.integration.findMany({ where: { source: 'qradar' } })
    if (integrations.length === 0) {
      console.log('No QRadar integrations found')
      return
    }

    const integrationIds = integrations.map((i) => i.id)
    console.log('QRadar integration IDs:', integrationIds)

    // Find cases that belong to those integrations
    const cases = await prisma.case.findMany({ where: { integrationId: { in: integrationIds } } })
    console.log(`Found ${cases.length} Case rows for QRadar integrations`)
    if (cases.length === 0) return

    // Print sample for review
    cases.slice(0, 10).forEach((c) => {
      console.log('  ', c.id, '-', c.name, '-', c.externalId)
    })

    // Delete them
    const res = await prisma.case.deleteMany({ where: { integrationId: { in: integrationIds } } })
    console.log('Deleted cases count:', res.count)
  } catch (err) {
    console.error('Error deleting QRadar cases:', err)
  } finally {
    await prisma.$disconnect()
  }
}

const confirm = process.argv[2]
if (confirm !== 'yes') {
  console.log('This will delete all Case rows belonging to QRadar integrations.')
  console.log('To proceed run:')
  console.log('  node scripts/delete-qradar-cases.js yes')
  process.exit(0)
}

main().catch(console.error)
