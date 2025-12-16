#!/usr/bin/env node

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
    console.log("Alert ID:", alert.id.substring(0, 20) + "...");
    console.log("Alert title:", alert.title);
    console.log("\nMetadata structure:");
    console.log("  Keys:", Object.keys(md || {}).sort());
    console.log("  Has user_action:", !!md?.user_action);

    if (md?.user_action) {
      console.log("  User action keys:", Object.keys(md.user_action).sort());
      console.log("  History length:", md.user_action.history?.length || 0);
      if (md.user_action.history?.length > 0) {
        console.log("  First action:", md.user_action.history[0].action);
      }
    }

    console.log("\nTimestamp fields:");
    console.log("  alert.timestamp:", alert.timestamp);
    console.log("  metadata.timestamp:", md?.timestamp);
    console.log("  metadata.alert_time:", md?.alert_time);
  } finally {
    await prisma.$disconnect();
  }
})();
