/**
 * Chat tool executor — all functions return plain objects (not NextResponse).
 * Used directly by /api/chat/route.ts (server-to-server, no HTTP) and wrapped
 * by /api/chat/tools/route.ts for external HTTP access.
 */
import prisma from "@/lib/prisma"
import { checkIpReputation } from "@/lib/threat-intel/virustotal"
import { QRadarClient } from "@/lib/api/qradar"
import { WazuhClient } from "@/lib/api/wazuh-client"
import { searchStellarEvents } from "@/lib/api/stellar-cyber"

export async function executeTool(tool: string, parameters: any): Promise<any> {
  switch (tool) {
    case "get_alerts":           return getAlerts(parameters)
    case "get_alert_stats":      return getAlertStats(parameters)
    case "search_alerts":        return searchAlerts(parameters)
    case "check_ip_threat":      return checkIpThreat(parameters)
    case "get_integrations":     return getIntegrations(parameters)
    case "get_alert_detail":     return getAlertDetail(parameters)
    case "get_cases":            return getCases(parameters)
    case "query_qradar_events":  return queryQRadarEvents(parameters)
    case "query_wazuh_events":   return queryWazuhEvents(parameters)
    case "query_stellar_events": return queryStellarEvents(parameters)
    case "execute_qradar_aql":   return executeQRadarAql(parameters)
    default:
      throw new Error(`Unknown tool: ${tool}`)
  }
}

export async function checkIpThreat(parameters: any) {
  const { ip } = parameters ?? {}
  if (!ip) return { error: "IP address parameter is missing" }

  const result = await checkIpReputation(ip)
  const summary = result
    ? `Hasil analisis dari layanan threat intelligence terhadap IP \`${ip}\`:\n\n${result}`
    : `Tidak ditemukan informasi signifikan terkait IP \`${ip}\`. Disarankan untuk tetap memantau aktivitas yang berkaitan.`

  return { summary, raw: result, ip }
}

export async function getAlerts(parameters: any) {
  const { timeRange = "1h", status, severity, limit = 10, integrationId, integrationName } = parameters ?? {}

  const hours: Record<string, number> = {
    "15m": 0.25, "30m": 0.5,
    "1h": 1, "2h": 2, "3h": 3, "6h": 6, "12h": 12,
    "24h": 24, "2d": 48, "3d": 72, "7d": 168, "14d": 336, "30d": 720,
  }
  const fromTime = new Date(Date.now() - (hours[timeRange] ?? 1) * 60 * 60 * 1000)

  const where: any = { timestamp: { gte: fromTime } }
  if (status) where.status = status
  if (severity) where.severity = severity
  if (integrationId) {
    where.integrationId = integrationId
  } else if (integrationName) {
    where.integration = { name: { contains: integrationName, mode: "insensitive" } }
  }

  const alerts = await prisma.alert.findMany({
    where,
    include: { integration: { select: { id: true, name: true, source: true } } },
    orderBy: { timestamp: "desc" },
    take: limit,
  })

  return {
    alerts: alerts.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      severity: a.severity,
      status: a.status,
      source: a.integration?.source,
      integrationId: a.integration?.id,
      integrationName: a.integration?.name,
      externalId: a.externalId,
      timestamp: a.timestamp.toISOString(),
      metadata: a.metadata,
    })),
    count: alerts.length,
    timeRange,
    integrationId: integrationId ?? null,
  }
}

export async function getAlertStats(parameters: any) {
  const { timeRange = "24h" } = parameters ?? {}

  const hours: Record<string, number> = {
    "1h": 1, "12h": 12, "24h": 24, "7d": 168, "30d": 720,
  }
  const fromTime = new Date(Date.now() - (hours[timeRange] ?? 24) * 60 * 60 * 1000)
  const filter = { timestamp: { gte: fromTime } }

  const [totalAlerts, statusCounts, severityCounts] = await Promise.all([
    prisma.alert.count({ where: filter }),
    prisma.alert.groupBy({ by: ["status"], where: filter, _count: { status: true } }),
    prisma.alert.groupBy({ by: ["severity"], where: filter, _count: { severity: true } }),
  ])

  return {
    totalAlerts,
    statusCounts: statusCounts.reduce((acc, i) => { acc[i.status] = i._count.status; return acc }, {} as Record<string, number>),
    severityCounts: severityCounts.reduce((acc, i) => { acc[i.severity ?? "unknown"] = i._count.severity; return acc }, {} as Record<string, number>),
    timeRange,
  }
}

