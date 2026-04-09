const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const c = await p.case.findFirst({ where: { ticketId: 10674 } })
  console.log('acknowledgedAt:', c?.acknowledgedAt)
  console.log('modifiedAt:', c?.modifiedAt)
  console.log('mttrMinutes:', c?.mttrMinutes)
  console.log('metadata.latest_alert_time:', c?.metadata?.latest_alert_time)
  console.log('metadata.closed:', c?.metadata?.closed)
  console.log('metadata.closed (iso):', c?.metadata?.closed ? new Date(typeof c.metadata.closed === 'number' ? (c.metadata.closed>1000000000000?c.metadata.closed:c.metadata.closed*1000) : c.metadata.closed).toISOString() : null)
  await p.$disconnect()
}

main().catch(e=>{console.error(e);p.$disconnect()})
