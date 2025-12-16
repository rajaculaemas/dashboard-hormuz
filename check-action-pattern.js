const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        integration: {
          name: { contains: "Stellar", mode: "insensitive" }
        }
      },
      orderBy: { timestamp: "desc" },  // Get newest first
      take: 15
    });

    console.log("Checking first user action pattern:\n");

    alerts.forEach((alert, idx) => {
      const md = alert.metadata || {};
      const firstTs = md.user_action_first_timestamp;
      const lastAction = md.user_action_last_action;
      const historyCount = md.user_action_history_count;
      const mttdMs = md.user_action_alert_to_first;
      
      if (!firstTs || !historyCount) {
        return;
      }
      
      console.log(`${idx + 1}. ${alert.id.substring(0, 12)} | MTTD: ${mttdMs ? Math.round(mttdMs / 60000) + ' min' : 'N/A'}`);
      console.log(`   First action: ${firstTs}`);
      console.log(`   Last action: ${lastAction}`);
      console.log(`   Action count: ${historyCount}`);
      console.log();
    });

  } finally {
    await prisma.$disconnect();
  }
})();
