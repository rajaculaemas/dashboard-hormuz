const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main(){
  const integ = 'cmiea2mz00000jw83fvwbb49v'
  const alerts = await prisma.alert.findMany({ where: { integrationId: integ }, take: 200 })
  console.log('Found alerts:', alerts.length)
  alerts.forEach(a=>{
    console.log(JSON.stringify({ id: a.id, title: a.title, qradar: a.metadata?.qradar }, null, 2))
  })
  await prisma.$disconnect()
}

main().catch(async (e)=>{ console.error(e); try{ await prisma.$disconnect() } catch{}; process.exit(1) })
