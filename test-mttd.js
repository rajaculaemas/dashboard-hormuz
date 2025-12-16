const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    // Get first few Stellar Cyber alerts
    const alerts = await prisma.alert.findMany({
      where: {
        integration: {
          name: { contains: "Stellar", mode: "insensitive" }
        }
      },
      include: { integration: true },
      take: 5
    });

    if (!alerts.length) {
      console.log("No Stellar alerts found");
      process.exit(0);
    }

    console.log("Testing MTTD calculation for Stellar Cyber alerts:\n");

    alerts.forEach((alert, idx) => {
      const metadata = alert.metadata || {};
      const mttdMs = metadata.user_action_alert_to_first;
      
      console.log(`Alert ${idx + 1}:`);
      console.log(`  ID: ${alert.id.substring(0, 20)}...`);
      console.log(`  Title: ${alert.title}`);
      console.log(`  Status: ${alert.status}`);
      console.log(`  Severity: ${alert.severity}`);
      
      if (mttdMs !== null && mttdMs !== undefined && typeof mttdMs === "number") {
        const mttdMinutes = Math.round(mttdMs / (60 * 1000));
        
        // Get severity for threshold
        const severity = alert.metadata.severity || "low";
        const thresholds = {
          "critical": 15,
          "high": 30,
          "medium": 60,
          "low": 120
        };
        const threshold = thresholds[severity.toLowerCase()] || 120;
        const pass = mttdMinutes <= threshold;
        
        console.log(`  MTTD: ${mttdMinutes} minutes`);
        console.log(`  Severity: ${severity}`);
        console.log(`  Threshold: ${threshold} minutes`);
        console.log(`  Status: ${pass ? '✓ PASS' : '✗ FAIL'}`);
      } else {
        console.log(`  MTTD: NOT AVAILABLE`);
        console.log(`  Reason: user_action_alert_to_first = ${mttdMs}`);
      }
      console.log();
    });

  } finally {
    await prisma.$disconnect();
  }
})();
