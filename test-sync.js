#!/usr/bin/env node

/**
 * Test script to trigger SOCFortress alert sync
 * Fetches all SOCFortress integrations and triggers sync
 */

const fs = require('fs');
const path = require('path');

// Read .env to get DATABASE_URL
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const dbUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);

if (!dbUrlMatch) {
  console.error('❌ Could not find DATABASE_URL in .env');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findSocfortressIntegrations() {
  console.log('🔍 Looking for SOCFortress integrations...');
  
  const integrations = await prisma.integration.findMany({
    where: {
      source: {
        in: ['socfortress', 'copilot']
      }
    }
  });

  console.log(`Found ${integrations.length} SOCFortress integration(s):`);
  integrations.forEach(int => {
    console.log(`  - ID: ${int.id}, Name: ${int.name}, Source: ${int.source}`);
  });

  return integrations;
}

async function triggerSync(integrationId) {
  console.log(`\n📤 Triggering sync for integration ${integrationId}...`);
  
  try {
    const response = await fetch('http://localhost:3000/api/alerts/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        integrationId: integrationId
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Sync failed with status ${response.status}`);
      console.error('Response:', text);
      return null;
    }

    const data = await response.json();
    console.log('✅ Sync response:');
    console.log(`   - Synced: ${data.synced}`);
    console.log(`   - Errors: ${data.errors}`);
    console.log(`   - Total: ${data.total}`);
    
    return data;
  } catch (error) {
    console.error('❌ Sync request failed:', error.message);
    return null;
  }
}

async function checkAlerts(integrationId) {
  console.log(`\n📊 Checking alerts for integration ${integrationId}...`);
  
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        integrationId: integrationId
      },
      select: {
        id: true,
        externalId: true,
        title: true,
        status: true,
        severity: true,
        timestamp: true
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 5
    });

    if (alerts.length === 0) {
      console.log('   No alerts found');
      return;
    }

    console.log(`✅ Found ${alerts.length} alerts:`);
    alerts.forEach(alert => {
      console.log(`   - ID: ${alert.externalId}`);
      console.log(`     Title: ${alert.title.substring(0, 60)}...`);
      console.log(`     Status: ${alert.status}, Severity: ${alert.severity}`);
      console.log(`     Timestamp: ${alert.timestamp.toISOString()}`);
    });

    // Get total count
    const totalCount = await prisma.alert.count({
      where: { integrationId }
    });
    console.log(`\n📈 Total alerts for this integration: ${totalCount}`);
  } catch (error) {
    console.error('❌ Failed to check alerts:', error.message);
  }
}

async function main() {
  console.log('🚀 SOCFortress Sync Test Script');
  console.log('================================\n');

  try {
    // Find integrations
    const integrations = await findSocfortressIntegrations();

    if (integrations.length === 0) {
      console.log('❌ No SOCFortress integrations found');
      process.exit(1);
    }

    // Trigger sync for each integration
    for (const integration of integrations) {
      const syncResult = await triggerSync(integration.id);
      if (syncResult) {
        // Wait a bit for DB to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check alerts
        await checkAlerts(integration.id);
      }
    }

    console.log('\n✅ Test complete!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
