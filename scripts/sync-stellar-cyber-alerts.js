#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');
const https = require('https');

const prisma = new PrismaClient();

// HTTP agent untuk SSL
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

// Utility untuk extract URL parts
function urlunparse({ protocol, hostname, pathname, search }) {
  let url = `${protocol}//${hostname}${pathname}`;
  if (search) url += '?' + search;
  return url;
}

async function getStellarCyberCredentials(integrationId) {
  try {
    let integration;
    if (integrationId) {
      integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      });

      if (!integration || integration.source !== 'stellar-cyber') {
        throw new Error('Stellar Cyber integration not found');
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
      return {
        HOST: process.env.STELLAR_CYBER_HOST || 'localhost',
        USER_ID: process.env.STELLAR_CYBER_USER_ID || 'demo@example.com',
        REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN || 'demo-token',
        TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID || 'demo-tenant',
        API_KEY: process.env.STELLAR_CYBER_API_KEY || '',
      };
    }

    let credentials = {};
    if (Array.isArray(integration.credentials)) {
      integration.credentials.forEach((cred) => {
        if (cred && typeof cred === 'object' && 'key' in cred && 'value' in cred) {
          credentials[cred.key] = cred.value;
        }
      });
    } else {
      credentials = integration.credentials || {};
    }

    const pick = (...values) => values.find((v) => v !== undefined && v !== null && `${v}`.length > 0) || '';

    return {
      HOST: pick(
        credentials.host,
        credentials.HOST,
        credentials.STELLAR_CYBER_HOST,
        credentials.stellar_cyber_host,
        credentials.stellar_host,
        credentials.api_host,
        credentials.base_url,
        credentials.url,
      ),
      USER_ID: pick(
        credentials.user_id,
        credentials.USER_ID,
        credentials.username,
        credentials.user,
        credentials.email,
        credentials.login,
        credentials.account,
      ),
      REFRESH_TOKEN: pick(
        credentials.refresh_token,
        credentials.refreshToken,
        credentials.REFRESH_TOKEN,
        credentials.password,
        credentials.token,
        credentials.apiToken,
      ),
      TENANT_ID: pick(
        credentials.tenant_id,
        credentials.TENANT_ID,
        credentials.tenant,
        credentials.customer_id,
        credentials.cust_id,
      ),
      API_KEY: pick(
        credentials.api_key,
        credentials.API_KEY,
        credentials.apiKey,
        credentials.apiToken,
        credentials.api_token,
        credentials.token,
        credentials.key,
        credentials.secret,
        credentials.APIKEY,
        credentials.apikey,
        credentials['api-key'],
      ),
    };
  } catch (error) {
    console.error('Error getting credentials:', error.message);
    return {
      HOST: process.env.STELLAR_CYBER_HOST || 'localhost',
      USER_ID: process.env.STELLAR_CYBER_USER_ID || 'demo@example.com',
      REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN || 'demo-token',
      TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID || 'demo-tenant',
      API_KEY: process.env.STELLAR_CYBER_API_KEY || '',
    };
  }
}

async function getAccessToken(integrationId) {
  const { HOST, USER_ID, REFRESH_TOKEN, TENANT_ID } = await getStellarCyberCredentials(integrationId);

  if (!HOST || HOST === 'localhost' || !USER_ID || !REFRESH_TOKEN || !TENANT_ID) {
    console.warn('⚠️ Stellar Cyber credentials not configured. Using dummy token.');
    return 'dummy-access-token';
  }

  const auth = Buffer.from(`${USER_ID}:${REFRESH_TOKEN}:${TENANT_ID}`).toString('base64');

  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const url = urlunparse({
    protocol: 'https',
    hostname: HOST,
    pathname: '/connect/api/v1/access_token',
  });

  try {
    console.log('🔐 Requesting access token...');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        agent: httpsAgent,
      });

      if (!response.ok) {
        console.error(`❌ Failed to get access token: ${response.status}`);
        return 'error-token';
      }

      const data = await response.json();
      console.log('✓ Access token obtained');
      return data.access_token;
    } finally {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
  } catch (error) {
    console.error('Error getting access token:', error.message);
    return 'error-token';
  }
}

