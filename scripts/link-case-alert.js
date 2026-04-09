const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const caseId = process.argv[2]
  const alertId = process.argv[3]
  const apply = process.argv.includes('--apply')

  if (!caseId || !alertId) {
    console.error('Usage: node link-case-alert.js <caseId> <alertId> [--apply]')
    process.exit(2)
  }

  try {
    const existing = await prisma.caseAlert.findFirst({ where: { caseId, alertId } })
    if (existing) {
      console.log('Already linked. caseAlertId:', existing.id)
      return
    }

    console.log('Will create link between case and alert:')
    console.log(' caseId:', caseId)
    console.log(' alertId:', alertId)

    if (!apply) {
      console.log('\nDry-run mode. Rerun with --apply to perform the write.')
      return
    }

    const created = await prisma.caseAlert.create({ data: { caseId, alertId } })
    console.log('Created case_alerts row id:', created.id)
  } catch (e) {
    console.error('Error:', e)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