export async function searchAlerts(parameters: any) {
  const { query, timeRange = "30d", limit = 20, severity, status, externalId } = parameters ?? {}

  const hours: Record<string, number> = {
    "1h": 1, "12h": 12, "24h": 24, "7d": 168, "30d": 720,
  }
  const fromTime = new Date(Date.now() - (hours[timeRange] ?? 720) * 60 * 60 * 1000)

  const where: any = { timestamp: { gte: fromTime } }
  if (severity) where.severity = severity
  if (status) where.status = status
  if (externalId) where.externalId = externalId
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { externalId: { contains: query, mode: "insensitive" } },
    ]
  }

  const alerts = await prisma.alert.findMany({
    where,
    include: {
      integration: { select: { id: true, name: true, source: true } },
      timeline: { orderBy: { timestamp: "desc" }, take: 5 },
    },
    orderBy: { timestamp: "desc" },
    take: limit,
  })

  return {
    alerts: alerts.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      severity: a.severity,
      status: a.status,
      source: a.integration?.source,
      integrationName: a.integration?.name,
      integrationId: a.integration?.id,
      externalId: a.externalId,
      timestamp: a.timestamp.toISOString(),
      metadata: a.metadata,
      analysisNotes: a.analysisNotes,                 // SOC analyst comment/notes
      severityBasedOnAnalysis: a.severityBasedOnAnalysis, // analyst's severity assessment
      timeline: a.timeline.map(t => ({               // history of actions taken
        eventType: t.eventType,
        description: t.description,
        oldValue: t.oldValue,
        newValue: t.newValue,
        changedBy: t.changedBy,
        timestamp: t.timestamp.toISOString(),
      })),
    })),
    count: alerts.length,
    timeRange,
    query,
  }
}

export async function getIntegrations(parameters: any) {
  const { source } = parameters ?? {}

  const where: any = { status: { in: ["connected", "active"] } }
  if (source) where.source = { contains: source, mode: "insensitive" }

  const integrations = await prisma.integration.findMany({
    where,
    select: { id: true, name: true, source: true, status: true, lastSync: true },
    orderBy: { name: "asc" },
  })

  return { integrations, count: integrations.length }
}

export async function getAlertDetail(parameters: any) {
  const { alertId, externalId } = parameters ?? {}
  if (!alertId && !externalId) return { error: "Provide alertId or externalId" }

  const alert = await prisma.alert.findFirst({
    where: alertId ? { id: alertId } : { externalId },
    include: {
      integration: { select: { id: true, name: true, source: true } },
      timeline: { orderBy: { timestamp: "desc" }, take: 10 },
      relatedCases: {
        include: { case: { select: { id: true, name: true, status: true, severity: true } } },
      },
    },
  })

  if (!alert) return { error: "Alert not found" }
  return { alert }
}