async function getAlerts(params = {}) {
  const { integrationId, daysBack = 30, limit = 10000 } = params;
  const { HOST, TENANT_ID } = await getStellarCyberCredentials(integrationId);

  if (!HOST || !TENANT_ID) {
    console.warn('Stellar Cyber credentials not configured.');
    return [];
  }

  try {
    const token = await getAccessToken(integrationId);
    if (!token || token === 'dummy-access-token' || token === 'error-token') {
      console.warn('⚠️ Cannot authenticate to Stellar Cyber. Returning empty list.');
      return [];
    }

    // Build query
    const now = new Date();
    const tzOffset = 7 * 60 * 60 * 1000;
    const localTime = new Date(now.getTime() + tzOffset);
    const startDate = new Date(localTime.getTime() - daysBack * 24 * 60 * 60 * 1000);

    const mustClauses = [
      `tenantid:${TENANT_ID}`,
      `timestamp:[${startDate.toISOString()} TO ${localTime.toISOString()}]`,
    ];

    const queryParams = {
      size: limit.toString(),
      q: mustClauses.join(' AND '),
      sort: 'timestamp:desc',
    };

    const url = urlunparse({
      protocol: 'https',
      hostname: HOST,
      pathname: '/connect/api/data/aella-ser-*/_search',
      search: new URLSearchParams(queryParams).toString(),
    });

    console.log(`📤 Fetching alerts from Stellar Cyber (${daysBack} days back)...`);
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        agent: httpsAgent,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to get alerts: ${response.status}`, errorText);
        return [];
      }

      const data = await response.json();
      if (!data.hits || !data.hits.hits) {
        console.warn('⚠️ No hits in response.');
        return [];
      }

      // Map response to alerts
      const alerts = data.hits.hits.map((hit) => {
        const source = hit._source || {};
        const convertTimestamp = (ts) => {
          if (!ts) return '';
          if (typeof ts === 'string' && ts.includes('T')) return ts;
          const timestamp = typeof ts === 'number' ? ts : parseInt(ts);
          return new Date(timestamp).toISOString();
        };

        const mapSeverity = (severity) => {
          if (typeof severity === 'string') {
            const lower = severity.toLowerCase();
            if (['critical', 'high', 'medium', 'low'].includes(lower)) {
              return severity.charAt(0).toUpperCase() + severity.slice(1);
            }
          }
          const numSev = Number(severity) || 0;
          if (numSev >= 80) return 'Critical';
          if (numSev >= 60) return 'High';
          if (numSev >= 40) return 'Medium';
          return 'Low';
        };

        return {
          _id: hit._id || '',
          _index: hit._index || '',
          title: source.xdr_event?.display_name || source.event_name || 'Unknown Alert',
          description: source.xdr_event?.description || '',
          severity: mapSeverity(source.severity),
          status: source.event_status || 'New',
          timestamp: convertTimestamp(source.timestamp),
          metadata: {
            alert_id: hit._id,
            alert_index: hit._index,
            alert_time: convertTimestamp(source.stellar?.alert_time || source.alert_time),
            closed_time: convertTimestamp(source.user_action?.last_timestamp),
            user_action: source.user_action,
            event_status: source.event_status,
            timestamp: convertTimestamp(source.timestamp),
            // Store other critical fields
            ...Object.keys(source)
              .filter((k) => !['_source', 'stellar', 'user_action', 'xdr_event'].includes(k))
              .reduce((acc, k) => {
                if (source[k] !== null && source[k] !== undefined) {
                  acc[k] = source[k];
                }
                return acc;
              }, {}),
          },
        };
      });

      console.log(`✓ Fetched ${alerts.length} alerts`);
      return alerts;
    } finally {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
  } catch (error) {
    console.error('Error getting alerts:', error.message);
    return [];
  }
}

async function syncStellarCyberAlerts(options = {}) {
  const { integrationId, daysBack = 30, batchSize = 100, dryRun = false } = options;

  console.log('🚀 Starting Stellar Cyber Alert Sync');
  console.log('📋 Options:', { integrationId, daysBack, batchSize, dryRun });

  try {
    // Get integration
    let integration;
    if (integrationId) {
      integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      });
    } else {
      integration = await prisma.integration.findFirst({
        where: {
          source: 'stellar-cyber',
          status: 'connected',
        },
      });
    }

    if (!integration) {
      console.error('❌ Stellar Cyber integration not found');
      process.exit(1);
    }

    console.log(`✓ Using integration: ${integration.name} (${integration.id})`);

    // Fetch alerts
    console.log(`\n📥 Fetching alerts...`);
    const alerts = await getAlerts({
      integrationId: integration.id,
      daysBack,
      limit: 10000,
    });

    if (alerts.length === 0) {
      console.log('⚠️ No alerts to sync');
      process.exit(0);
    }

    // Sync in batches
    let synced = 0;
    let updated = 0;
    let failed = 0;
    const failedAlerts = [];

    for (let i = 0; i < alerts.length; i += batchSize) {
      const batch = alerts.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(alerts.length / batchSize);

      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} alerts)...`);

      for (const alert of batch) {
        try {
          const alertId = alert._id || '';
          if (!alertId) {
            failed++;
            continue;
          }

          let alertTimestamp = alert.timestamp ? new Date(alert.timestamp) : new Date();

          const alertData = {
            externalId: alertId,
            integrationId: integration.id,
            title: alert.title || 'Unknown Alert',
            description: alert.description || undefined,
            severity: alert.severity || 'Low',
            status: alert.status || 'Open',
            timestamp: alertTimestamp,
            metadata: alert.metadata || {},
          };

          if (!dryRun) {
            const existing = await prisma.alert.findUnique({
              where: { externalId: alertId },
            });

            if (existing) {
              await prisma.alert.update({
                where: { externalId: alertId },
                data: {
                  ...alertData,
                  updatedAt: new Date(),
                },
              });
              updated++;
            } else {
              await prisma.alert.create({
                data: alertData,
              });
              synced++;
            }
          } else {
            synced++;
          }

          if ((synced + updated) % 10 === 0) {
            process.stdout.write(`\r  Progress: ${synced + updated}/${batch.length} `);
          }
        } catch (err) {
          failed++;
          failedAlerts.push(alert._id || 'unknown');
          console.error(`\n  ❌ Error: ${err.message}`);
        }
      }

      console.log(`\n  ✓ Batch complete`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SYNC SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Alerts Processed: ${alerts.length}`);
    console.log(`✓ Newly Synced: ${synced}`);
    console.log(`✓ Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);

    if (dryRun) {
      console.log('\n⚠️ DRY RUN MODE - No changes made');
    }

    // Verify
    console.log('\n🔍 Verifying sync...');
    const totalAlerts = await prisma.alert.count({
      where: { integrationId: integration.id },
    });

    const closedAlerts = await prisma.alert.count({
      where: {
        integrationId: integration.id,
        status: 'Closed',
      },
    });

    console.log('\n📈 Database Stats:');
    console.log(`  Total Stellar Cyber Alerts: ${totalAlerts}`);
    console.log(`  Closed Alerts: ${closedAlerts}`);

    // Sample alerts
    const samples = await prisma.alert.findMany({
      where: { integrationId: integration.id },
      orderBy: { timestamp: 'desc' },
      take: 3,
    });

    console.log('\n📅 Recent Alerts:');
    samples.forEach((a, idx) => {
      const meta = a.metadata;
      const hasUserAction = !!meta?.user_action;
      const date = new Date(a.timestamp).toLocaleDateString('en-CA');
      console.log(`  ${idx + 1}. [${date}] ${a.title.slice(0, 40)}... | ${a.status} | user_action: ${hasUserAction ? '✓' : '✗'}`);
    });

    console.log('\n✅ Sync completed!');
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Parse CLI args
const args = process.argv.slice(2);
const options = { daysBack: 30, batchSize: 100 };

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days' && args[i + 1]) {
    options.daysBack = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--integration' && args[i + 1]) {
    options.integrationId = args[i + 1];
    i++;
  } else if (args[i] === '--batch-size' && args[i + 1]) {
    options.batchSize = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--dry-run') {
    options.dryRun = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Stellar Cyber Alert Manual Sync Script

Usage: node scripts/sync-stellar-cyber-alerts.js [options]

Options:
  --days <number>           Days back to sync (default: 30)
  --integration <id>        Specific integration ID
  --batch-size <number>     Batch size (default: 100)
  --dry-run                 Preview without modifying
  --help                    Show help

Examples:
  # Sync last 30 days
  node scripts/sync-stellar-cyber-alerts.js

  # Sync last 16 days with dry-run
  node scripts/sync-stellar-cyber-alerts.js --days 16 --dry-run
    `);
    process.exit(0);
  }
}

syncStellarCyberAlerts(options);
