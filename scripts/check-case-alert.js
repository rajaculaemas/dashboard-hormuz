const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const caseId = process.argv[2]
  const alertId = process.argv[3]
  if (!caseId || !alertId) {
    console.error('Usage: node check-case-alert.js <caseId> <alertId>')
    process.exit(2)
  }

  try {
    const ca = await prisma.caseAlert.findFirst({ where: { caseId, alertId } })
    if (ca) {
      console.log('Linked: true')
      console.log('caseAlertId:', ca.id)
    } else {
      console.log('Linked: false')
    }
  } catch (e) {
    console.error('Error querying DB:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
