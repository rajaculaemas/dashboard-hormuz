#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function showSampleAlert() {
  const integrationId = 'cml94x5730000jwpagj71h5w3';

  const alert = await prisma.alert.findFirst({
    where: { integrationId },
    select: {
      id: true,
      externalId: true,
      title: true,
      description: true,
      status: true,
      severity: true,
      timestamp: true,
      integrationId: true,
      metadata: true
    }
  });

  if (!alert) {
    console.log('No alert found');
    process.exit(1);
  }

  console.log('=== SAMPLE COPILOT ALERT ===\n');
  console.log(JSON.stringify(alert, null, 2));
}

showSampleAlert()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
