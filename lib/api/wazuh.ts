import prisma from "@/lib/prisma"
import { WazuhClient, type WazuhAlert, type WazuhCredentials } from "@/lib/api/wazuh-client"

/**
 * Get Wazuh credentials from database
 */
async function getWazuhCredentials(integrationId?: string): Promise<WazuhCredentials> {
  console.log(`[Wazuh] getWazuhCredentials called for integrationId=${integrationId || 'none'}`)
  try {
    let integration

    if (integrationId) {
      integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      })

      if (!integration || integration.source !== "wazuh") {
        throw new Error("Wazuh integration not found")
      }
    } else {
      integration = await prisma.integration.findFirst({
        where: {
          source: "wazuh",
          status: "connected",
        },
      })

      if (!integration) {
        throw new Error("No active Wazuh integration found")
      }
    }

    let credentials: Record<string, any> = {}

    // Handle both array and object credential formats
    if (Array.isArray(integration.credentials)) {
      const credArray = integration.credentials as any[]
      credArray.forEach((cred) => {
        if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
          credentials[cred.key] = cred.value
        }
      })
    } else {
      credentials = (integration.credentials as Record<string, any>) || {}
    }

    const result = {
      elasticsearch_url: credentials.elasticsearch_url || "",
      elasticsearch_username: credentials.elasticsearch_username || "",
      elasticsearch_password: credentials.elasticsearch_password || "",
      elasticsearch_index: credentials.elasticsearch_index || "wazuh-*",
    }
    
    console.log(`[Wazuh Credentials] URL: ${result.elasticsearch_url}`)
    console.log(`[Wazuh Credentials] Username: ${result.elasticsearch_username}`)
    console.log(`[Wazuh Credentials] Password length: ${result.elasticsearch_password.length}`)
    console.log(`[Wazuh Credentials] Index pattern: ${result.elasticsearch_index}`)
    
    return result
  } catch (error) {
    console.error("Error getting Wazuh credentials:", error)
    throw error
  }
}

/**
 * Fetch alerts from Wazuh Elasticsearch
 */
