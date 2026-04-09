#!/usr/bin/env node

const mysql = require('mysql2/promise');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncSocfortressAlerts() {
  const integrationId = 'cml94x5730000jwpagj71h5w3';

  console.log('🚀 SOCFortress Direct Alert Sync');
  console.log('==================================\n');

  try {
    // Step 1: Get integration from PostgreSQL
    console.log('📋 Getting integration details...');
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId }
    });

    if (!integration) {
      console.error('❌ Integration not found');
      process.exit(1);
    }

    console.log(`✅ Found integration: ${integration.name}\n`);

    // Step 2: Parse credentials
    console.log('🔐 Parsing credentials...');
    let credentials = {};
    if (Array.isArray(integration.credentials)) {
      integration.credentials.forEach(cred => {
        credentials[cred.key] = cred.value;
      });
    } else {
      credentials = integration.credentials || {};
    }

    const host = credentials.host || '100.100.12.41';
    const port = parseInt(credentials.port || 3306);
    const user = credentials.user || 'copilot';
    const password = credentials.password || 'POUTHBLJvhvcasgFDS98';
    const database = credentials.database || 'copilot';

    console.log(`✅ Credentials: ${user}@${host}:${port}/${database}\n`);

    // Step 3: Connect to MySQL
    console.log('🔗 Connecting to MySQL Copilot...');
    const conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      connectionTimeout: 10000
    });
    console.log('✅ Connected!\n');

    // Step 4: Fetch alerts from MySQL
    console.log('📥 Fetching alerts from MySQL (limit: 500)...');
    const query = `
      SELECT a.*
      FROM incident_management_alert a
      ORDER BY a.alert_creation_time DESC
      LIMIT 500
    `;

    const [rows] = await conn.execute(query);
    console.log(`✅ Fetched ${rows.length} alerts\n`);

    await conn.end();

    // Step 5: Transform alerts
    console.log('🔄 Transforming alerts...');
    const mapStatusFromMySQL = (status) => {
      // All alerts map to "New" for visibility in dashboard
      return "New";
    };

    const transformed = rows.map(alert => ({
      externalId: String(alert.id),
      title: alert.alert_name,
      description: alert.alert_description || '',
      status: mapStatusFromMySQL(alert.status),
      severity: alert.severity || 'Medium',
      timestamp: new Date(alert.alert_creation_time),
      integrationId,
      metadata: {
        socfortress: {
          id: alert.id,
          customer_code: alert.customer_code,
          source: alert.source,
          assigned_to: alert.assigned_to,
          time_closed: alert.time_closed,
        },
      },
    }));

    console.log(`✅ Transformed ${transformed.length} alerts\n`);

    // Step 6: Upsert to PostgreSQL
    console.log('💾 Upserting to PostgreSQL...');
    let syncedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < transformed.length; i++) {
      const alert = transformed[i];
      try {
        await prisma.alert.upsert({
          where: { externalId: alert.externalId },
          update: {
            title: alert.title,
            description: alert.description,
            severity: alert.severity,
            status: alert.status,
            timestamp: alert.timestamp,
            metadata: alert.metadata,
          },
          create: alert,
        });
        syncedCount++;
        if ((i + 1) % 100 === 0) {
          console.log(`  ... progress: ${i + 1}/${transformed.length}`);
        }
      } catch (err) {
        console.error(`  ❌ Error upserting alert ${alert.externalId}: ${err.message}`);
        errorCount++;
      }
    }

    console.log(`✅ Completed upsert: ${syncedCount} synced, ${errorCount} errors\n`);

    // Step 7: Update lastSync
    console.log('⏱️ Updating lastSync timestamp...');
    await prisma.integration.update({
      where: { id: integrationId },
      data: { lastSync: new Date() }
    });
    console.log('✅ Updated\n');

    // Step 8: Show results
    console.log('📊 Results:');
    const totalCount = await prisma.alert.count({ where: { integrationId } });
    console.log(`  - Total alerts in PostgreSQL: ${totalCount}`);

    const byStatus = await prisma.alert.groupBy({
      by: ['status'],
      where: { integrationId },
      _count: { id: true }
    });
    console.log('  - By status:');
    byStatus.forEach(s => {
      console.log(`    • ${s.status}: ${s._count.id}`);
    });

    const bySeverity = await prisma.alert.groupBy({
      by: ['severity'],
      where: { integrationId },
      _count: { id: true }
    });
    console.log('  - By severity:');
    bySeverity.forEach(s => {
      console.log(`    • ${s.severity}: ${s._count.id}`);
    });

    // Show samples
    console.log('\n📝 Sample alerts:');
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
      take: 3
    });

    samples.forEach((a, idx) => {
      console.log(`\n  ${idx + 1}. ID: ${a.externalId}`);
      console.log(`     Title: ${a.title.substring(0, 60)}...`);
      console.log(`     Status: ${a.status} | Severity: ${a.severity}`);
      console.log(`     Time: ${a.timestamp.toISOString()}`);
    });

    console.log('\n✅ SYNC COMPLETE!');

  } catch (error) {
    console.error('❌ SYNC FAILED:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncSocfortressAlerts();
