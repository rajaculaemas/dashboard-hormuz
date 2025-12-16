import { prisma } from './lib/prisma'

async function checkIntegrations() {
  const integrations = await prisma.integration.findMany({
    select: {
      id: true,
      name: true,
      source: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  console.log('Integrations:')
  integrations.forEach((i) => {
    console.log(`- ${i.name} (${i.source}): ${i.status}`)
  })

  const alerts = await prisma.alert.findMany({
    select: {
      integrationId: true,
    },
    distinct: ['integrationId'],
  })

  console.log('\nAlerts by integration:')
  const alertsByIntegration: Record<string, number> = {}
  for (const alert of alerts) {
    if (alert.integrationId) {
      alertsByIntegration[alert.integrationId] = (alertsByIntegration[alert.integrationId] || 0) + 1
    }
  }

  const allAlerts = await prisma.alert.findMany({
    select: {
      integrationId: true,
    },
  })

  console.log(`\nTotal alerts: ${allAlerts.length}`)
  console.log('Alerts by integration:')
  for (const [integrationId, count] of Object.entries(alertsByIntegration)) {
    const integration = integrations.find((i) => i.id === integrationId)
    console.log(`  ${integration?.name || integrationId}: ${count}`)
  }

  process.exit(0)
}

checkIntegrations().catch(console.error)
