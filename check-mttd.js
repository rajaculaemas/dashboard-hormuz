const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    const alert = await prisma.alert.findFirst({
      where: {
        integration: {
          name: {
            contains: "Stellar",
            mode: "insensitive",
          },
        },
      },
      include: {
        integration: true,
      },
    });

    if (!alert) {
      console.log("No Stellar alerts found");
      process.exit(0);
    }

    const md = alert.metadata;
    console.log("MTTD-related values:");
    console.log("  user_action_alert_to_first:", md?.user_action_alert_to_first, "ms");
    console.log("  user_action_alert_to_last:", md?.user_action_alert_to_last, "ms");
    console.log("  user_action_first_timestamp:", md?.user_action_first_timestamp);
    console.log("  user_action_last_timestamp:", md?.user_action_last_timestamp);
    console.log("  user_action_last_action:", md?.user_action_last_action);
    console.log("  user_action_last_user:", md?.user_action_last_user);
    console.log("  user_action_history_count:", md?.user_action_history_count);
    
    if (md?.user_action_alert_to_first) {
      const mttdMinutes = Math.round(md.user_action_alert_to_first / (60 * 1000));
      console.log("\nCalculated MTTD:", mttdMinutes, "minutes");
    }
  } finally {
    await prisma.$disconnect();
  }
})();
