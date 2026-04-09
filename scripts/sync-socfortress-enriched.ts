import { PrismaClient } from "@prisma/client";
import { getSocfortressAlerts } from "@/lib/api/socfortress";

const prisma = new PrismaClient();

async function sync() {
  console.log("🔄 Starting SOCFortress alert sync with enriched data...\n");
  
  const integration = await prisma.integration.findFirst({
    where: { source: { in: ["socfortress", "copilot"] } },
  });

  if (!integration) {
    console.log("❌ No SOCFortress integration found");
    await prisma.$disconnect();
    return;
  }

  console.log(`✅ Found integration: ${integration.name}`);
  
  try {
    const { alerts } = await getSocfortressAlerts(integration.id, { limit: 20 });
    console.log(`\n📥 Fetched ${alerts.length} alerts from SOCFortress`);
    
    if (alerts.length > 0) {
      const sample = alerts[0];
      console.log("\n📋 Sample Alert Structure:");
      console.log("- ID:", sample.externalId);
      console.log("- Title:", sample.title.substring(0, 50) + "...");
      console.log("- incident_event present:", !!sample.metadata.incident_event);
      if (sample.metadata.incident_event?.source_data) {
        const dataKeys = Object.keys(sample.metadata.incident_event.source_data);
        console.log(`- source_data fields (${dataKeys.length} total):`);
        console.log("  Sample:", dataKeys.slice(0, 5).join(", "));
      }
    }
    
    let updated = 0;
    let created = 0;
    
    for (const alert of alerts) {
      const existing = await prisma.alert.findUnique({
        where: { externalId: alert.externalId },
      });

      if (existing) {
        await prisma.alert.update({
          where: { externalId: alert.externalId },
          data: {
            title: alert.title,
            description: alert.description,
            status: alert.status,
            severity: alert.severity,
            timestamp: alert.timestamp,
            metadata: alert.metadata,
            updatedAt: new Date(),
          },
        });
        updated++;
      } else {
        await prisma.alert.create({
          data: {
            externalId: alert.externalId,
            title: alert.title,
            description: alert.description,
            status: alert.status,
            severity: alert.severity,
            timestamp: alert.timestamp,
            integrationId: integration.id,
            metadata: alert.metadata,
          },
        });
        created++;
      }
    }

    console.log(`\n✅ Sync complete:`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Created: ${created}`);
    
  } catch (error) {
    console.error("❌ Sync error:", error);
  }

  await prisma.$disconnect();
}

sync();
