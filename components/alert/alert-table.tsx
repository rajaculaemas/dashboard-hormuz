"use client"

import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EyeIcon, PencilIcon, Trash2 } from "lucide-react"
// Util untuk parsing url payload dari alert (mirip logic di WazuhAlertDetailDialog)
function extractWazuhUrlPayload(alert: any): string {
  const metadata = alert.metadata || {}
  let parsedData: any = {}
  if (metadata.message && typeof metadata.message === "string") {
    try {
      parsedData = JSON.parse(metadata.message)
    } catch {}
  } else if (alert && typeof alert.message === 'string') {
    try {
      parsedData = JSON.parse(alert.message)
    } catch {}
  }
  const urlRaw = metadata.url || parsedData.data?.url || ""
  const url = typeof urlRaw === "object" && urlRaw?.full ? urlRaw.full : (typeof urlRaw === "string" ? urlRaw : "")
  return url || "-"
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
// Normalize various response-code-like values to a canonical 3-digit string (e.g. 403)
function normalizeHttpStatus(v: any): string | null {
  if (v === undefined || v === null) return null
  try {
    const s = String(v)
    const m = s.match(/(\d{3})/) // first 3-digit group
    if (m && m[1]) {
      const n = parseInt(m[1], 10)
      if (n >= 100 && n <= 599) return String(n)
    }
  } catch {}
  return null
}
// Extract common network fields (src/dst IP, response code, referer/domain) from Wazuh alert metadata/message
function extractWazuhNetworkFields(alert: any) {
  const metadata = alert.metadata || {}
  let parsedData: any = {}
  if (metadata.message && typeof metadata.message === "string") {
    try {
      parsedData = JSON.parse(metadata.message)
    } catch {}
  }

  // Helper to safely read nested paths
  const get = (fn: () => any) => {
    try { const v = fn(); return v === undefined ? undefined : v } catch { return undefined }
  }

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
    ""

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
    ""

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
    get(() => metadata.raw_es?.data_id) ||
    get(() => metadata.raw_es?.data?.id) ||
    get(() => metadata.raw_es?.id) ||
    get(() => metadata.raw_es?.http?.response?.status_code) ||
    get(() => metadata.raw_es?.http?.response?.status) ||
    get(() => metadata.raw_es?.http_status_code) ||
    get(() => metadata.raw_es?.status_code) ||
    ""

  // Extract referer/domain from common locations: parsed data headers, metadata.referer, or full log
  let referer =
    get(() => parsedData.data?.request?.headers?.referer) ||
    get(() => parsedData.data?.http?.request?.headers?.referer) ||
    metadata.referer ||
    metadata.http_referer ||
    metadata.domain ||
    ""

  // If referer is empty, try to extract from full log or message
  if (!referer) {
    const fullLog = parsedData.full_log || metadata.fullLog || metadata.message || alert.description || ""
    if (typeof fullLog === "string") {
      const match = fullLog.match(/https?:\/\/([^/"\s]+)/i)
      if (match && match[1]) referer = match[1]
    }
  }

  return { srcIp, dstIp, responseCode, referer }
}
// Extract image/hash details from Wazuh alert metadata/message (mirrors detail dialog logic)
function extractWazuhFileHashes(alert: any) {
  const metadata = alert.metadata || {}
  let parsedData: any = {}
  if (metadata.message && typeof metadata.message === "string") {
    try {
      parsedData = JSON.parse(metadata.message)
    } catch {}
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
    ""

  const imageField =
    parsedData.data?.win?.eventdata?.image ||
    parsedData.data?.win?.eventdata?.imageLoaded ||
    metadata.data_win_eventdata_image ||
    metadata.data_win_eventdata_imageLoaded ||
    alert.data_win_eventdata_image ||
    alert.data_win_eventdata_imageLoaded ||
    ""

  const out: any = { md5: "", sha1: "", sha256: "", raw: rawHashes, image: imageField }

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

  // fallback to metadata-specific fields
  if (!out.sha256) out.sha256 = metadata.hash_sha256 || metadata.sha256 || alert.hash_sha256 || alert.sha256 || out.sha256
  if (!out.sha1) out.sha1 = metadata.sha1 || metadata.hash_sha1 || alert.hash_sha1 || alert.sha1 || out.sha1
  if (!out.md5) out.md5 = metadata.md5 || metadata.hash_md5 || alert.hash_md5 || alert.md5 || out.md5

  return out
}
import { Checkbox } from "@/components/ui/checkbox"
import { Bell } from "lucide-react"
import { SafeDate } from "@/components/ui/safe-date"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { AlertColumn } from "@/components/alert/alert-column-selector"
import { AlertContextMenu, ActiveFilters } from "@/components/alert/alert-context-menu"

export interface AlertFilter {
  id: string
  column: string
  value: string
  type: "include" | "exclude"
}

interface AlertTableProps {
  alerts: any[]
  loading: boolean
  selectedAlerts: string[]
  availableIntegrations: any[]
  canUpdateAlert: boolean
  columns: AlertColumn[]
  filters: AlertFilter[]
  onSelectAlert: (checked: boolean, alertId: string) => void
  onViewDetails: (alert: any) => void
  onUpdateStatus: (alert: any) => void
  onAddFilter: (filter: AlertFilter) => void
  onRemoveFilter: (id: string) => void
  onClearFilters: () => void
  onDeleteAlert?: (alertId: string) => void
  // Optional: sorting state and handler (parent may manage sort & apply to data)
  sortBy?: string | null
  sortDir?: "asc" | "desc" | null
  onSortChange?: (columnId: string) => void
  // Optional: ids of all currently visible alerts (across pagination) to support select-all
  allVisibleAlertIds?: string[]
}

export function AlertTable({
  alerts,
  loading,
  selectedAlerts,
  availableIntegrations,
  canUpdateAlert,
  columns,
  filters,
  onSelectAlert,
  onViewDetails,
  onUpdateStatus,
  onAddFilter,
  onRemoveFilter,
  onClearFilters,
  sortBy,
  sortDir,
  onSortChange,
  allVisibleAlertIds,
  onDeleteAlert,
}: AlertTableProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    columnId: string
    value: string
  } | null>(null)

  // Column resize state: map columnId -> width in px
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)

  // Debug: Log alert structure on first render or when alerts change
  useEffect(() => {
    if (alerts.length > 0) {
      console.log('[AlertTable] First alert structure:', {
        id: alerts[0].id,
        title: alerts[0].title,
        metadata: alerts[0].metadata,
        topLevelFields: Object.keys(alerts[0]).filter(k => !['metadata', 'integration', 'id', 'title', 'description'].includes(k)),
      })
    }
  }, [alerts])

  // Global debug listener: log any contextmenu events and the nearest table cell data attributes
  useEffect(() => {
    const onGlobalContext = (ev: MouseEvent) => {
      try {
        const target = ev.target as HTMLElement | null
        const cell = target?.closest?.('[data-colid]') as HTMLElement | null
        console.log('[AlertTable][global] contextmenu', {
          targetTag: target?.tagName,
          targetClass: target?.className,
          nearestCellCol: cell?.getAttribute('data-colid') || null,
          nearestCellAlert: cell?.getAttribute('data-alert-id') || null,
          clientX: ev.clientX,
          clientY: ev.clientY,
        })
      } catch (e) {
        console.log('[AlertTable][global] contextmenu error', e)
      }
    }

    window.addEventListener('contextmenu', onGlobalContext)
    return () => window.removeEventListener('contextmenu', onGlobalContext)
  }, [])

  // Mouse move/up handlers for resizing
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      const dx = ev.clientX - r.startX
      const newW = Math.max(40, r.startWidth + dx)
      setColumnWidths((prev) => ({ ...prev, [r.colId]: newW }))
    }
    const onUp = () => { resizingRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleContextMenu = (e: React.MouseEvent, columnId: string, value: any) => {
    e.preventDefault()
    console.log('[AlertTable] handleContextMenu invoked', { columnId, value })

    // Convert value to string, skip if empty or special character
    const strValue = String(value || "")
    if (!strValue || strValue === "-" || strValue.trim() === "") {
      console.log('[AlertTable] context menu skip: empty value')
      return
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      columnId,
      value: strValue,
    })
  }

  const handleIncludeFilter = (column: string, value: string) => {
    onAddFilter({
      id: `${column}-include-${Date.now()}`,
      column,
      value,
      type: "include",
    })
  }

  const handleExcludeFilter = (column: string, value: string) => {
    onAddFilter({
      id: `${column}-exclude-${Date.now()}`,
      column,
      value,
      type: "exclude",
    })
  }

  const severityColor = (severity: string | null | undefined) => {
    switch (severity) {
      case "Critical":
        return "bg-red-500/10 text-red-500"
      case "High":
        return "bg-orange-500/10 text-orange-500"
      case "Medium":
        return "bg-yellow-500/10 text-yellow-500"
      case "Low":
        return "bg-blue-500/10 text-blue-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "New":
        return "bg-red-500/10 text-red-500"
      case "In Progress":
        return "bg-yellow-500/10 text-yellow-500"
      case "Ignored":
        return "bg-gray-500/10 text-gray-500"
      case "Closed":
        return "bg-green-500/10 text-green-500"
      default:
        return "bg-blue-500/10 text-blue-500"
    }
  }

  const getIntegrationName = (alert: any) => {
    const integration = availableIntegrations.find((i) =>
      i.id === alert.integrationId || i.id === alert.integration_id || i.id === alert.integration?.id,
    )
    return integration?.name || "Unknown"
  }

  const calculateMTTD = (alert: any) => {
    try {
      // Don't show MTTD for "New" status (not yet assigned/updated)
      if (alert.status === "New") return "-"

      // Stellar Cyber: uses pre-calculated user_action_alert_to_first (in milliseconds)
      const stellarMttdMs = alert.metadata?.user_action_alert_to_first || alert.metadata?.user_action?.alert_to_first
      if (stellarMttdMs !== null && stellarMttdMs !== undefined) {
        const mttdMinutes = Math.round(stellarMttdMs / (60 * 1000))
        if (mttdMinutes < 1) {
          const mttdSeconds = Math.round(stellarMttdMs / 1000)
          return mttdSeconds >= 0 ? `${mttdSeconds}s` : "-"
        }
        if (mttdMinutes < 60) return `${mttdMinutes}m`
        const mttdHours = Math.floor(mttdMinutes / 60)
        if (mttdHours < 24) return `${mttdHours}h`
        const mttdDays = Math.floor(mttdHours / 24)
        return `${mttdDays}d`
      }

      // Wazuh & QRadar: calculate from alert timestamp to updatedAt (first action)
      const eventTime = new Date(alert.timestamp || alert.created_at)
      const actionTime = new Date(alert.updatedAt || alert.updated_at)

      if (!eventTime.getTime() || !actionTime.getTime()) return "-"

      const diffMs = actionTime.getTime() - eventTime.getTime()
      if (diffMs < 0) return "-"
      
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return "< 1m"
      if (diffMins < 60) return `${diffMins}m`

      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h`

      const diffDays = Math.floor(diffHours / 24)
      return `${diffDays}d`
    } catch {
      return "-"
    }
  }

  const getColumnValue = (alert: any, columnId: string) => {
    switch (columnId) {
      case "timestamp":
        return <SafeDate date={alert.timestamp || alert.created_at} />

      case "title":
        return alert.title || alert.metadata?.rule?.description || alert.metadata?.ruleDescription || alert.description || "Unknown"

      case "srcip":
        // Prefer parsed/normalized Wazuh fields (including message payload)
        const net1 = extractWazuhNetworkFields(alert)
        return (
          net1.srcIp ||
          alert.metadata?.srcIp ||
          alert.metadata?.srcip ||
          alert.metadata?.source_ip ||
          alert.metadata?.src_ip ||
          alert.metadata?.sourceAddress ||
          alert.srcIp ||
          alert.srcip ||
          "-"
        )

      case "dstip":
        const net2 = extractWazuhNetworkFields(alert)
        return (
          net2.dstIp ||
          alert.metadata?.dstIp ||
          alert.metadata?.dstip ||
          alert.metadata?.destination_ip ||
          alert.metadata?.dst_ip ||
          alert.metadata?.destinationAddress ||
          alert.dstIp ||
          alert.dstip ||
          "-"
        )

      case "responseCode":
        const net3 = extractWazuhNetworkFields(alert)
        {
          const candidate = (
            net3.responseCode ||
            alert.metadata?.httpStatusCode ||
            alert.metadata?.http_status_code ||
            alert.metadata?.status_code ||
            alert.metadata?.response_code ||
            alert.metadata?.responseCode ||
            alert.metadata?.raw_es?.http_status_code ||
            alert.metadata?.raw_es?.status_code ||
            alert.metadata?.raw_es?.response_code ||
            alert.metadata?.raw_es?.http?.response?.status_code ||
            alert.metadata?.raw_es?.data_http_status ||
            alert.metadata?.raw_es?.data_status ||
            (typeof alert.metadata?.status === 'number' ? alert.metadata?.status : undefined)
          )
          const norm = normalizeHttpStatus(candidate)
          return norm ? norm : "-"
        }

      case "urlPayload":
        // Ambil url payload hasil parsing manual (mirip detail dialog)
        return extractWazuhUrlPayload(alert)

      case "urlPayload":
        // Wazuh: metadata.url atau metadata.url_payload
        return (
          alert.metadata?.url ||
          alert.metadata?.url_payload ||
          alert.metadata?.raw_es?.url ||
          alert.metadata?.raw_es?.url_payload ||
          "-"
        )

      case "integration":
        return getIntegrationName(alert)

      case "domainReferer":
        const net4 = extractWazuhNetworkFields(alert)
        return net4.referer || (
          alert.metadata?.referer ||
          alert.metadata?.http_referer ||
          alert.metadata?.domain ||
          "-"
        )

      case "mttd":
        return calculateMTTD(alert)

      case "severity":
        return (
          <Badge variant="outline" className={severityColor(alert.severity)}>
            {alert.severity || "-"}
          </Badge>
        )

      case "status":
        return (
          <Badge variant="outline" className={statusColor(alert.status)}>
            {alert.status || "-"}
          </Badge>
        )

      case "sourcePort":
        // Wazuh stores as metadata.srcPort (camelCase)
        return (
          alert.metadata?.srcPort ||  // Wazuh primary
          alert.metadata?.srcport ||
          alert.metadata?.src_port ||
          alert.metadata?.source_port ||
          alert.srcPort ||
          "-"
        )

      case "destinationPort":
        // Wazuh stores as metadata.dstPort (camelCase)
        return (
          alert.metadata?.dstPort ||  // Wazuh primary
          alert.metadata?.dstport ||
          alert.metadata?.dst_port ||
          alert.metadata?.destination_port ||
          alert.dstPort ||
          "-"
        )

      case "protocol":
        // Wazuh stores as metadata.protocol
        return (
          alert.metadata?.protocol ||
          alert.metadata?.http_method ||
          alert.protocol ||
          "-"
        )

      case "processCmdLine": {
        const meta = alert.metadata || {}
        const v =
          // prefer normalized metadata fields
          meta.data_columns_cmdline ||
          meta.process_cmd_line ||
          meta.process_cmdline ||
          // allow top-level alert fields
          alert.process_cmd_line ||
          alert.process_cmdline ||
          // raw ES nested shapes
          meta.raw_es?.data?.columns?.cmdline ||
          meta.raw_es?.process_cmd_line ||
          meta.raw_es?.process_cmdline ||
          null

        return v ? <p className="text-sm break-all font-mono">{String(v)}</p> : "-"
      }

      case "imageLoaded": {
        const hashes = extractWazuhFileHashes(alert)
        const v = hashes.image || null
        return v ? <p className="text-sm break-all font-mono">{String(v)}</p> : "-"
      }

      case "md5": {
        const hashes = extractWazuhFileHashes(alert)
        if (hashes.md5) return <p className="text-sm font-mono">{hashes.md5}</p>
        if (hashes.raw) return <p className="text-sm font-mono">{String(hashes.raw)}</p>
        return "-"
      }

      case "sha1": {
        const hashes = extractWazuhFileHashes(alert)
        if (hashes.sha1) return <p className="text-sm font-mono">{hashes.sha1}</p>
        if (hashes.raw) return <p className="text-sm font-mono">{String(hashes.raw)}</p>
        return "-"
      }

      case "sha256": {
        const hashes = extractWazuhFileHashes(alert)
        if (hashes.sha256) return <p className="text-sm font-mono">{hashes.sha256}</p>
        if (hashes.raw) return <p className="text-sm font-mono">{String(hashes.raw)}</p>
        return "-"
      }

      case "agentName":
        return (
          alert.metadata?.agent?.name ||
          alert.metadata?.agentName ||
          alert.metadata?.agent_name ||
          alert.agent?.name ||
          "-"
        )

      case "agentIp":
        return (
          alert.metadata?.agent?.ip ||
          alert.metadata?.agentIp ||
          alert.metadata?.agent_ip ||
          alert.agent?.ip ||
          "-"
        )

      case "rule":
        return (
          alert.metadata?.rule?.description ||
          alert.metadata?.ruleDescription ||
          alert.metadata?.rule_description ||
          alert.rule?.description ||
          "-"
        )

      case "mitreTactic":
        return (
          alert.metadata?.rule?.mitre?.tactic?.[0] ||
          alert.metadata?.mitreTactic ||
          alert.metadata?.mitre_tactic ||
          alert.rule?.mitre?.tactic?.[0] ||
          "-"
        )

      case "mitreId":
        return (
          alert.metadata?.rule?.mitre?.id?.[0] ||
          alert.metadata?.mitreId ||
          alert.metadata?.mitre_id ||
          alert.rule?.mitre?.id?.[0] ||
          "-"
        )

      case "tags":
        const tags = alert.metadata?.tags || alert.tags || []
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((tag: string, idx: number) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{tags.length - 2}
              </Badge>
            )}
          </div>
        )

      default:
        return "-"
    }
  }

  // Return raw, comparable values for filtering (primitive/string)
  const getRawColumnValue = (alert: any, columnId: string): any => {
    const meta = alert.metadata || {}
    switch (columnId) {
      case "timestamp":
        return alert.timestamp || alert.created_at || meta.timestamp || meta.raw_es?.timestamp || null
      case "title":
      case "alertName":
        return alert.title || meta.rule?.description || meta.ruleDescription || alert.description || null
      case "srcip":
      case "sourceIp":
        return (
          meta.srcIp ||
          meta.srcip ||
          meta.source_ip ||
          meta.src_ip ||
          alert.srcIp ||
          alert.srcip ||
          null
        )
      case "dstip":
      case "destinationIp":
        return (
          meta.dstIp ||
          meta.dstip ||
          meta.destination_ip ||
          meta.dst_ip ||
          alert.dstIp ||
          alert.dstip ||
          null
        )
      case "responseCode":
      case "response_code":
        // Prefer parsed network extraction (from message payload), then fall back to metadata/raw_es
        try {
          const net = extractWazuhNetworkFields(alert)
          if (net && net.responseCode) {
            const n = normalizeHttpStatus(net.responseCode)
            if (n) return n
          }
        } catch (e) {}
        const fallback = (
          meta.httpStatusCode ||
          meta.http_status_code ||
          meta.status_code ||
          meta.response_code ||
          meta.responseCode ||
          meta.data_id ||
          alert.data_id ||
          alert.dataId ||
          meta.raw_es?.http_status_code ||
          meta.raw_es?.status_code ||
          meta.raw_es?.response_code ||
          meta.raw_es?.http?.response?.status_code ||
          meta.raw_es?.data_http_status ||
          meta.raw_es?.data_status ||
          (typeof meta.status === 'number' ? meta.status : null)
        )
        const norm = normalizeHttpStatus(fallback)
        return norm ? norm : null
      case "integration":
        return alert.integrationName || alert.integration?.name || null
      case "domainReferer":
        try {
          const net = extractWazuhNetworkFields(alert)
          if (net && net.referer) return net.referer
        } catch (e) {}
        return meta.referer || meta.http_referer || meta.domain || meta.url || null
      case "severity":
        return alert.severity || null
      case "status":
        return alert.status || null
      case "sourcePort":
        return meta.srcPort || meta.src_port || meta.srcport || alert.srcPort || null
      case "destinationPort":
        return meta.dstPort || meta.dst_port || meta.dstport || alert.dstPort || null
      case "protocol":
        return meta.protocol || meta.http_method || alert.protocol || null
      case "agentName":
        return meta.agent?.name || meta.agentName || meta.agent_name || alert.agent?.name || null
      case "agentIp":
        return meta.agent?.ip || meta.agentIp || meta.agent_ip || alert.agent?.ip || null
      case "rule":
        return meta.rule?.description || meta.ruleDescription || meta.rule_description || alert.rule?.description || null
      case "mitreTactic":
        return meta.rule?.mitre?.tactic?.[0] || meta.mitreTactic || null
      case "mitreId":
        return meta.rule?.mitre?.id?.[0] || meta.mitreId || null
      case "tags":
        return (meta.tags || alert.tags || []).join(", ") || null
      case "imageLoaded":
        return (
          meta.data_win_eventdata_image ||
          meta.data_win_eventdata_imageLoaded ||
          alert.data_win_eventdata_image ||
          alert.data_win_eventdata_imageLoaded ||
          meta.raw_es?.data?.win?.eventdata?.image ||
          meta.raw_es?.data?.win?.eventdata?.imageLoaded ||
          null
        )
      case "md5":
        return (
          meta.md5 ||
          meta.hash_md5 ||
          meta.data_win_eventdata_hashes ||
          meta.raw_es?.data?.win?.eventdata?.hashes ||
          meta.sacti_search ||
          alert.md5 ||
          alert.hash_md5 ||
          alert.data_win_eventdata_hashes ||
          alert.raw_es?.data?.win?.eventdata?.hashes ||
          alert.sacti_search ||
          null
        )
      case "sha1":
        return (
          meta.sha1 ||
          meta.hash_sha1 ||
          meta.data_win_eventdata_hashes ||
          meta.raw_es?.data?.win?.eventdata?.hashes ||
          meta.sacti_search ||
          alert.sha1 ||
          alert.hash_sha1 ||
          alert.data_win_eventdata_hashes ||
          alert.raw_es?.data?.win?.eventdata?.hashes ||
          alert.sacti_search ||
          null
        )
      case "sha256":
        return (
          meta.sha256 ||
          meta.hash_sha256 ||
          meta.hash_sha256 ||
          meta.data_win_eventdata_hashes ||
          meta.raw_es?.data?.win?.eventdata?.hashes ||
          meta.sacti_search ||
          alert.sha256 ||
          alert.hash_sha256 ||
          alert.data_win_eventdata_hashes ||
          alert.raw_es?.data?.win?.eventdata?.hashes ||
          alert.sacti_search ||
          null
        )
      case "processCmdLine": {
        return (
          meta.data_columns_cmdline ||
          meta.process_cmd_line ||
          meta.process_cmdline ||
          meta.raw_es?.data?.columns?.cmdline ||
          meta.raw_es?.process_cmd_line ||
          meta.raw_es?.process_cmdline ||
          null
        )
      }
      default:
        return null
    }
  }

  const visibleColumns = columns.filter((col) => col.visible)

  if (loading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              {visibleColumns.map((col) => (
                <TableHead key={col.id}>{col.label}</TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-4" />
                </TableCell>
                {visibleColumns.map((col) => (
                  <TableCell key={col.id}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <Skeleton className="h-8 w-20" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  // Render main UI even when there are no alerts so ActiveFilters remains visible

  return (
    <div className="space-y-4">
      {/* Active Filters - render before empty-state so it's always visible when filters exist */}
      <ActiveFilters
        filters={filters}
        onRemoveFilter={onRemoveFilter}
        onClearAll={onClearFilters}
      />

      {/* Empty state when no alerts */}
      {alerts.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium">{filters.length > 0 ? "No results" : "No alerts found"}</h3>
          <p className="text-muted-foreground">
            {filters.length > 0
              ? "No results — active filters applied. Try clearing filters to show alerts."
              : "There are no alerts matching your current filter."}
          </p>
          {filters.length > 0 && (
            <div className="mt-4">
              <Button onClick={onClearFilters} className="h-8">
                Clear All
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      allVisibleAlertIds
                        ? allVisibleAlertIds.length > 0 && allVisibleAlertIds.every(id => selectedAlerts.includes(id))
                        : (selectedAlerts.length > 0 && selectedAlerts.length === alerts.length)
                    }
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const allIds = (allVisibleAlertIds && allVisibleAlertIds.length > 0)
                          ? allVisibleAlertIds
                          : alerts.filter(a => !a.metadata?.qradar).map(a => a.id)
                        const toAdd = allIds.filter(id => !selectedAlerts.includes(id))
                        toAdd.forEach(id => onSelectAlert(true, id))
                      } else {
                        const allIds = (allVisibleAlertIds && allVisibleAlertIds.length > 0)
                          ? allVisibleAlertIds
                          : alerts.filter(a => !a.metadata?.qradar).map(a => a.id)
                        allIds.forEach(id => onSelectAlert(false, id))
                      }
                    }}
                  />
                </TableHead>
                {visibleColumns.map((col) => {
                  const w = columnWidths[col.id]
                  const style = w ? { width: `${w}px`, minWidth: `${w}px` } : undefined
                  const isSorted = col.id === sortBy
                  return (
                    <TableHead key={col.id} style={style} className="relative">
                      <div className="flex items-center gap-2 pr-6">
                        <button
                          className="text-sm font-medium flex items-center gap-2"
                          onClick={() => onSortChange && onSortChange(col.id)}
                          type="button"
                          aria-label={`Sort by ${col.label}`}
                        >
                          <span>{col.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                          </span>
                        </button>

                        <div
                          role="separator"
                          onMouseDown={(e) => {
                            const headerEl = (e.currentTarget as HTMLElement).closest('th') as HTMLElement | null
                            const startWidth = columnWidths[col.id] || headerEl?.clientWidth || 150
                            resizingRef.current = { colId: col.id, startX: e.clientX, startWidth }
                            e.preventDefault()
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 cursor-col-resize flex items-center justify-center z-50"
                          style={{ pointerEvents: 'auto' }}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          aria-hidden
                        >
                          <div className="flex flex-col gap-0.5 items-center">
                            <span className="block w-4 h-0.5 bg-slate-400" />
                            <span className="block w-4 h-0.5 bg-slate-400" />
                            <span className="block w-4 h-0.5 bg-slate-400" />
                          </div>
                        </div>
                      </div>
                    </TableHead>
                  )
                })}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {alerts.map((alert) => (
                  <motion.tr
                    key={alert.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <TableCell>
                      {!alert.metadata?.qradar && canUpdateAlert && (
                        <Checkbox
                          checked={selectedAlerts.includes(alert.id)}
                          onCheckedChange={(checked) => onSelectAlert(checked as boolean, alert.id)}
                        />
                      )}
                    </TableCell>
                    {visibleColumns.map((col) => {
                      const cellValue = getColumnValue(alert, col.id)
                      const isReactElement = typeof cellValue === "object" && cellValue !== null && "type" in cellValue
                      
                      const cellStyle = columnWidths[col.id] ? { width: `${columnWidths[col.id]}px`, minWidth: `${columnWidths[col.id]}px` } : undefined
                      return (
                        <TableCell
                          key={col.id}
                          data-colid={col.id}
                          data-alert-id={alert.id}
                          style={cellStyle}
                          className="max-w-xs truncate cursor-context-menu"
                          onContextMenu={(e) => {
                            // Prevent default browser context menu immediately
                            e.preventDefault()
                            e.stopPropagation()
                            // For context menu filtering, prefer the raw alert value
                            const rawValue = getRawColumnValue(alert, col.id)
                            const textValue = rawValue === undefined || rawValue === null ? "" : String(rawValue)
                            console.log('[AlertTable] cell onContextMenu', { column: col.id, rawValue, textValue })
                            if (!textValue || textValue === "-" || textValue.trim() === "") {
                              // Extra debug for responseCode cells: log the parsed network fields and full alert
                              if (col.id === 'responseCode' || col.id === 'response_code') {
                                try {
                                  console.log('[AlertTable][debug] responseCode missing, parsed fields:', extractWazuhNetworkFields(alert))
                                  console.log('[AlertTable][debug] full alert payload:', alert)
                                } catch (e) {
                                  console.log('[AlertTable][debug] responseCode missing, but failed to serialize alert', e)
                                }
                              }
                              return
                            }
                            handleContextMenu(e, col.id, textValue)
                          }}
                        >
                          {cellValue}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => onViewDetails(alert)}
                          className="h-8 px-3 flex items-center gap-1 bg-blue-500 text-white hover:bg-blue-600"
                          title="View"
                        >
                          <EyeIcon className="h-4 w-4" />
                          <span className="ml-1">View</span>
                        </Button>
                        {canUpdateAlert && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onUpdateStatus(alert)}
                            className="h-8 w-8 p-0 flex items-center justify-center text-gray-500 hover:text-gray-700"
                            title="Update Status"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                        )}
                        {onDeleteAlert && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDeleteAlert(alert.id)}
                            className="h-8 w-8 p-0 flex items-center justify-center text-red-500 hover:text-red-700"
                            title="Delete Alert"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <AlertContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          columnId={contextMenu.columnId}
          value={contextMenu.value}
          onClose={() => setContextMenu(null)}
          onInclude={handleIncludeFilter}
          onExclude={handleExcludeFilter}
        />
      )}
    </div>
  )
}