export async function getCases(parameters: any) {
  const { timeRange = "24h", status, limit = 20 } = parameters ?? {}

  const hours: Record<string, number> = {
    "1h": 1, "6h": 6, "12h": 12, "24h": 24, "7d": 168, "30d": 720,
  }
  const fromTime = new Date(Date.now() - (hours[timeRange] ?? 24) * 60 * 60 * 1000)

  const where: any = { createdAt: { gte: fromTime } }
  if (status) where.status = status

  const cases = await prisma.case.findMany({
    where,
    include: {
      integration: { select: { name: true, source: true } },
      _count: { select: { relatedAlerts: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return {
    cases: cases.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      severity: c.severity,
      createdAt: c.createdAt,
      alertCount: c._count.relatedAlerts,
      integration: c.integration,
      tags: c.tags,
    })),
    count: cases.length,
    timeRange,
  }
}

export async function queryQRadarEvents(parameters: any) {
  const { offenseId, integrationId } = parameters ?? {}
  if (!offenseId || !integrationId) return { error: "offenseId and integrationId are required" }

  const cached = await prisma.qRadarEvent.findMany({
    where: { offenseId: Number(offenseId) },
    orderBy: { eventTimestamp: "desc" },
    take: 30,
  })

  if (cached.length > 0) {
    return {
      events: cached.map((e) => ({
        id: e.id,
        eventName: e.eventName,
        eventType: e.eventType,
        sourceIp: e.sourceIp,
        destinationIp: e.destinationIp,
        sourcePort: e.sourcePort,
        destinationPort: e.destinationPort,
        severity: e.severity,
        eventTimestamp: e.eventTimestamp.toISOString(),
        payload: e.payload,
        metadata: e.metadata,
      })),
      count: cached.length,
      source: "database_cache",
      offenseId,
    }
  }

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } })
  if (!integration) return { error: "Integration not found" }

  const creds = integration.credentials as any
  const client = new QRadarClient({
    host: creds.host,
    api_key: creds.api_key,
    domain_id: creds.domain_id ? Number(creds.domain_id) : undefined,
  })

  try {
    const events = await client.getRelatedEvents(Number(offenseId), 24)
    return {
      events: events.slice(0, 30).map((e) => ({
        sourceIp: e.sourceip,
        destinationIp: e.destinationip,
        sourcePort: e.sourceport,
        destinationPort: e.destinationport,
        severity: e.severity,
        eventTimestamp: new Date(e.starttime).toISOString(),
        username: e.username,
        eventName: (e as any).event_name,
        payload: e.payload,
      })),
      count: Math.min(events.length, 30),
      source: "qradar_live",
      offenseId,
    }
  } catch (err: any) {
    return { error: `QRadar query failed: ${err.message}` }
  }
}

export async function queryWazuhEvents(parameters: any) {
  const { integrationId, query, srcIp, dstIp, agentName, ruleId, indexPattern, timeRange = "24h", limit = 20 } = parameters ?? {}
  if (!integrationId) return { error: "integrationId is required" }

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } })
  if (!integration) return { error: "Integration not found" }

  const creds = integration.credentials as any
  const client = new WazuhClient({
    elasticsearch_url: creds.elasticsearch_url || creds.url || "",
    elasticsearch_username: creds.elasticsearch_username || creds.username || "",
    elasticsearch_password: creds.elasticsearch_password || creds.password || "",
    elasticsearch_index: creds.elasticsearch_index || "wazuh-posindonesia*",
  })

  // Default: search all three known index patterns unless caller specifies one
  const resolvedIndexPattern = indexPattern || "wazuh-posindonesia*,fortinet-posindonesia*,palo_alto-fw-posindonesia*"

  const hours: Record<string, number> = { "1h": 1, "2h": 2, "3h": 3, "6h": 6, "12h": 12, "24h": 24, "7d": 168 }
  const since = new Date(Date.now() - (hours[timeRange] ?? 24) * 60 * 60 * 1000).toISOString()
  const until = new Date().toISOString()

  try {
    const events = await client.searchRawLogs({
      query,
      srcIp,
      dstIp,
      agentName,
      ruleId,
      indexPattern: resolvedIndexPattern,
      since,
      until,
      limit,
    })

    return {
      events,
      count: events.length,
      source: "wazuh_live",
      timeRange,
      indexPattern: resolvedIndexPattern,
    }
  } catch (err: any) {
    return { error: `Wazuh query failed: ${err.message}` }
  }
}

