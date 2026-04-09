const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const id = process.argv[2]
  if (!id) {
    console.error('Usage: node dump-alert-metadata.js <externalId>')
    process.exit(2)
  }

  try {
    const alert = await prisma.alert.findFirst({ where: { externalId: id } })
    if (!alert) { console.log('Alert not found'); return }
    console.log(JSON.stringify(alert.metadata, null, 2))
  } catch (e) { console.error(e) } finally { await prisma.$disconnect() }
}

main()
