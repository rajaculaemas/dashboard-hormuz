const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const ids = ['cmiiqwrj50001jw296fz6avtx','cmiiqwrju0003jw29wraqdo5s']

async function main(){
  for(const id of ids){
    const c = await prisma.case.findUnique({ where: { id }, include: { integration: true } })
    console.log('CASE:', id)
    if(!c){ console.log('  Not found') ; continue }
    console.log(JSON.stringify({ id: c.id, name: c.name, ticketId: c.ticketId, metadata: c.metadata }, null, 2))
  }
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error(e); try{ await prisma.$disconnect() } catch{}; process.exit(1) })