export async function queryStellarEvents(parameters: any) {
  const {
    integrationId, indexPattern = "aella-ser-*",
    query, srcIp, dstIp, timeRange = "24h", limit = 20,
  } = parameters ?? {}

  if (!integrationId) return { error: "integrationId is required" }

  try {
    const result = await searchStellarEvents({ integrationId, indexPattern, query, srcIp, dstIp, timeRange, limit })
    return {
      events: result.events.map((e: any) => ({
        id: e.id, index: e.index, timestamp: e.timestamp,
        srcip: e.srcip, dstip: e.dstip, srcport: e.srcport, dstport: e.dstport,
        proto_name: e.proto_name, event_name: e.event_name || e.xdr_event?.display_name,
        event_type: e.event_type, severity: e.severity,
        msg_class: e.msg_class, engid_name: e.engid_name,
        tenantid: e.tenantid, appid_name: e.appid_name,
        dev_type: e.dev_type,
        // Device-specific nested objects — required for per-vendor field access
        cisco_meraki: e.cisco_meraki,       // cisco_meraki.user, cisco_meraki.event_type, cisco_meraki.peer_ip, etc.
        palo_alto: e.palo_alto,
        user: e.user,
        // Office 365 / Azure AD fields (index: aella-wineventlog-*)
        Operation: e.Operation,             // action performed (e.g. "Delete user.")
        ObjectId: e.ObjectId,               // target user email/UPN (the deleted user)
        UserId: e.UserId,                   // actor who performed the action
        ResultStatus: e.ResultStatus,       // "Success" or "Failure"
        Workload: e.Workload,               // "AzureActiveDirectory", "Exchange", etc.
        Target: e.Target,                   // array of target identifiers (Type=5 contains email)
        ModifiedProperties: e.ModifiedProperties,
        office365: e.office365,
      })),
      total: result.total,
      count: result.events.length,
      index: result.index,
      source: "stellar_cyber_live",
      timeRange,
    }
  } catch (err: any) {
    return { error: `Stellar Cyber query failed: ${err.message}` }
  }
}

export async function executeQRadarAql(parameters: any) {
  const { integrationId, aql, offenseId, limit = 30 } = parameters ?? {}
  if (!integrationId) return { error: "integrationId is required" }

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } })
  if (!integration) return { error: "Integration not found" }

  const creds = integration.credentials as any
  const client = new QRadarClient({
    host: creds.host,
    api_key: creds.api_key,
    domain_id: creds.domain_id ? Number(creds.domain_id) : undefined,
  })

  let offenseContext: any = null
  let resolvedAql = aql

  if (offenseId) {
    try {
      offenseContext = await client.getOffenseDetails(Number(offenseId))
      const logSourceIds = (offenseContext.log_sources ?? []).map((ls: any) => ls.id)
      if (!aql) {
        const logSourceFilter = logSourceIds.length > 0
          ? `logsourceid IN (${logSourceIds.join(",")})`
          : `INOFFENSE(${offenseId})`
        resolvedAql = `
          SELECT starttime, endtime, sourceip, destinationip, sourceport, destinationport,
                 logsourceid, QIDNAME(qid) as event_name, severity, username, UTF8(payload) as payload
          FROM events WHERE ${logSourceFilter} ORDER BY starttime DESC LAST 24 HOURS
        `
      }
    } catch (err: any) {
      console.error("[chat/tools] Failed to fetch offense details:", err.message)
    }
  }

  if (!resolvedAql) return { error: "Provide 'aql' or 'offenseId' to auto-generate a query" }

  try {
    const events = await client.executeAQL(resolvedAql.trim(), limit)
    return {
      events, count: events.length, source: "qradar_aql",
      aqlExecuted: resolvedAql.trim(),
      offenseContext: offenseContext ? {
        id: offenseContext.id, description: offenseContext.description,
        severity: offenseContext.severity, status: offenseContext.status,
        log_sources: offenseContext.log_sources, categories: offenseContext.categories,
      } : null,
    }
  } catch (err: any) {
    return { error: `QRadar AQL failed: ${err.message}` }
  }
}
