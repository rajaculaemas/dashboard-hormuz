const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    // Get all Stellar Cyber alerts with user_action data
    const alerts = await prisma.alert.findMany({
      where: {
        integration: {
          name: { contains: "Stellar", mode: "insensitive" }
        }
      },
      include: { integration: true },
      take: 100
    });

    if (!alerts.length) {
      console.log("No Stellar alerts found");
      process.exit(0);
    }

    console.log(`Total Stellar alerts: ${alerts.length}`);
    
    // Count which ones have user_action data
    let with_mttd = 0;
    let without_mttd = 0;

    alerts.forEach((alert) => {
      const md = alert.metadata || {};
      const hasMttd = md.user_action_alert_to_first !== null && md.user_action_alert_to_first !== undefined;
      
      if (hasMttd) {
        with_mttd++;
        console.log(`✓ ${alert.id.substring(0, 15)}: MTTD = ${Math.round(md.user_action_alert_to_first / 60000)} min`);
      } else {
        without_mttd++;
      }
    });

    console.log(`\nSummary:`);
    console.log(`  Alerts with MTTD data: ${with_mttd}`);
    console.log(`  Alerts without MTTD data: ${without_mttd}`);
    console.log(`  Percentage with MTTD: ${Math.round(with_mttd / alerts.length * 100)}%`);

  } finally {
    await prisma.$disconnect();
  }
})();