export async function getAlerts(
  integrationId?: string,
  options?: { since?: string; hoursBack?: number; resetCursor?: boolean; indexPattern?: string; filters?: any },
): Promise<any> {
  try {
    const credentials = await getWazuhCredentials(integrationId)

    const wazuhClient = new WazuhClient(credentials)

    // Load last processed timestamp from database
    let integration
    if (integrationId) {
      integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      })
    } else {
      integration = await prisma.integration.findFirst({
        where: {
          source: "wazuh",
          status: "connected",
        },
      })
    }

    console.log(`[Wazuh] getAlerts called for integrationId=${integrationId}`)
    console.log(`[Wazuh] Incoming options: ${JSON.stringify(options)}`)
    console.log(`[Wazuh] Integration record lastSync: ${integration?.lastSync ? integration.lastSync.toISOString() : 'NULL'}`)

    const lastSync = integration?.lastSync
    let since: string
    // If the integration has a lastSync but there are no alerts in DB for this integration,
    // it's likely the DB was wiped. In that case, force resetCursor=true to backfill alerts.
    let effectiveResetCursor = !!options?.resetCursor
    try {
      if (!effectiveResetCursor && lastSync && integration?.id) {
        const existingCount = await prisma.alert.count({ where: { integrationId: integration.id } })
        console.log(`[Wazuh] Existing alerts count for integration ${integration.id}: ${existingCount}`)
        if (existingCount === 0) {
          console.log(`[Wazuh] No existing alerts found but lastSync is set — forcing resetCursor=true to backfill.`)
          effectiveResetCursor = true
        }
      }
    } catch (e) {
      console.error('[Wazuh] Error checking existing alerts count:', e)
    }
    if (options?.since) {
      since = options.since
      console.log(`[Wazuh] Override since provided: ${since}`)
    } else if (options?.hoursBack && options.hoursBack > 0) {
      since = new Date(Date.now() - options.hoursBack * 60 * 60 * 1000).toISOString()
      console.log(`[Wazuh] Custom backfill - fetching last ${options.hoursBack} hours`)
    } else if (lastSync && !effectiveResetCursor) {
      // Overlap window: default 2 hours, but widen to 24 hours for Fortinet indices
      const isFortinetIndex = /fortinet/i.test(credentials.elasticsearch_index || '')
      const overlapMinutes = isFortinetIndex ? 8 * 60 : 120
      const syncTime = new Date(lastSync.getTime() - overlapMinutes * 60 * 1000)
      since = syncTime.toISOString()
      console.log(`[Wazuh] Incremental sync - fetching from lastSync -${overlapMinutes}min: ${since} (lastSync: ${lastSync.toISOString()}, fortinet=${isFortinetIndex})`)
    } else {
      since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
      console.log(`[Wazuh] Default sync - fetching last 3 hours (optimal balance for 10000 doc limit)`)
    }
    
    console.log(`[Wazuh] Fetching alerts since: ${since}`)

    // Fetch alerts from Elasticsearch - focused on recent 3h window
    const wazuhAlerts = await wazuhClient.searchAlerts(since, { indexPattern: options?.indexPattern, extraFilters: options?.filters })

    console.log(`[Wazuh] wazuhClient.searchAlerts returned ${Array.isArray(wazuhAlerts) ? wazuhAlerts.length : 0} alerts (raw)`)
    if (Array.isArray(wazuhAlerts)) {
      console.log('[Wazuh] List of externalId & timestamp from Wazuh:')
      wazuhAlerts.forEach(a => {
        console.log(`  - ${a.externalId} | ${a.timestamp?.toISOString?.() || a.timestamp}`)
      })
    }

    // Store or update alerts in database
    // Debug: cek jumlah alert di DB untuk integrationId dan window waktu yang sama
    if (integration?.id && since) {
      const dbCount = await prisma.alert.count({
        where: {
          integrationId: integration.id,
          timestamp: { gte: new Date(since) },
        },
      })
      console.log(`[Wazuh] Jumlah alert di DB (integrationId=${integration.id}, since=${since}): ${dbCount}`)
    }
    const storedAlerts = []

    for (const alert of wazuhAlerts) {
      // Defensive: ensure the alert really is an ALERT (some sources may return mixed levels)
      // Note: `alert.metadata` often wraps the original ES source under `raw_es`.
      // Inspect both `metadata` and `metadata.raw_es` to determine syslog level.
      let alertSyslogLevel: string | undefined = undefined
      const rawMeta: any = (alert.metadata && (alert.metadata.raw_es || alert.metadata)) || {}
      try {
        alertSyslogLevel = (alert.metadata?.syslog_level || alert.metadata?.rule_level || rawMeta?.syslog_level || rawMeta?.rule_level) as string | undefined
        if (!alertSyslogLevel && typeof rawMeta?.message === 'string') {
          try {
            const parsed = JSON.parse(rawMeta.message)
            alertSyslogLevel = parsed?.syslog_level || parsed?.rule_level
          } catch {
            // ignore parse errors
          }
        }
      } catch {
        // ignore
      }

      if (alertSyslogLevel && String(alertSyslogLevel).toUpperCase() !== 'ALERT') {
        console.log(`[Wazuh] SKIP ${alert.externalId} - syslog_level=${alertSyslogLevel} (not ALERT) | raw_syslog=${rawMeta?.syslog_level || rawMeta?.rule_level}`)
        continue
      }

      // Filter out specific noisy alerts per user rule:
      // Exclude only when rule_id == "200269" AND process_cmd_line == "/bin/nc -w 15 localhost 7171"

      try {
        const raw = (alert.metadata as any)?.raw_es || {}
        const ruleId = (alert.metadata as any)?.ruleId || raw.rule_id || alert.rule?.id
        const cmd = raw.process_cmd_line || raw.data_columns_cmdline || raw.process_cmdline
        if (String(ruleId) === "200269" && String(cmd).trim() === "/bin/nc -w 15 localhost 7171") {
          console.log(`[Wazuh] SKIP ${alert.externalId} - rule_id=200269 & process_cmd_line='/bin/nc -w 15 localhost 7171'`)
          continue
        }
      } catch (e) {
        console.warn('[Wazuh] Error checking noisy filter for alert', alert.externalId, e)
      }

      // Perbaikan: update alert hanya jika timestamp dari Wazuh lebih baru dari DB
      const existing = await prisma.alert.findUnique({ where: { externalId: alert.externalId } })
      let storedAlert
      if (!existing) {
        storedAlert = await prisma.alert.create({
          data: {
            externalId: alert.externalId,
            title: alert.title,
            description: `Agent: ${alert.agent.name} (${alert.agent.ip})\nRule: ${alert.rule.description}\nMessage: ${alert.message}`,
            severity: null as any,
            status: "New",
            timestamp: alert.timestamp,
            metadata: {
              wazuh: true,
              agent: alert.agent,
              rule: alert.rule,
              srcIp: alert.srcIp,
              dstIp: alert.dstIp,
              srcPort: alert.srcPort,
              dstPort: alert.dstPort,
              protocol: alert.protocol,
              manager: alert.manager,
              cluster: alert.cluster,
              ...alert.metadata,
            },
            integrationId: integration!.id,
          },
        })
        storedAlerts.push(storedAlert)
        console.log(`[Wazuh] CREATED ${alert.externalId} | rule_id=${alert.rule?.id || (alert.metadata as any)?.ruleId || (alert.metadata as any)?.raw_es?.rule_id} | timestamp=${alert.timestamp?.toISOString?.() || alert.timestamp}`)
        // Log semua waktu dari alert yang baru masuk
        const meta = alert.metadata || {}
        console.log(`[Wazuh][DB] CREATE extId=${alert.externalId} | timestamp=${alert.timestamp?.toISOString?.() || alert.timestamp} | timestamp_utc=${meta.raw_es?.timestamp_utc || meta.timestamp_utc} | timestamp_raw=${meta.raw_es?.timestamp || meta.timestamp}`)
      } else if (alert.timestamp > existing.timestamp) {
        storedAlert = await prisma.alert.update({
          where: { externalId: alert.externalId },
          data: {
            timestamp: alert.timestamp,
            metadata: {
              wazuh: true,
              agent: alert.agent,
              rule: alert.rule,
              srcIp: alert.srcIp,
              dstIp: alert.dstIp,
              srcPort: alert.srcPort,
              dstPort: alert.dstPort,
              protocol: alert.protocol,
              manager: alert.manager,
              cluster: alert.cluster,
              ...alert.metadata,
            },
            integrationId: integration!.id,
          },
        })
        storedAlerts.push(storedAlert)
        console.log(`[Wazuh] UPDATED ${alert.externalId} | existing_ts=${existing.timestamp.toISOString()} -> new_ts=${alert.timestamp?.toISOString?.() || alert.timestamp}`)
        // Log semua waktu dari alert yang diupdate
        const meta = alert.metadata || {}
        console.log(`[Wazuh][DB] UPDATE extId=${alert.externalId} | timestamp=${alert.timestamp?.toISOString?.() || alert.timestamp} | timestamp_utc=${meta.raw_es?.timestamp_utc || meta.timestamp_utc} | timestamp_raw=${meta.raw_es?.timestamp || meta.timestamp}`)
      } else {
        // Tidak update jika timestamp lama atau sama
        console.log(`[Wazuh] SKIP ${alert.externalId} - existing timestamp (${existing.timestamp.toISOString()}) >= incoming timestamp (${alert.timestamp?.toISOString?.() || alert.timestamp}) | raw_syslog=${rawMeta?.syslog_level || rawMeta?.rule_level}`)
      }
    }

    console.log(`[Wazuh] Stored/Upserted alerts count: ${storedAlerts.length}`)
    // Update last sync time only if we stored any alerts to avoid advancing the cursor
    if (integration) {
      if (storedAlerts.length > 0) {
        await prisma.integration.update({
          where: { id: integration.id },
          data: { lastSync: new Date() },
        })
        console.log(`[Wazuh] Updated integration.lastSync for ${integration.id} (${storedAlerts.length} alerts stored)`)
      } else {
        console.log(`[Wazuh] No alerts stored; NOT updating integration.lastSync for ${integration.id}`)
      }
    }

    return {
      success: true,
      count: storedAlerts.length,
      alerts: storedAlerts,
      // Tambahan: info jumlah alert di DB untuk window waktu yang sama (tanpa filter status)
      dbCount: integration?.id && since ? await prisma.alert.count({
        where: {
          integrationId: integration.id,
          timestamp: { gte: new Date(since) },
        },
      }) : undefined,
    }
  } catch (error) {
    console.error("Error fetching Wazuh alerts:", error)
    throw error
  }
}

