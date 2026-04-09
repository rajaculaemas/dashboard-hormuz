#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCurrentAlerts() {
  const integrationId = 'cml94x5730000jwpagj71h5w3';

  console.log('📊 Checking current alerts in PostgreSQL database...\n');

  // Count by integration
  const alertsByIntegration = await prisma.alert.count({
    where: { integrationId }
  });

  console.log(`Integration ID: ${integrationId}`);
  console.log(`Total alerts from this integration: ${alertsByIntegration}`);

  // Count by status
  const byStatus = await prisma.alert.groupBy({
    by: ['status'],
    where: { integrationId },
    _count: { id: true }
  });

  console.log('\nAlerts by status:');
  byStatus.forEach(s => {
    console.log(`  - ${s.status}: ${s._count.id}`);
  });

  // Count by severity
  const bySeverity = await prisma.alert.groupBy({
    by: ['severity'],
    where: { integrationId },
    _count: { id: true }
  });

  console.log('\nAlerts by severity:');
  bySeverity.forEach(s => {
    console.log(`  - ${s.severity}: ${s._count.id}`);
  });

  // Show sample alerts
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

  console.log('\nSample alerts:');
  samples.forEach(a => {
    console.log(`  - ID: ${a.externalId}`);
    console.log(`    Title: ${a.title.substring(0, 50)}`);
    console.log(`    Status: ${a.status}, Severity: ${a.severity}`);
  });

  // Also check all integrations
  console.log('\n=== ALL INTEGRATIONS ===');
  const allIntegrations = await prisma.integration.findMany({
    select: { id: true, name: true, source: true }
  });
  
  for (const integ of allIntegrations) {
    const count = await prisma.alert.count({ where: { integrationId: integ.id } });
    console.log(`${integ.name} (${integ.source}): ${count} alerts`);
  }
}

checkCurrentAlerts()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
