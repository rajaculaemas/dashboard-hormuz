import { NextRequest } from "next/server"
import prisma from "@/lib/prisma"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

// Helper parsers copied/ported from alert table client logic to ensure export matches UI
function tryParseJSON(v: any) {
  if (!v || typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}
// Helper: validate HTTP status-like values (100-599)
function looksLikeHttpStatus(v: any) {
  if (v === undefined || v === null) return false
  const s = String(v).trim()
  const m = s.match(/^\s*(\d{3})\b/)
  if (m && m[1]) {
    const n = parseInt(m[1], 10)
    return n >= 100 && n <= 599
  }
  return false
}

function extractWazuhNetworkFields(alert: any) {
  const metadata = alert.metadata || {}
  let parsedData: any = {}
  if (metadata.message && typeof metadata.message === 'string') {
    try { parsedData = JSON.parse(metadata.message) } catch {}
  } else if (alert && typeof alert.message === 'string') {
    try { parsedData = JSON.parse(alert.message) } catch {}
  }
  const get = (fn: () => any) => { try { const v = fn(); return v === undefined ? undefined : v } catch { return undefined } }

  const srcIp =
    get(() => parsedData.data.win.eventdata.sourceIp) ||
    get(() => parsedData.data.srcip) ||
    get(() => parsedData.data.columns.remote_address) ||
    metadata.data_columns_remote_address ||
    metadata.srcIp ||
    alert.srcIp ||
    metadata.srcip ||
    get(() => metadata.raw_es?.data?.srcip) ||
    get(() => metadata.raw_es?.src_ip) ||
    ''

  const dstIp =
    get(() => parsedData.data.win.eventdata.destinationIp) ||
    get(() => parsedData.data.dstip) ||
    get(() => parsedData.data.columns.local_address) ||
    metadata.data_columns_local_address ||
    metadata.dstIp ||
    alert.dstIp ||
    metadata.dstip ||
    get(() => metadata.raw_es?.data?.dstip) ||
    get(() => metadata.raw_es?.dst_ip) ||
    ''

  const responseCode =
    get(() => parsedData.data.win.eventdata.id) ||
    get(() => parsedData.data.id) ||
    get(() => parsedData.data.columns?.id) ||
    get(() => parsedData.data?.http?.response?.status_code) ||
    get(() => parsedData.data?.http?.response?.status) ||
    metadata.httpStatusCode ||
    metadata.data_id ||
    alert.data_id ||
    alert.dataId ||
    metadata.dataId ||
    metadata.response_code ||
    metadata.status_code ||
    get(() => metadata.raw_es?.http_status_code) ||
    get(() => metadata.raw_es?.status_code) ||
    ''

  let referer =
    get(() => parsedData.data?.request?.headers?.referer) ||
    get(() => parsedData.data?.http?.request?.headers?.referer) ||
    metadata.referer ||
    metadata.http_referer ||
    metadata.domain ||
    ''

  if (!referer) {
    const fullLog = parsedData.full_log || metadata.fullLog || metadata.message || alert.description || ''
    if (typeof fullLog === 'string') {
      const match = fullLog.match(/https?:\/\/([^/"\s]+)/i)
      if (match && match[1]) referer = match[1]
    }
  }

  return { srcIp, dstIp, responseCode, referer }
}

function extractWazuhFileHashes(alert: any) {
  const metadata = alert.metadata || {}
  let parsedData: any = {}
  if (metadata.message && typeof metadata.message === 'string') {
    try { parsedData = JSON.parse(metadata.message) } catch {}
  }
  const rawHashes =
    parsedData.data?.win?.eventdata?.hashes ||
    parsedData.data?.win?.eventdata?.hash ||
    metadata.data_win_eventdata_hashes ||
    metadata.hashes ||
    metadata.hash_sha256 ||
    metadata.sacti_search ||
    alert.data_win_eventdata_hashes ||
    alert.hash_sha256 ||
    alert.sacti_search ||
    ''

  const imageField =
    parsedData.data?.win?.eventdata?.image ||
    parsedData.data?.win?.eventdata?.imageLoaded ||
    metadata.data_win_eventdata_image ||
    metadata.data_win_eventdata_imageLoaded ||
    alert.data_win_eventdata_image ||
    alert.data_win_eventdata_imageLoaded ||
    ''

  const out: any = { md5: '', sha1: '', sha256: '', raw: rawHashes, image: imageField }
  if (rawHashes && typeof rawHashes === 'string') {
    const parts = rawHashes.split(/[,;|\s]+/)
    for (const part of parts) {
      const mSha256 = part.match(/SHA256=([A-Fa-f0-9]{64})/)
      const mSha1 = part.match(/SHA1=([A-Fa-f0-9]{40})/)
      const mMd5 = part.match(/MD5=([A-Fa-f0-9]{32})/)
      if (mSha256) out.sha256 = out.sha256 || mSha256[1]
      if (mSha1) out.sha1 = out.sha1 || mSha1[1]
      if (mMd5) out.md5 = out.md5 || mMd5[1]

      const hex = part.replace(/[^A-Fa-f0-9]/g, '')
      if (!out.sha256 && hex.length === 64) out.sha256 = hex
      if (!out.sha1 && hex.length === 40) out.sha1 = hex
      if (!out.md5 && hex.length === 32) out.md5 = hex
    }
  }
  if (!out.sha256) out.sha256 = metadata.hash_sha256 || metadata.sha256 || alert.hash_sha256 || alert.sha256 || out.sha256
  if (!out.sha1) out.sha1 = metadata.sha1 || metadata.hash_sha1 || alert.hash_sha1 || alert.sha1 || out.sha1
  if (!out.md5) out.md5 = metadata.md5 || metadata.hash_md5 || alert.hash_md5 || alert.md5 || out.md5
  return out
}

function formatMTTD(alert: any) {
  try {
    if (alert.status === 'New') return ''
    const md = alert.metadata || {}
    const stellarMttdMs = md.user_action_alert_to_first || (md.user_action && md.user_action.alert_to_first)
    if (stellarMttdMs !== null && stellarMttdMs !== undefined) {
      const mttdMinutes = Math.round(stellarMttdMs / (60 * 1000))
      if (mttdMinutes < 1) {
        const mttdSeconds = Math.round(stellarMttdMs / 1000)
        return mttdSeconds >= 0 ? `${mttdSeconds}s` : ''
      }
      if (mttdMinutes < 60) return `${mttdMinutes}m`
      const mttdHours = Math.floor(mttdMinutes / 60)
      if (mttdHours < 24) return `${mttdHours}h`
      const mttdDays = Math.floor(mttdHours / 24)
      return `${mttdDays}d`
    }
    const eventTime = new Date(alert.timestamp || alert.created_at)
    const actionTime = new Date(alert.updatedAt || alert.updated_at)
    if (!eventTime.getTime() || !actionTime.getTime()) return ''
    const diffMs = actionTime.getTime() - eventTime.getTime()
    if (diffMs < 0) return ''
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return '<1m'
    if (diffMins < 60) return `${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d`
  } catch {
    return ''
  }
}

const COLUMN_LABELS: Record<string,string> = {
  timestamp: 'Timestamp',
  title: 'Alert Name',
  srcip: 'Source IP',
  dstip: 'Destination IP',
  responseCode: 'Response Code',
  response_code: 'Response Code',
  integration: 'Integration',
  severity: 'Severity',
  status: 'Status',
  id: 'ID',
  alertId: 'ID',
  urlPayload: 'URL Payload',
  domainReferer: 'Domain (Referer)',
  mttd: 'MTTD',
  sourcePort: 'Source Port',
  destinationPort: 'Destination Port',
  protocol: 'Protocol',
  imageLoaded: 'Image / Loaded',
  md5: 'MD5',
  sha1: 'SHA1',
  sha256: 'SHA256',
  processCmdLine: 'Command Line',
  agentName: 'Agent Name',
  agentIp: 'Agent IP',
  rule: 'Rule',
  mitreTactic: 'MITRE Tactic',
  mitreId: 'MITRE ID',
  tags: 'Tags',
}

function formatValueForColumn(alert: any, columnId: string) {
  const meta = alert.metadata || {}
  try {
    switch (columnId) {
      case 'timestamp': return (alert.timestamp || alert.created_at || meta.timestamp || meta.raw_es?.timestamp || '')
      case 'title':
        return alert.title || meta.rule?.description || meta.ruleDescription || alert.description || ''
      case 'srcip': return extractWazuhNetworkFields(alert).srcIp || ''
      case 'dstip': return extractWazuhNetworkFields(alert).dstIp || ''
      case 'responseCode':
      case 'response_code': {
        const net = extractWazuhNetworkFields(alert)
        const cand = net?.responseCode
        if (cand && looksLikeHttpStatus(cand)) return String(cand)
        // try metadata fallbacks
        const meta = alert.metadata || {}
        const fallback = (
          meta.httpStatusCode ||
          meta.http_status_code ||
          meta.status_code ||
          meta.response_code ||
          meta.responseCode ||
          meta.raw_es?.http_status_code ||
          meta.raw_es?.status_code ||
          meta.raw_es?.response_code ||
          meta.raw_es?.http?.response?.status_code ||
          meta.raw_es?.data_http_status ||
          meta.raw_es?.data_status ||
          (typeof meta.status === 'number' ? meta.status : undefined)
        )
        return looksLikeHttpStatus(fallback) ? String(fallback) : ''
      }
      case 'urlPayload':
        return (
          meta.url || meta.url_payload || meta.raw_es?.url || meta.raw_es?.url_payload || extractWazuhNetworkFields(alert).referer || ''
        )
      case 'domainReferer': return extractWazuhNetworkFields(alert).referer || ''
      case 'integration': return alert.integrationName || alert.integration?.name || ''
      case 'mttd': return formatMTTD(alert)
      case 'severity': return alert.severity || ''
      case 'status': return alert.status || ''
      case 'sourcePort': return meta.srcPort || meta.srcport || meta.src_port || meta.source_port || alert.srcPort || ''
      case 'destinationPort': return meta.dstPort || meta.dstport || meta.dst_port || meta.destination_port || alert.dstPort || ''
      case 'protocol': return meta.protocol || meta.http_method || alert.protocol || ''
      case 'imageLoaded': return extractWazuhFileHashes(alert).image || ''
      case 'md5': return extractWazuhFileHashes(alert).md5 || extractWazuhFileHashes(alert).raw || ''
      case 'sha1': return extractWazuhFileHashes(alert).sha1 || extractWazuhFileHashes(alert).raw || ''
      case 'sha256': return extractWazuhFileHashes(alert).sha256 || extractWazuhFileHashes(alert).raw || ''
      case 'processCmdLine':
        return (
          meta.data_columns_cmdline || meta.process_cmd_line || meta.process_cmdline || alert.process_cmd_line || ''
        )
      case 'agentName': return meta.agent?.name || meta.agentName || meta.agent_name || alert.agent?.name || ''
      case 'agentIp': return meta.agent?.ip || meta.agentIp || meta.agent_ip || alert.agent?.ip || ''
      case 'rule': {
        const ruleVal = meta.rule || meta.ruleDescription || meta.rule_description || alert.rule || ''
        const parsed = tryParseJSON(ruleVal)
        if (parsed && typeof parsed === 'object') return parsed.description || JSON.stringify(parsed)
        return String(parsed || '')
      }
      case 'mitreTactic': return meta.rule?.mitre?.tactic?.[0] || meta.mitreTactic || ''
      case 'mitreId': return meta.rule?.mitre?.id?.[0] || meta.mitreId || ''
      case 'tags': return (meta.tags || alert.tags || []).join(', ')
      case 'id':
      case 'alertId': return alert.id || ''
      default:
        return meta[columnId] ?? ''
    }
  } catch (e) {
    return ''
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const sp = url.searchParams

    const integrationId = sp.get('integrationId')
    const timeRange = sp.get('time_range') || '7d'
    const fromDate = sp.get('from_date')
    const toDate = sp.get('to_date')
    const status = sp.get('status')
    const severity = sp.get('severity')
    const search = sp.get('search') || ''
    const columnsParam = sp.get('columns') || ''
    const columns = columnsParam ? columnsParam.split(',').map(c => c.trim()).filter(Boolean) : ['timestamp','title','integration','severity','status','responseCode']

    // Build time range
    const now = new Date()
    let startDate: Date
    let endDate: Date = now

    if (fromDate && toDate) {
      if (fromDate.includes('T') || toDate.includes('T')) {
        startDate = new Date(fromDate)
        endDate = new Date(toDate)
      } else {
        // fallback: treat as local YYYY-MM-DD (UTC+7 logic copied from existing route)
        const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
        const fromUTC = new Date(fromDate + 'T00:00:00Z')
        const toUTC = new Date(toDate + 'T00:00:00Z')
        startDate = new Date(fromUTC.getTime() - UTC_PLUS_7_OFFSET_MS)
        const nextDayUTC = new Date(toUTC.getTime() + 24 * 60 * 60 * 1000)
        endDate = new Date(nextDayUTC.getTime() - UTC_PLUS_7_OFFSET_MS - 1)
      }
    } else {
      // relative
      switch (timeRange) {
        case '1h': startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); break
        case '2h': startDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); break
        case '3h': startDate = new Date(now.getTime() - 3 * 60 * 60 * 1000); break
        case '6h': startDate = new Date(now.getTime() - 6 * 60 * 60 * 1000); break
        case '12h': startDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); break
        case '24h':
        case '1d': startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break
        case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
        default: startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      }
    }

    // Build where clause consistent with app/api/alerts/route.ts
    const whereClause: any = {
      timestamp: {
        gte: startDate,
        lte: endDate,
      }
    }

    if (integrationId && integrationId !== 'all') whereClause.integrationId = integrationId
    if (status && status !== 'all') whereClause.status = status
    if (severity && severity !== 'all') whereClause.severity = severity
    if (search && search.trim() !== '') {
      const s = search.toLowerCase().trim()
      whereClause.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { id: { contains: s, mode: 'insensitive' } },
      ]
    }

    // If client provided exact alert IDs (from client-side filtered list), prefer that
    const alertIdsParam = sp.get('alertIds')
    let alerts
    if (alertIdsParam) {
      const ids = alertIdsParam.split(',').map(s => s.trim()).filter(Boolean)
      alerts = await prisma.alert.findMany({
        where: { id: { in: ids } },
        include: { integration: { select: { id: true, name: true, source: true } } },
        orderBy: { timestamp: 'desc' },
        take: 10000,
      })
    } else {
      alerts = await prisma.alert.findMany({
        where: whereClause,
        include: { integration: { select: { id: true, name: true, source: true } } },
        orderBy: { timestamp: 'desc' },
        take: 10000,
      })
    }

    // Build workbook
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Alerts')

    // Header row (use friendly labels when available)
    const headerLabels = columns.map((c) => COLUMN_LABELS[c] || c)
    ws.addRow(headerLabels)

    for (const a of alerts) {
      const row = columns.map((col) => formatValueForColumn(a, col))
      ws.addRow(row)
    }

    const buffer = await wb.xlsx.writeBuffer()

    return new Response(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="alerts.xlsx"'
      }
    })
  } catch (err) {
    console.error('Export error', err)
    return new Response(JSON.stringify({ success: false, error: 'Export failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
