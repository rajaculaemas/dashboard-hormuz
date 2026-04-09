#!/usr/bin/env node

/**
 * Direct sync trigger using lib functions (no HTTP)
 */

const { getSocfortressAlerts } = require('./lib/api/socfortress.ts');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncAlertsDirectly() {
  const integrationId = 'cml94x5730000jwpagj71h5w3';

  console.log('🚀 Starting direct SOCFortress sync...\n');

  try {
    // Get alerts from MySQL
    console.log('📥 Fetching alerts from MySQL Copilot...');
    const result = await getSocfortressAlerts(integrationId, { limit: 500 });

    console.log(`✅ Fetched ${result.count} alerts from MySQL\n`);

    // Upsert to PostgreSQL
    console.log('💾 Upserting to PostgreSQL...');
    let syncedCount = 0;
    let errorCount = 0;

    for (const alert of result.alerts) {
      try {
        await prisma.alert.upsert({
          where: { externalId: alert.externalId },
          update: {
            title: alert.title,
            description: alert.description || '',
            severity: alert.severity,
            status: alert.status,
            timestamp: alert.timestamp,
            metadata: alert.metadata || {},
          },
          create: {
            externalId: alert.externalId,
            title: alert.title,
            description: alert.description || '',
            severity: alert.severity,
            status: alert.status,
            timestamp: alert.timestamp,
            integrationId,
            metadata: alert.metadata || {},
          },
        });
        syncedCount++;
      } catch (err) {
        console.error(`❌ Error syncing alert ${alert.externalId}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\n✅ Sync complete:`);
    console.log(`   - Synced: ${syncedCount}`);
    console.log(`   - Errors: ${errorCount}`);

    // Update lastSync
    await prisma.integration.update({
      where: { id: integrationId },
      data: { lastSync: new Date() }
    });

    // Check results
    console.log('\n📊 Checking alerts in PostgreSQL...');
    const count = await prisma.alert.count({ where: { integrationId } });
    console.log(`Total alerts in PostgreSQL: ${count}`);

    const samples = await prisma.alert.findMany({
      where: { integrationId },
      select: {
        externalId: true,
        title: true,
        status: true,
        severity: true,
        timestamp: true
      },
      orderBy: { timestamp: 'desc' },
      take: 5
    });

    console.log('\nSample alerts:');
    samples.forEach(a => {
      console.log(`  - ID: ${a.externalId}`);
      console.log(`    Title: ${a.title.substring(0, 50)}...`);
      console.log(`    Status: ${a.status}, Severity: ${a.severity}`);
      console.log(`    Timestamp: ${a.timestamp.toISOString()}`);
    });

  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncAlertsDirectly();
