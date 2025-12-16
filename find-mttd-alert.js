const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    // Check all alerts for any with user_action fields
    console.log("Checking Stellar alerts for user_action fields...\n");
    const allAlerts = await prisma.alert.findMany({
      where: {
        integration: { name: { contains: "Stellar", mode: "insensitive" } }
      },
      take: 50
    });
    
    let foundMttd = false;
    for (const a of allAlerts) {
      const md = a.metadata || {};
      if (md.user_action_alert_to_first !== null && md.user_action_alert_to_first !== undefined) {
        console.log(`Found: ${a.id.substring(0, 15)} - Title: ${a.title}`);
        console.log(`  user_action_alert_to_first: ${md.user_action_alert_to_first}`);
        console.log(`  Calculated MTTD: ${Math.round(md.user_action_alert_to_first / 60000)} minutes`);
        foundMttd = true;
        break;
      }
    }
    
    if (!foundMttd) {
      console.log("No alerts with user_action_alert_to_first found in first 50 Stellar alerts");
      console.log("\nChecking metadata structure of first alert:");
      if (allAlerts.length > 0) {
        const md = allAlerts[0].metadata || {};
        const keys = Object.keys(md).filter(k => k.includes('user_action'));
        console.log(`  User action related keys: ${keys.length > 0 ? keys.join(', ') : 'NONE'}`);
      }
    }

  } finally {
    await prisma.$disconnect();
  }
})();