/**
 * Verify Wazuh connection
 */
export async function verifyConnection(integrationId: string): Promise<boolean> {
  try {
    const credentials = await getWazuhCredentials(integrationId)
    const wazuhClient = new WazuhClient(credentials)

    // Try to fetch a single alert to verify connection
    const alerts = await wazuhClient.searchAlerts()

    return true
  } catch (error) {
    console.error("Wazuh connection verification failed:", error)
    return false
  }
}

/**
 * Update alert status
 */
export async function updateAlertStatus(
  externalId: string,
  status: "Open" | "In Progress" | "Closed",
  assignee?: string,
  severity?: string,
): Promise<any> {
  try {
    // Fetch existing alert first
    const existingAlert = await prisma.alert.findUnique({
      where: { externalId },
    })

    if (!existingAlert) {
      throw new Error("Alert not found")
    }

    const updatedAlert = await prisma.alert.update({
      where: { externalId },
      data: {
        status,
        ...(severity && { severity }),
        metadata: {
          ...(typeof existingAlert.metadata === "object" ? existingAlert.metadata : {}),
          assignee,
          statusUpdatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    })

    return updatedAlert
  } catch (error) {
    console.error("Error updating alert status:", error)
    throw error
  }
}

export type { WazuhAlert, WazuhCredentials } from "@/lib/api/wazuh-client"
