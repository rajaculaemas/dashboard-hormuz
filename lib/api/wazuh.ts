import prisma from "@/lib/prisma"
import { WazuhClient, type WazuhAlert, type WazuhCredentials } from "@/lib/api/wazuh-client"

/**
 * Get Wazuh credentials from database
 */
async function getWazuhCredentials(integrationId?: string): Promise<WazuhCredentials> {
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
export async function getAlerts(integrationId?: string): Promise<any> {
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

    const lastSync = integration?.lastSync
    // Use lastSync if available (incremental sync), otherwise fetch from 12 hours ago (initial sync)
    let since: string
    if (lastSync) {
      // Incremental sync: fetch from last sync time
      // Go back 5 minutes before lastSync to catch any borderline alerts
      const syncTime = new Date(lastSync.getTime() - 5 * 60 * 1000)
      since = syncTime.toISOString()
      console.log(`[Wazuh] Incremental sync - fetching from last sync at: ${lastSync.toISOString()}`)
    } else {
      // Initial sync: fetch from last 12 hours
      since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      console.log(`[Wazuh] Initial sync - fetching from last 12 hours`)
    }
    
    console.log(`[Wazuh] Fetching alerts since: ${since}`)

    // Fetch alerts from Elasticsearch - focused on recent 3h window
    const wazuhAlerts = await wazuhClient.searchAlerts(since)

    // Store or update alerts in database
    const storedAlerts = []

    for (const alert of wazuhAlerts) {
      // Defensive: ensure the alert really is an ALERT (some sources may return mixed levels)
      let alertSyslogLevel: string | undefined = undefined
      try {
        alertSyslogLevel = (alert.metadata?.syslog_level || alert.metadata?.rule_level || undefined) as string | undefined
        if (!alertSyslogLevel && typeof alert.metadata?.message === 'string') {
          try {
            const parsed = JSON.parse(alert.metadata.message)
            alertSyslogLevel = parsed?.syslog_level
          } catch {
            // ignore parse errors
          }
        }
      } catch {
        // ignore
      }

      if (alertSyslogLevel && String(alertSyslogLevel).toUpperCase() !== 'ALERT') {
        console.log(`[Wazuh] Skipping upsert for ${alert.externalId} due to syslog_level=${alertSyslogLevel}`)
        continue
      }

      // Use upsert to avoid race conditions hitting the unique external_id constraint
      const storedAlert = await prisma.alert.upsert({
        where: { externalId: alert.externalId },
        update: {
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
        create: {
          externalId: alert.externalId,
          title: alert.title,
          description: `Agent: ${alert.agent.name} (${alert.agent.ip})\nRule: ${alert.rule.description}\nMessage: ${alert.message}`,
          severity: null as any, // Severity is not set automatically - user must assign via Update Status
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
    }

    // Update last sync time
    if (integration) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastSync: new Date() },
      })
    }

    return {
      success: true,
      count: storedAlerts.length,
      alerts: storedAlerts,
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
