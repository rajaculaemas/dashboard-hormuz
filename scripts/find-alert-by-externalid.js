const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const id = process.argv[2]
  if (!id) {
    console.error('Usage: node find-alert-by-externalid.js <externalId>')
    process.exit(2)
  }

  try {
    const alert = await prisma.alert.findFirst({
      where: {
        OR: [
          { externalId: id },
          { id: id }
        ],
      },
    })

    if (!alert) {
      console.log('Alert not found')
      return
    }

    console.log('Found alert:')
    console.log('id:', alert.id)
    console.log('externalId:', alert.externalId)
    console.log('title:', alert.title)
    console.log('integrationId:', alert.integrationId)
    console.log('status:', alert.status)
    console.log('timestamp:', alert.timestamp)
    console.log('createdAt:', alert.createdAt || alert.created_at)
    console.log('updatedAt:', alert.updatedAt || alert.updated_at)
    console.log('metadata keys:', Object.keys(alert.metadata || {}))
    console.log('\nmetadata (truncated):')
    const md = alert.metadata || {}
    // print possible MTTD-related fields
    console.log('user_action:', Boolean(md.user_action))
    console.log('user_action_alert_to_first:', md.user_action_alert_to_first)
    console.log('closed_time:', md.closed_time)
    console.log('alert_time:', md.alert_time)
    console.log('raw metadata preview:', JSON.stringify(Object.fromEntries(Object.entries(md).slice(0,10)), null, 2))
  } catch (e) {
    console.error('Error querying DB:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
