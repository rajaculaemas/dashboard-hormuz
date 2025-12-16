const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main(){
  const o = await prisma.qRadarOffense.findUnique({ where: { externalId: 0 } })
  console.log('Found offense with externalId 0?', !!o)
  if (o) {
    await prisma.qRadarOffense.delete({ where: { externalId: 0 } })
    console.log('Deleted offense with externalId 0')
  }
  await prisma.$disconnect()
}

main().catch(async (e)=>{ console.error(e); try{ await prisma.$disconnect() } catch{}; process.exit(1) })
