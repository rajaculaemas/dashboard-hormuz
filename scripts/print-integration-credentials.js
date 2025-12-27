const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()
  try {
    const id = 'cmispaga200b8jwvpdct2a2i6'
    const integration = await prisma.integration.findUnique({ where: { id } })
    if (!integration) {
      console.error('Integration not found for id:', id)
      process.exit(1)
    }
    console.log('Integration id:', id)
    console.log('status:', integration.status)
    console.log('credentials:')
    console.log(JSON.stringify(integration.credentials, null, 2))
  } catch (e) {
    console.error('Error:', e)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
