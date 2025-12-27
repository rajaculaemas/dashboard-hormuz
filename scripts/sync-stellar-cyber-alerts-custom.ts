#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client'
import fetch from 'node-fetch'
import https from 'https'

const prisma = new PrismaClient()

const httpsAgent = new https.Agent({ rejectUnauthorized: false })

const pick = (...values: any[]) => values.find((v) => v !== undefined && v !== null && `${v}`.length > 0) || ''

async function getStellarCyberCredentials(integrationId?: string) {
  if (!integrationId) return null
  const integration = await prisma.integration.findUnique({ where: { id: integrationId } })
  if (!integration) return null
  let credentials: Record<string, any> = {}
  if (Array.isArray(integration.credentials)) {
    integration.credentials.forEach((cred: any) => {
      if (cred && typeof cred === 'object' && 'key' in cred && 'value' in cred) credentials[cred.key] = cred.value
    })
  } else {
    credentials = (integration.credentials as Record<string, any>) || {}
  }

  const HOST = pick(credentials.host, credentials.HOST, credentials.STELLAR_CYBER_HOST, credentials.stellar_cyber_host, credentials.stellar_host, credentials.api_host, credentials.base_url, credentials.url)
  const USER_ID = pick(credentials.user_id, credentials.USER_ID, credentials.username, credentials.user, credentials.email, credentials.login, credentials.account)
  const REFRESH_TOKEN = pick(credentials.refresh_token, credentials.refreshToken, credentials.REFRESH_TOKEN, credentials.password, credentials.token, credentials.apiToken)
  const TENANT_ID = pick(credentials.tenant_id, credentials.TENANT_ID, credentials.tenant, credentials.customer_id, credentials.cust_id)
  const API_KEY = pick(credentials.api_key, credentials.API_KEY, credentials.apiKey, credentials.apiToken, credentials.api_token, credentials.token, credentials.key, credentials.secret)

  return { HOST, USER_ID, REFRESH_TOKEN, TENANT_ID, API_KEY }
}

async function getAccessToken(integrationId?: string) {
  const creds = await getStellarCyberCredentials(integrationId)
  if (!creds) return null
  const { HOST, USER_ID, REFRESH_TOKEN, TENANT_ID } = creds
  if (!HOST || HOST === 'localhost' || !USER_ID || !REFRESH_TOKEN || !TENANT_ID) return null
  const auth = Buffer.from(`${USER_ID}:${REFRESH_TOKEN}:${TENANT_ID}`).toString('base64')
  const url = `https://${HOST}/connect/api/v1/access_token`
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, agent: httpsAgent })
    if (!res.ok) return null
    const data: any = await res.json()
    return data?.access_token || null
  } finally {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
  }
}

// Minimal getAlerts implementation that supports startTime/endTime (ISO) and daysBack
async function getAlertsLocal(params: { integrationId: string; startTime?: string; endTime?: string; daysBack?: number; limit?: number }) {
  const { integrationId, startTime, endTime, daysBack = 7, limit = 100 } = params
  const creds = await getStellarCyberCredentials(integrationId)
  if (!creds || !creds.HOST || !creds.TENANT_ID) return []
  const { HOST, TENANT_ID } = creds

  const now = new Date()
  const tzOffset = 7 * 60 * 60 * 1000
  const localNow = new Date(now.getTime() + tzOffset)
  let startDate: Date
  let endDate: Date
  if (startTime || endTime) {
    endDate = endTime ? new Date(endTime) : new Date()
    startDate = startTime ? new Date(startTime) : new Date(endDate.getTime() - (daysBack || 7) * 24 * 60 * 60 * 1000)
  } else {
    endDate = localNow
    startDate = new Date(localNow.getTime() - (daysBack || 7) * 24 * 60 * 60 * 1000)
  }

  const token = await getAccessToken(integrationId)
  if (!token) return []

  const q = `tenantid:${TENANT_ID} AND timestamp:[${startDate.toISOString()} TO ${endDate.toISOString()}]`
  const paramsObj = new URLSearchParams({ size: String(limit), q, sort: 'timestamp:desc' })
  const url = `https://${HOST}/connect/api/data/aella-ser-*/_search?${paramsObj.toString()}`
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, agent: httpsAgent })
    if (!res.ok) return []
    const data: any = await res.json()
    if (!data?.hits?.hits) return []
    return data.hits.hits.map((hit: any) => ({
      _id: hit._id,
      timestamp: hit._source?.timestamp || hit._source?.stellar?.alert_time,
      title: hit._source?.xdr_event?.display_name || hit._source?.event_name,
      description: hit._source?.xdr_event?.description || hit._source?.description || '',
      status: hit._source?.event_status || hit._source?.status || undefined,
      severity: (hit._source?.severity) || (hit._source?.event_score) || undefined,
      metadata: hit._source,
    }))
  } finally {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
  }
}

/**
 * Custom Stellar Cyber sync script
 *
 * Usage:
 *  - Edit the `DEFAULT_FROM` / `DEFAULT_TO` constants below to change the default time range,
 *    or pass `--from <ISO>` and `--to <ISO>` to override at runtime.
 *  - Optionally pass `--integration <id>` to target a specific integration.
 *  - Use `--dry-run` to see counts without writing to DB.
 *
 * Examples:
 *  pnpm ts-node scripts/sync-stellar-cyber-alerts-custom.ts --days 30
 *  pnpm ts-node scripts/sync-stellar-cyber-alerts-custom.ts --integration <id>
 */

// By default this script will sync the last 30 days. You can change the
// constants below, or prefer to pass `--from`/`--to` on the CLI.
const DEFAULT_DAYS_BACK = 30 // used only when one side of range omitted
// DEFAULT_FROM / DEFAULT_TO should be ISO timestamps or empty string to use relative
const DEFAULT_FROM = "" // e.g. "2025-12-01T00:00:00Z" or empty
const DEFAULT_TO = ""   // e.g. "2025-12-24T23:59:59Z" or empty

