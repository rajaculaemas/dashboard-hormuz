const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const alert = await prisma.alert.findFirst({
    where: { integration: { source: 'qradar' } },
    include: { integration: true },
  })

  if (!alert) {
    console.log('No QRadar alert found')
  } else {
    console.log(JSON.stringify({ id: alert.id, title: alert.title, metadata: alert.metadata }, null, 2))
  }

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Error:', e)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})
