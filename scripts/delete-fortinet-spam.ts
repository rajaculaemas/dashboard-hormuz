import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const titlesToDelete = [
  "FortiClient VPN connected",
  "Progress IPsec phase 2",
]

async function main() {
  try {
    console.log(`Looking up Wazuh integration...`)
    const wazuhIntegration = await prisma.integration.findFirst({ where: { source: "wazuh" } })
    if (!wazuhIntegration) {
      console.log("Wazuh integration not found. No deletions performed.")
      return
    }

    console.log(`Wazuh integration id: ${wazuhIntegration.id}`)

    // Count candidates
    const count = await prisma.alert.count({
      where: {
        integrationId: wazuhIntegration.id,
        title: { in: titlesToDelete },
      },
    })

    console.log(`Found ${count} alerts matching the spam titles for Wazuh integration.`)
    if (count === 0) {
      console.log('Nothing to delete.')
      return
    }

    const deleted = await prisma.alert.deleteMany({
      where: {
        integrationId: wazuhIntegration.id,
        title: { in: titlesToDelete },
      },
    })

    console.log(`Deleted ${deleted.count} alerts.`)
  } catch (err) {
    console.error('Error while deleting spam alerts:', err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