interface Options {
  integrationId?: string
  // Use explicit start/end (ISO) instead of daysBack for hour-granular ranges
  from?: string
  to?: string
  daysBack?: number
  dryRun?: boolean
  batchSize?: number
}

async function sync(options: Options = {}) {
  const { integrationId, from, to, daysBack = DEFAULT_DAYS_BACK, dryRun = false, batchSize = 100 } = options

  console.log("Starting Stellar Cyber sync (custom)")
  console.log(`Options: integrationId=${integrationId || "(any)"} daysBack=${daysBack} dryRun=${dryRun} batchSize=${batchSize}`)

  try {
    // Find integration (or first connected Stellar Cyber)
    let integration: any
    if (integrationId) {
      integration = await prisma.integration.findUnique({ where: { id: integrationId } })
    } else {
      integration = await prisma.integration.findFirst({ where: { source: "stellar-cyber", status: "connected" } })
    }

    if (!integration) {
      console.error("Stellar Cyber integration not found. Configure an integration in DB or pass --integration <id>.")
      process.exit(1)
    }

    console.log(`Using integration: ${integration.name} (${integration.id})`)

    if (from || to) {
      console.log(`Fetching alerts from Stellar Cyber (range: ${from || "(from omitted)"} -> ${to || "(to omitted)"})`)
    } else if (DEFAULT_FROM || DEFAULT_TO) {
      console.log(`Fetching alerts using defaults from file: ${DEFAULT_FROM || "(from omitted)"} -> ${DEFAULT_TO || "(to omitted)"}`)
    } else {
      console.log(`Fetching alerts from Stellar Cyber (last ${daysBack} days)...`)
    }

    const alerts = await getAlertsLocal({ integrationId: integration.id, limit: 10000, startTime: from || DEFAULT_FROM || undefined, endTime: to || DEFAULT_TO || undefined, daysBack })

    console.log(`Fetched ${alerts.length} alerts`)
    if (!alerts || alerts.length === 0) {
      console.log("No alerts to sync")
      process.exit(0)
    }

    let synced = 0
    let updated = 0
    let failed = 0

    for (let i = 0; i < alerts.length; i += batchSize) {
      const batch = alerts.slice(i, i + batchSize)

      for (const a of batch) {
        try {
          const externalId = a._id
          if (!externalId) {
            failed++
            continue
          }

          const mapped = {
            externalId,
            title: a.title || "Unknown Alert",
            description: a.description || "",
            severity: String(a.severity || "0"),
            status: a.status || "New",
            timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
            integrationId: integration.id,
            metadata: a.metadata || {},
          }

          if (!dryRun) {
            const existing = await prisma.alert.findUnique({ where: { externalId } })
            if (existing) {
              // Merge existing metadata with incoming metadata to avoid losing fields
              const existingMeta = (existing.metadata as Record<string, any>) || {}
              const incomingMeta = (mapped.metadata as Record<string, any>) || {}
              const mergedMeta = { ...existingMeta, ...incomingMeta }

                const updateData: any = { metadata: mergedMeta, updatedAt: new Date() }
                // Only overwrite fields if the incoming payload provides them;
                // otherwise preserve existing values to avoid downgrading status/title, etc.
                if (a.title) updateData.title = mapped.title
                if (a.description) updateData.description = mapped.description
                if (a.severity) updateData.severity = mapped.severity
                if (a.status) updateData.status = mapped.status
                if (a.timestamp) updateData.timestamp = mapped.timestamp

                await prisma.alert.update({ where: { externalId }, data: updateData })
              updated++
            } else {
              await prisma.alert.create({ data: mapped })
              synced++
            }
          } else {
            // Dry run: just count as synced
            synced++
          }
        } catch (err) {
          failed++
          console.error("Error syncing alert:", err instanceof Error ? err.message : String(err))
        }
      }
    }

    console.log("Sync complete")
    console.log(`New: ${synced}, Updated: ${updated}, Failed: ${failed}`)

    // update integration lastSync
    if (!dryRun) {
      try {
        await prisma.integration.update({ where: { id: integration.id }, data: { lastSync: new Date() } })
      } catch (e) {
        console.warn("Failed to update integration.lastSync:", e instanceof Error ? e.message : String(e))
      }
    }

    return { synced, updated, failed }
  } finally {
    await prisma.$disconnect()
  }
}

// CLI parsing
async function main() {
  const args = process.argv.slice(2)
  const opts: Options = { daysBack: DEFAULT_DAYS_BACK, batchSize: 100 }

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === "--days" && args[i + 1]) {
      opts.daysBack = parseInt(args[i + 1], 10)
      i++
    } else if (a === "--from" && args[i + 1]) {
      opts.from = args[i + 1]
      i++
    } else if (a === "--to" && args[i + 1]) {
      opts.to = args[i + 1]
      i++
    } else if (a === "--integration" && args[i + 1]) {
      opts.integrationId = args[i + 1]
      i++
    } else if (a === "--dry-run") {
      opts.dryRun = true
    } else if (a === "--batch-size" && args[i + 1]) {
      opts.batchSize = parseInt(args[i + 1], 10)
      i++
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: pnpm ts-node scripts/sync-stellar-cyber-alerts-custom.ts [--days N] [--integration ID] [--dry-run] [--batch-size N]\n\nDEFAULT_DAYS_BACK = ${DEFAULT_DAYS_BACK} (edit file to change default)`)
      process.exit(0)
    }
  }

  await sync(opts)
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err))
  process.exit(1)
})