import prisma from "@/lib/prisma"

async function resetWazuhAlerts() {
  try {
    console.log("🔄 Starting Wazuh alerts reset...")

    // Find Wazuh integration
    const wazuhIntegration = await prisma.integration.findFirst({
      where: {
        source: "wazuh",
      },
    })

    if (!wazuhIntegration) {
      console.log("❌ Wazuh integration not found")
      return
    }

    console.log(`✅ Found Wazuh integration: ${wazuhIntegration.name} (ID: ${wazuhIntegration.id})`)

    // Find all Wazuh alerts
    const wazuhAlerts = await prisma.alert.findMany({
      where: {
        integrationId: wazuhIntegration.id,
      },
    })

    console.log(`📊 Found ${wazuhAlerts.length} Wazuh alerts in database`)

    if (wazuhAlerts.length === 0) {
      console.log("✨ No alerts to delete")
      return
    }

    // Delete associated case alerts first (to respect foreign key constraints)
    const alertIds = wazuhAlerts.map((a) => a.id)
    const deletedCaseAlerts = await prisma.caseAlert.deleteMany({
      where: {
        alertId: {
          in: alertIds,
        },
      },
    })

    console.log(`🗑️  Deleted ${deletedCaseAlerts.count} case-alert associations`)

    // Delete the alerts
    const deletedAlerts = await prisma.alert.deleteMany({
      where: {
        integrationId: wazuhIntegration.id,
      },
    })

    console.log(`🗑️  Deleted ${deletedAlerts.count} Wazuh alerts from database`)

    // Now fetch fresh alerts from Wazuh
    console.log("🔄 Fetching fresh Wazuh alerts...")

    const response = await fetch(`http://localhost:3000/api/alerts/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integrationId: wazuhIntegration.id,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to sync alerts: ${response.statusText}`)
    }

    const syncResult = await response.json()
    console.log(`✅ Sync result:`, syncResult)

    // Verify new alerts have 'New' status
    const newAlerts = await prisma.alert.findMany({
      where: {
        integrationId: wazuhIntegration.id,
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
      take: 5,
    })

    console.log(`\n📋 Sample of new Wazuh alerts:`)
    newAlerts.forEach((alert) => {
      console.log(`  - ${alert.title} (Status: ${alert.status})`)
    })

    const totalNewAlerts = await prisma.alert.count({
      where: {
        integrationId: wazuhIntegration.id,
      },
    })

    console.log(`\n✨ Total new Wazuh alerts: ${totalNewAlerts}`)
    console.log("✅ Wazuh alerts reset completed successfully!")
  } catch (error) {
    console.error("❌ Error resetting Wazuh alerts:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

resetWazuhAlerts()
