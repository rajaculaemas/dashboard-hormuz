const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const ticket = process.argv[2]
  if (!ticket) {
    console.error('Usage: node find-case-by-ticket.js <ticketId>')
    process.exit(2)
  }

  const ticketNum = parseInt(ticket, 10)
  if (isNaN(ticketNum)) {
    console.error('ticketId must be a number')
    process.exit(2)
  }

  try {
    const c = await prisma.case.findFirst({
      where: { ticketId: ticketNum },
      include: { relatedAlerts: { include: { alert: true } }, integration: true },
    })

    if (!c) {
      console.log('Case not found for ticketId', ticketNum)
      return
    }

    console.log('Case:', c.id)
    console.log('ticketId:', c.ticketId)
    console.log('name:', c.name)
    console.log('status:', c.status)
    console.log('integration:', c.integration ? c.integration.name : c.integrationId)
    console.log('createdAt:', c.createdAt)
    console.log('startTimestamp:', c.startTimestamp)
    console.log('endTimestamp:', c.endTimestamp)
    console.log('closedAt:', c.closedAt)
    console.log('metadata keys:', Object.keys(c.metadata || {}))
    console.log('metadata preview:', JSON.stringify(Object.fromEntries(Object.entries(c.metadata || {}).slice(0,10)), null, 2))

    const alerts = c.relatedAlerts || []
    console.log('\nRelated alerts count:', alerts.length)
    for (const ra of alerts) {
      const a = ra.alert
      console.log('---')
      console.log('alert id:', a.id)
      console.log('externalId:', a.externalId)
      console.log('title:', a.title)
      console.log('integrationId:', a.integrationId)
      console.log('timestamp:', a.timestamp)
      console.log('createdAt:', a.createdAt)
      console.log('updatedAt:', a.updatedAt)
      const md = a.metadata || {}
      console.log('metadata keys:', Object.keys(md))
      console.log('user_action_alert_to_first:', md.user_action_alert_to_first)
      console.log('user_action (exists):', Boolean(md.user_action))
      console.log('closed_time:', md.closed_time)
      console.log('alert_time:', md.alert_time)
    }
  } catch (e) {
    console.error('Error querying DB:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
