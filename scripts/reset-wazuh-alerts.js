const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function resetWazuhAlerts() {
  try {
    console.log("🔄 Starting Wazuh alert reset process...\n");

    // Step 1: Find Wazuh integration
    console.log("Step 1: Finding Wazuh integration...");
    const wazuhIntegration = await prisma.integration.findFirst({
      where: {
        source: "wazuh",
      },
    });

    if (!wazuhIntegration) {
      console.error("❌ Wazuh integration not found");
      process.exit(1);
    }

    console.log(`✅ Found Wazuh integration: ${wazuhIntegration.name}\n`);

    // Step 2: Delete all Wazuh alerts
    console.log("Step 2: Deleting all Wazuh alerts from database...");
    const deleteResult = await prisma.alert.deleteMany({
      where: {
        integrationId: wazuhIntegration.id,
      },
    });

    console.log(`✅ Deleted ${deleteResult.count} Wazuh alerts\n`);

    // Step 3: Fetch fresh alerts from Wazuh
    console.log("Step 3: Fetching fresh Wazuh alerts...");
    const fetchResponse = await fetch("http://localhost:3000/api/alerts/wazuh/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integrationId: wazuhIntegration.id,
      }),
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      console.error(`❌ Failed to fetch alerts: ${fetchResponse.status}`);
      console.error("Response:", errorText);
      process.exit(1);
    }

    const fetchResult = await fetchResponse.json();
    console.log(`✅ Fetched fresh Wazuh alerts (${fetchResult.count || 0} new alerts)\n`);

    // Step 4: Verify the alerts now have "New" status
    console.log("Step 4: Verifying new alerts...");
    const newAlerts = await prisma.alert.findMany({
      where: {
        integrationId: wazuhIntegration.id,
      },
      select: {
        id: true,
        status: true,
        title: true,
        createdAt: true,
      },
      take: 5,
    });

    console.log(`✅ Sample of new alerts (first 5):`);
    newAlerts.forEach((alert, idx) => {
      console.log(`   ${idx + 1}. Status: "${alert.status}" - ${alert.title}`);
    });

    // Count total new alerts
    const totalNewAlerts = await prisma.alert.count({
      where: {
        integrationId: wazuhIntegration.id,
      },
    });

    console.log(`\n📊 Total new Wazuh alerts in database: ${totalNewAlerts}`);
    console.log("\n✅ Reset complete! All Wazuh alerts now have status: 'New'\n");
  } catch (error) {
    console.error("❌ Error during reset:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetWazuhAlerts();
