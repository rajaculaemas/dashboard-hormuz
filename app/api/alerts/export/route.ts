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
    
    // Try Stellar Cyber first
    let mttdMs = md.user_action_alert_to_first || (md.user_action && md.user_action.alert_to_first)
    
    // Try Socfortress/Copilot
    if (!mttdMs) {
      mttdMs = md.socfortress_alert_to_first
    }
    
    if (mttdMs !== null && mttdMs !== undefined) {
      const mttdMinutes = Math.round(mttdMs / (60 * 1000))
      if (mttdMinutes < 1) {
        const mttdSeconds = Math.round(mttdMs / 1000)
        return mttdSeconds >= 0 ? `${mttdSeconds}s` : ''
      }
      if (mttdMinutes < 60) return `${mttdMinutes}m`
      const mttdHours = Math.floor(mttdMinutes / 60)
      if (mttdHours < 24) return `${mttdHours}h`
      const mttdDays = Math.floor(mttdHours / 24)
      return `${mttdDays}d`
    }
    
    // Fallback to timestamp - updatedAt if no calculated MTTD
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

// Helper: format epoch milliseconds to a human-readable UTC+7 date string
function formatEpochMs(epochMs: any): string {
  if (!epochMs) return ''
  const ms = typeof epochMs === 'number' ? epochMs : Number(epochMs)
  if (isNaN(ms) || ms <= 0) return ''
  try {
    const date = new Date(ms)
    return date.toLocaleString('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ''
  }
}

// Helper: return a Date object shifted +7 hours so Excel serial number displays UTC+7
// Excel has no timezone concept - the serial number is displayed as-is
function toUtc7ExcelDate(ts: any): Date | null {
  if (!ts) return null
  let ms: number
  if (ts instanceof Date) {
    ms = ts.getTime()
  } else if (typeof ts === 'number') {
    ms = ts > 1_000_000_000_000 ? ts : ts * 1000
  } else if (typeof ts === 'string') {
    ms = new Date(ts).getTime()
    if (isNaN(ms)) return null
  } else {
    return null
  }
  if (ms <= 0) return null
  // Shift +7 hours so Excel displays UTC+7
  return new Date(ms + 7 * 60 * 60 * 1000)
}

const COLUMN_LABELS: Record<string,string> = {
  timestamp: 'Timestamp',
  title: 'Alert Name',
  srcip: 'Source IP',
  dstip: 'Destination IP',
  publicRemoteIp: 'Public Remote IP',
  assignedLocalIp: 'Assigned Local IP',
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
  assignee: 'Assignee',
  // QRadar-specific columns
  qradarOffenseId: 'Offense ID',
  qradarOffenseSource: 'Offense Source',
  qradarCloseTime: 'Closed Time',
  qradarSourceUsername: 'Source Username',
  qradarApp: 'App',
  qradarDestHost: 'Destination Host',
  qradarSrcCountry: 'Source Country',
  qradarDstCountry: 'Destination Country',
  qradarNotes: 'Comment/Notes',
}

function formatValueForColumn(alert: any, columnId: string) {
  const meta = alert.metadata || {}
  try {
    switch (columnId) {
      case 'timestamp':
      case 'alert_time': {
        const ts = alert.alert_time || alert.timestamp || alert.created_at || meta.alert_time || meta.timestamp || meta.raw_es?.timestamp
        return toUtc7ExcelDate(ts) ?? ''
      }
      case 'title':
        return alert.title || meta.rule?.description || meta.ruleDescription || alert.description || ''
      case 'srcip': {
        // QRadar: try sourceip field first, then fallback to Wazuh extraction
        const qSrc = meta.qradar?.sourceip || meta.qradar?.sourceIp
        if (qSrc) return String(qSrc)
        return extractWazuhNetworkFields(alert).srcIp || ''
      }
      case 'dstip': {
        // QRadar: try destinationip field, then fallback to Wazuh extraction
        const qDst = meta.qradar?.destinationip || meta.qradar?.destinationIp
        if (qDst) return String(qDst)
        return extractWazuhNetworkFields(alert).dstIp || ''
      }
      case 'publicRemoteIp':
        // QRadar-specific field
        return meta.qradar?.public_remote_ip || meta.qradar?.publicRemoteIp || ''
      case 'assignedLocalIp':
        // QRadar-specific field
        return meta.qradar?.assigned_local_ip || meta.qradar?.assignedLocalIp || ''
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
      case 'destinationPort': return meta.dstPort || meta.dstport || meta.dst_port || meta.destination_port || meta.qradar?.destination_port || alert.dstPort || ''
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
      case 'assignee':
        return meta.assignee || meta.qradar?.assigned_to || meta.assigned_to || ''
      case 'id':
      case 'alertId': return alert.id || ''
      // QRadar-specific columns
      case 'qradarOffenseId': {
        // metadata.qradar.id is the numeric offense ID
        const qId = meta.qradar?.id
        if (qId !== undefined && qId !== null) return String(qId)
        // fallback: parse from externalId format "qradar-{integId}-{offenseId}"
        const extId = alert.externalId || ''
        const m = extId.match(/qradar-[^-]+-(.+)$/)
        return m ? m[1] : ''
      }
      case 'qradarOffenseSource':
        return meta.qradar?.offense_source || meta.offense_source || ''
      case 'qradarCloseTime': {
        const ct = meta.qradar?.close_time
        return ct ? (toUtc7ExcelDate(ct) ?? '') : ''
      }
      case 'qradarSourceUsername':
        return meta.username || meta.qradar?.assigned_to || ''
      case 'qradarApp': {
        // Use log_sources type_name joined, fallback to categories
        const logSources = meta.qradar?.log_sources
        if (Array.isArray(logSources) && logSources.length > 0) {
          const names = logSources.map((ls: any) => ls.type_name || ls.name).filter(Boolean)
          if (names.length > 0) return names.join(', ')
        }
        const cats = meta.qradar?.categories
        if (Array.isArray(cats) && cats.length > 0) return cats.join(', ')
        return ''
      }
      case 'qradarDestHost': {
        const dstNets = meta.qradar?.destination_networks
        if (Array.isArray(dstNets) && dstNets.length > 0) return dstNets.join(', ')
        return ''
      }
      case 'qradarSrcCountry':
        return meta.qradar?.source_network || ''
      case 'qradarDstCountry': {
        const dstNets = meta.qradar?.destination_networks
        if (Array.isArray(dstNets) && dstNets.length > 0) return dstNets.join(', ')
        return ''
      }
      case 'qradarNotes': {
        // Helper: non-null and non-empty
        const nn = (v: any) => (v && (!Array.isArray(v) || v.length > 0)) ? v : null
        const notesData =
          nn(meta.comment) ||
          nn(meta.qradar?.notes) ||
          nn(meta.notes) ||
          nn(meta.comments) ||
          nn(alert.notes) ||
          null
        if (!notesData) return ''
        const formatNote = (note: any): string => {
          if (!note || typeof note !== 'object') return String(note || '')
          const text = note.note_text || note.comment || ''
          const user = note.username || note.comment_user || ''
          return user ? `${text} (by ${user})` : text
        }
        if (Array.isArray(notesData)) {
          if (notesData.length === 0) return ''
          const latest = notesData[notesData.length - 1]
          return typeof latest === 'object' ? formatNote(latest) : String(latest)
        }
        if (typeof notesData === 'object') return formatNote(notesData)
        return String(notesData)
      }
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
    const integrationIds = sp.get('integrationIds') // comma-separated
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

    // Handle multiple integration IDs (comma-separated)
    if (integrationIds && integrationIds !== 'all') {
      const requestedIds = integrationIds.split(',').map((id: string) => id.trim())
      whereClause.integrationId = { in: requestedIds }
    } else if (integrationId && integrationId !== 'all') {
      // Backward compatibility: single integration ID
      whereClause.integrationId = integrationId
    }
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

    // Batch-merge notes from qradar_offenses for QRadar alerts with empty/missing notes cache
    if (columns.includes('qradarNotes')) {
      const qradarAlerts = alerts.filter((a: any) => a.integration?.source === 'qradar')
      const needsNotes = qradarAlerts.filter((a: any) => {
        const meta = (a.metadata as any) || {}
        const notes = meta.qradar?.notes
        // Needs merge if notes are missing or empty array
        return !notes || (Array.isArray(notes) && notes.length === 0)
      })
      if (needsNotes.length > 0) {
        const offenseIds = needsNotes
          .map((a: any) => {
            const id = (a.metadata as any)?.qradar?.id
            return id != null ? parseInt(String(id), 10) : null
          })
          .filter((id: number | null): id is number => id !== null)
        if (offenseIds.length > 0) {
          const offenses = await prisma.qRadarOffense.findMany({
            where: { externalId: { in: offenseIds } },
            select: { externalId: true, integrationId: true, metadata: true },
          })
          const offenseMap = new Map<string, any[]>()
          for (const off of offenses) {
            const notes = (off.metadata as any)?.notes
            if (Array.isArray(notes) && notes.length > 0) {
              offenseMap.set(`${off.externalId}-${off.integrationId}`, notes)
            }
          }
          for (const a of needsNotes) {
            const offenseId = (a.metadata as any)?.qradar?.id
            const key = `${offenseId}-${a.integrationId}`
            const notes = offenseMap.get(key)
            if (notes) {
              const m = (a.metadata as any) || {}
              m.qradar = m.qradar || {}
              m.qradar.notes = notes
              ;(a as any).metadata = m
            }
          }
        }
      }
    }

    // Batch-merge IPs from related events for QRadar alerts missing IPs
    if (columns.includes('srcip') || columns.includes('dstip') || columns.includes('publicRemoteIp') || columns.includes('assignedLocalIp')) {
      const qradarAlerts = alerts.filter((a: any) => a.integration?.source === 'qradar')
      const needsIps = qradarAlerts.filter((a: any) => {
        const meta = (a.metadata as any) || {}
        const hasSourceIp = meta.qradar?.sourceip || meta.sourceip
        const hasDestIp = meta.qradar?.destinationip || meta.destinationip
        const hasPublicRemoteIp = meta.qradar?.public_remote_ip
        const hasAssignedLocalIp = meta.qradar?.assigned_local_ip
        return !hasSourceIp || !hasDestIp || !hasPublicRemoteIp || !hasAssignedLocalIp
      })
      if (needsIps.length > 0) {
        const offenseIds = needsIps
          .map((a: any) => {
            const id = (a.metadata as any)?.qradar?.id
            return id != null ? parseInt(String(id), 10) : null
          })
          .filter((id: number | null): id is number => id !== null)
        if (offenseIds.length > 0) {
          const events = await prisma.qRadarEvent.findMany({
            where: { offenseId: { in: offenseIds } },
            select: { offenseId: true, sourceIp: true, destinationIp: true, metadata: true },
            distinct: ['offenseId'],
            orderBy: { eventTimestamp: 'desc' },
          })
          const eventMap = new Map<number, any>()
          for (const evt of events) {
            if (!eventMap.has(evt.offenseId)) {
              eventMap.set(evt.offenseId, evt)
            }
          }
          for (const a of needsIps) {
            const offenseId = (a.metadata as any)?.qradar?.id
            const event = eventMap.get(offenseId)
            if (event) {
              const m = (a.metadata as any) || {}
              m.qradar = m.qradar || {}
              if (event.sourceIp && !m.qradar.sourceip) m.qradar.sourceip = event.sourceIp
              if (event.destinationIp && !m.qradar.destinationip) m.qradar.destinationip = event.destinationIp
              // Also merge public_remote_ip and assigned_local_ip if available
              const eventMeta = (event.metadata as any) || {}
              if (!m.qradar.public_remote_ip && eventMeta.public_remote_ip) {
                m.qradar.public_remote_ip = eventMeta.public_remote_ip
              }
              if (!m.qradar.assigned_local_ip && eventMeta.assigned_local_ip) {
                m.qradar.assigned_local_ip = eventMeta.assigned_local_ip
              }
              ;(a as any).metadata = m
            }
          }
        }
      }
    }

    // Build workbook
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Alerts')

    // Header row (use friendly labels when available)
    const headerLabels = columns.map((c) => COLUMN_LABELS[c] || c)
    ws.addRow(headerLabels)

    const DATE_COLS = new Set(['timestamp', 'alert_time', 'qradarCloseTime'])
    for (const a of alerts) {
      const rowValues = columns.map((col) => formatValueForColumn(a, col))
      const excelRow = ws.addRow(rowValues)
      // Apply date number format to date columns so Excel shows them as dates (not General)
      columns.forEach((col, idx) => {
        if (DATE_COLS.has(col)) {
          const cell = excelRow.getCell(idx + 1)
          if (cell.value instanceof Date) {
            cell.numFmt = 'dd/mm/yyyy hh:mm:ss'
          }
        }
      })
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
