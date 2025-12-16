#!/usr/bin/env node

/**
 * Stellar Cyber Alert Manual Sync Script
 * 
 * Syncs alerts dari Stellar Cyber ke database.
 * Bisa dijalankan manual tanpa melalui UI.
 * 
 * Usage:
 *   node scripts/sync-stellar-cyber-alerts-api.js [--days 16] [--integration ID] [--dry-run]
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.API_AUTH_TOKEN || ''; // Set if needed

async function callApi(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const init = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  };

  console.log(`📤 ${options.method || 'GET'} ${endpoint}`);
  
  try {
    const response = await fetch(url, init);
    
    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ API Call Failed:`, error.message);
    throw error;
  }
}

async function syncStellarCyberAlerts(options = {}) {
  const { integrationId, daysBack = 16, dryRun = false } = options;

  console.log('\n🚀 Starting Stellar Cyber Alert Sync');
  console.log('📋 Options:', { integrationId, daysBack, dryRun });
  console.log(`📍 API: ${API_BASE_URL}`);

  try {
    // Get Stellar Cyber integration
    console.log('\n🔍 Finding Stellar Cyber integration...');
    let integration;
    
    if (integrationId) {
      integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      });
      if (!integration || integration.source !== 'stellar-cyber') {
        console.error(`❌ Integration ${integrationId} not found or is not Stellar Cyber`);
        process.exit(1);
      }
    } else {
      integration = await prisma.integration.findFirst({
        where: {
          source: 'stellar-cyber',
          status: 'connected',
        },
      });
    }

    if (!integration) {
      console.error('❌ No Stellar Cyber integration found');
      process.exit(1);
    }

    console.log(`✓ Found: ${integration.name} (${integration.id})`);

    // Trigger sync via API
    console.log(`\n📥 Triggering sync for ${daysBack} days...`);
    
    try {
      const syncResult = await callApi('/api/alerts/sync', {
        method: 'POST',
        body: {
          integrationId: integration.id,
          daysBack,
          forceSync: true,
        },
      });

      console.log('✓ Sync triggered');
      if (syncResult.message) console.log(`  ${syncResult.message}`);
      if (syncResult.synced !== undefined) {
        console.log(`  Synced: ${syncResult.synced}`);
      }
    } catch (error) {
      // Fallback: sync might not return data immediately
      console.warn('⚠️ Sync endpoint response issue, continuing with verification...');
    }

    // Wait a moment for sync to process
    console.log('\n⏳ Waiting for sync to complete...');
    await new Promise((r) => setTimeout(r, 2000));

    // Verify in database
    console.log('\n🔍 Verifying sync results...');
    
    const totalAlerts = await prisma.alert.count({
      where: { integrationId: integration.id },
    });

    const closedAlerts = await prisma.alert.count({
      where: {
        integrationId: integration.id,
        status: 'Closed',
      },
    });

    // Count alerts with user_action
    const allAlerts = await prisma.alert.findMany({
      where: { integrationId: integration.id },
      select: { metadata: true },
    });

    const alertsWithUserAction = allAlerts.filter((a) => {
      const meta = a.metadata;
      return meta && typeof meta === 'object' && 'user_action' in meta;
    }).length;

    console.log('\n📈 Database Statistics:');
    console.log(`  Total Stellar Cyber Alerts: ${totalAlerts}`);
    console.log(`  Closed Alerts: ${closedAlerts}`);
    console.log(`  Alerts with user_action: ${alertsWithUserAction}`);

    // Sample recent alerts
    const recentAlerts = await prisma.alert.findMany({
      where: { integrationId: integration.id },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    console.log('\n📅 Recent Alerts Sample:');
    recentAlerts.forEach((alert, idx) => {
      const date = new Date(alert.timestamp).toLocaleDateString('en-CA');
      const meta = alert.metadata;
      const hasUserAction = meta && typeof meta === 'object' && 'user_action' in meta ? '✓' : '✗';
      const title = alert.title.substring(0, 45).padEnd(45);
      console.log(
        `  ${idx + 1}. [${date}] ${title} | ${alert.status.padEnd(8)} | UA: ${hasUserAction}`,
      );
    });

    // Distribution by date
    console.log('\n📊 Alerts by Date:');
    const alertsByDate = {};
    allAlerts.forEach((a) => {
      const date = new Date(a.metadata?.timestamp || a.metadata?.alert_time || new Date())
        .toLocaleDateString('en-CA');
      alertsByDate[date] = (alertsByDate[date] || 0) + 1;
    });

    Object.entries(alertsByDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 10)
      .forEach(([date, count]) => {
        console.log(`  ${date}: ${count} alerts`);
      });

    console.log('\n✅ Sync verification complete!');
    
    if (alertsWithUserAction < closedAlerts * 0.5) {
      console.log('\n⚠️  Note: Only ~' + Math.round((alertsWithUserAction / closedAlerts) * 100) + '% of closed alerts have user_action');
      console.log('   This is expected if alerts were just synced.');
      console.log('   MTTD will be calculated using fallback methods (closed_time, updatedAt).');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { daysBack: 16 };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (arg === '--days' && args[i + 1]) {
      options.daysBack = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--integration' && args[i + 1]) {
      options.integrationId = args[i + 1];
      i++;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Stellar Cyber Alert Manual Sync                          ║
╚════════════════════════════════════════════════════════════╝

Syncs Stellar Cyber alerts from the past N days to database.

USAGE:
  node scripts/sync-stellar-cyber-alerts-api.js [options]

OPTIONS:
  --days <number>           Number of days to sync (default: 16)
  --integration <id>        Specific integration ID (optional)
  --dry-run                 Show what would happen (not implemented)
  --help, -h               Show this help message

EXAMPLES:
  # Sync last 16 days (default)
  node scripts/sync-stellar-cyber-alerts-api.js

  # Sync last 30 days
  node scripts/sync-stellar-cyber-alerts-api.js --days 30

  # Sync specific integration
  node scripts/sync-stellar-cyber-alerts-api.js --integration cmispaga200b8jwvpdct2a2i6

  # Sync 7 days
  node scripts/sync-stellar-cyber-alerts-api.js --days 7

REQUIREMENTS:
  - Database must be running (PostgreSQL)
  - API must be accessible at http://localhost:3000
  - Stellar Cyber integration must be configured and connected

ENVIRONMENT:
  API_BASE_URL - API endpoint (default: http://localhost:3000)
  API_AUTH_TOKEN - Auth token if needed
  DATABASE_URL - PostgreSQL connection string

OUTPUT:
  - Shows integration being used
  - Displays database statistics after sync
  - Shows sample recent alerts
  - Displays alerts distribution by date
  `);
}

// Main
const options = parseArgs();
syncStellarCyberAlerts(options);
