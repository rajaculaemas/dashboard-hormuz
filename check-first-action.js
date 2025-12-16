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
      take: 15
    });

    console.log("Checking if first user action is always 'Event assignee changed':\n");

    let assignee_first = 0;
    let other_first = 0;

    alerts.forEach((alert, idx) => {
      const md = alert.metadata || {};
      const firstTs = md.user_action_first_timestamp;
      const lastAction = md.user_action_last_action;
      const historyCount = md.user_action_history_count;
      
      console.log(`${idx + 1}. Alert: ${alert.id.substring(0, 12)}`);
      console.log(`   Status: ${alert.status}`);
      console.log(`   First action time: ${firstTs}`);
      console.log(`   History count: ${historyCount}`);
      console.log(`   Last action: ${lastAction}`);
      
      // Note: Kita tidak bisa liat detail first action karena data sudah di-flatten
      // Tapi kita bisa cek dari last action
      if (lastAction && lastAction.includes("assignee")) {
        console.log(`   → Last action is ASSIGNEE related`);
      } else if (lastAction) {
        console.log(`   → Last action is: ${lastAction.split(' ').slice(0, 3).join(' ')}...`);
      }
      
      console.log();
    });

  } finally {
    await prisma.$disconnect();
  }
})();
