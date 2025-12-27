"use client"

import React, { useEffect, useMemo, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Clock, AlertTriangle, ShieldCheck, RefreshCw, Download } from "lucide-react"
import { AlertDetailDialog } from "@/components/alert/alert-detail-dialog"
import { WazuhAlertDetailDialog } from "@/components/alert/wazuh-alert-detail-dialog"
import { QRadarAlertDetailDialog } from "@/components/alert/qradar-alert-detail-dialog"
import { CaseDetailDialog } from "@/components/case/case-detail-dialog"
import { AlertColumnSelector, type AlertColumn } from "@/components/alert/alert-column-selector"

interface Integration {
  id: string
  name: string
  source: string
  status: string
}

interface AlertItem {
  id: string
  integrationId: string
  status: string
  severity?: string
  timestamp?: string
  updatedAt?: string
  metadata?: any
}

interface CaseItem {
  id: string
  integrationId: string
  status: string
  severity?: string | null
  createdAt?: string
  updatedAt?: string
  modifiedAt?: string
  alerts?: any[]
  mttrMinutes?: number | null
  metadata?: any
}

type SlaScope = "all" | "alerts" | "tickets"

type Severity = "critical" | "high" | "medium" | "low"

const severityThresholdMinutes: Record<Severity, number> = {
  critical: 15,
  high: 30,
  medium: 60,
  low: 120,
}

const SLA_COLORS = ["#16a34a", "#ef4444", "#6366f1", "#f59e0b", "#0ea5e9", "#a855f7"]

function toUtc7DateRange(range?: { from: Date; to: Date }) {
  if (!range?.from || !range?.to) {
    console.log('[SLA] toUtc7DateRange: No range provided', range)
    return undefined
  }
  const format = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  const result = {
    from: format(range.from),
    to: format(range.to),
  }
  console.log('[SLA] toUtc7DateRange:', { input: range, output: result })
  return result
}

function getSeverityValue(sev?: string | null, severityBasedOnAnalysis?: string | null): Severity {
  // Priority: severityBasedOnAnalysis > severity > default "low"
  const severityToUse = severityBasedOnAnalysis || sev || "low"
  const normalized = severityToUse.toString().toLowerCase()
  if (normalized.startsWith("crit")) return "critical"
  if (normalized.startsWith("hi")) return "high"
  if (normalized.startsWith("med")) return "medium"
  return "low"
}

function diffMinutes(start?: string | number, end?: string | number) {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  // Return in milliseconds to preserve sub-minute precision
  const diffMs = e.getTime() - s.getTime()
  // Convert to minutes (with fractional support) via formatMetric
  return formatMetric(diffMs)
}

// Helper: compute MTTD/MTTR in milliseconds, return > 0 values even if less than 1 minute
function computeMetricMs(startMs: number, endMs: number): number | null {
  if (!startMs || !endMs || startMs >= endMs) return null
  const diffMs = endMs - startMs
  return diffMs > 0 ? diffMs : null
}

// Helper: format MTTD/MTTR for display (returns as number of minutes or null)
// Supports fractional minutes for values less than 1 minute (e.g., 0.4 minutes = 26 seconds)
function formatMetric(metricMs: number | null): number | null {
  if (metricMs === null || metricMs === undefined) return null
  if (metricMs < 0) return null
  const minutes = metricMs / (60 * 1000)
  // Keep fractional minutes to 1 decimal; if below 0.1 minute, report 0 (not null)
  const rounded = Math.round(minutes * 10) / 10
  return rounded >= 0.1 ? rounded : 0
}

function computeMTTD(alert: AlertItem, source: string): number | null {
  // Skip ONLY if status is "New" - no detection happened yet
  if (alert.status?.toLowerCase() === "new") return null

  const sourceNormalized = source?.toLowerCase().replace(/_/g, "-") || ""

  // Stellar Cyber: calculate from "Event assignee changed to" action timestamp
  if (sourceNormalized.includes("stellar")) {
    const metadata = alert.metadata as any
    let alertTime: number | null = null
    
    // Parse alert time
    const alertTimeValue = metadata?.alert_time || alert.timestamp
    if (typeof alertTimeValue === "string") {
      alertTime = new Date(alertTimeValue).getTime()
    } else if (typeof alertTimeValue === "number") {
      alertTime = alertTimeValue > 1000000000000 ? alertTimeValue : alertTimeValue * 1000
    }
    
    if (!alertTime) return null
    
    // Priority 1: Check if alert_to_first is already available (pre-computed by API)
    const userAction = metadata?.user_action as any
    if (userAction?.alert_to_first !== undefined && userAction?.alert_to_first !== null && userAction?.alert_to_first > 0) {
      // alert_to_first is in milliseconds
      return formatMetric(userAction.alert_to_first)
    }
    
    // Priority 2: Calculate MTTD from "Event assignee changed to" action in user_action.history
    if (userAction?.history && Array.isArray(userAction.history)) {
      const assigneeAction = userAction.history.find((h: any) =>
        h.action && h.action.includes("Event assignee changed to")
      )
      if (assigneeAction?.action_time) {
        // action_time from API is in milliseconds
        const actionTime = typeof assigneeAction.action_time === "number"
          ? assigneeAction.action_time
          : new Date(assigneeAction.action_time).getTime()
        
        const mttdMs = computeMetricMs(alertTime, actionTime)
        return formatMetric(mttdMs)
      }
    }
    
    // Fallback 1: If alert is closed/resolved, use updatedAt as detection time
      if ((alert.status?.toLowerCase() === "closed" || alert.status?.toLowerCase() === "resolved") && alert.updatedAt && alertTime) {
        let updatedAtMs: number
        if (typeof alert.updatedAt === 'number') {
          updatedAtMs = alert.updatedAt > 1000000000000 ? alert.updatedAt : alert.updatedAt * 1000
        } else {
          updatedAtMs = new Date(String(alert.updatedAt)).getTime()
        }
        const mttdMs = computeMetricMs(alertTime, updatedAtMs)
        return formatMetric(mttdMs)
    }
    
    // Fallback 2: Check for any action in history and use the earliest one
    if (userAction?.history && Array.isArray(userAction.history) && userAction.history.length > 0) {
      const firstAction = userAction.history.find((h: any) => h.action_time)
      if (firstAction?.action_time) {
        const actionTime = typeof firstAction.action_time === "number"
          ? firstAction.action_time
          : new Date(firstAction.action_time).getTime()
        
        const mttdMs = computeMetricMs(alertTime, actionTime)
        return formatMetric(mttdMs)
      }
    }
    
    // Fallback 3: If alert has closed_time in metadata, use that
    const closedTime = metadata?.closed_time
    if (closedTime && alertTime) {
      let closedTimeMs: number
      if (typeof closedTime === "string") {
        closedTimeMs = new Date(closedTime).getTime()
      } else if (typeof closedTime === "number") {
        closedTimeMs = closedTime > 1000000000000 ? closedTime : closedTime * 1000
      } else {
        closedTimeMs = 0
      }
      
      if (closedTimeMs > alertTime) {
        const mttdMs = computeMetricMs(alertTime, closedTimeMs)
        return formatMetric(mttdMs)
      }
    }
    
    return null
  }

  // QRadar: use offense timestamp to first update (updatedAt)
  if (sourceNormalized.includes("qradar")) {
    const offenseTs = alert.timestamp
    const updateTs = alert.updatedAt || alert.metadata?.updatedAt
    if (!updateTs || !offenseTs) return null
    return diffMinutes(offenseTs, updateTs)
  }

  // Wazuh: use earliest timeline/comment timestamp or updatedAt
  if (sourceNormalized.includes("wazuh")) {
    const alertTs = alert.timestamp || alert.metadata?.timestamp
    const commentTs = alert.metadata?.comment?.[0]?.comment_time
    const actionTs = commentTs || alert.updatedAt
    if (!actionTs || !alertTs) return null
    return diffMinutes(alertTs, actionTs)
  }

  return null
}

function computeMTTR(caseItem: CaseItem): number | null {
  // If mttrMinutes is already computed and stored, use it (including zero)
  if (caseItem.mttrMinutes !== undefined && caseItem.mttrMinutes !== null) {
    return caseItem.mttrMinutes
  }

  // Try to compute from alerts
  const alerts = caseItem.alerts || []
  if (alerts.length > 0) {
    const alertTimestamps = alerts
      .map((a: any) => {
        // Try multiple timestamp fields
        const ts = a?.timestamp || a?.alert_time || a?.metadata?.timestamp || a?.metadata?.alert_time
        return ts ? new Date(ts).getTime() : null
      })
      .filter((t): t is number => t !== null && Number.isFinite(t))

    if (alertTimestamps.length > 0) {
      const firstAlertTs = Math.min(...alertTimestamps)
      
      // Resolution time is when case was updated/modified/resolved
      const endTs = caseItem.modifiedAt || caseItem.createdAt
      if (endTs) {
        return diffMinutes(firstAlertTs, endTs)
      }
    }
  }

  // Fallback for Stellar Cyber: use latest_alert_time from metadata (works for New and Resolved)
  const metadata = (caseItem as any)?.metadata as any
  if (metadata?.latest_alert_time) {
    const latestAlertTimeMs = typeof metadata.latest_alert_time === "number" 
      ? metadata.latest_alert_time > 1000000000000 ? metadata.latest_alert_time : metadata.latest_alert_time * 1000
      : new Date(metadata.latest_alert_time).getTime()
    
    const endTs = caseItem.modifiedAt || caseItem.createdAt
    if (endTs && Number.isFinite(latestAlertTimeMs)) {
      return diffMinutes(latestAlertTimeMs, endTs)
    }
  }

  return null
}

export default function SlaDashboardPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [cases, setCases] = useState<CaseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useState<SlaScope>("all")
  const [integrationFilter, setIntegrationFilter] = useState<string>("all")
  // Column selector for SLA table
  const DEFAULT_SLA_COLUMNS: AlertColumn[] = [
    { id: "type", label: "Type", visible: true },
    { id: "name", label: "Name", visible: true },
    { id: "timestamp", label: "Timestamp", visible: true },
    { id: "integration", label: "Integration", visible: true },
    { id: "severity", label: "Severity", visible: true },
    { id: "metric", label: "Metric (min)", visible: true },
    { id: "threshold", label: "Threshold (min)", visible: true },
    { id: "status", label: "Status", visible: true },
  ]
  const [slaColumns, setSlaColumns] = useState<AlertColumn[]>(DEFAULT_SLA_COLUMNS)
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc"|"desc"|null>(null)

  // Column widths for resizing (px)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    // Initialize widths for visible columns if not set
    setColumnWidths((prev) => {
      const widths = { ...prev }
      slaColumns.forEach((c) => {
        if (widths[c.id] === undefined) widths[c.id] = c.id === 'name' ? 360 : 140
      })
      return widths
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slaColumns])

  // Global mouse handlers to support resizing similar to AlertTable
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current
      if (!r) return
      const dx = ev.clientX - r.startX
      const newW = Math.max(40, Math.round(r.startWidth + dx))
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
  
  // Initialize with last 14 days by default
  const getDefaultDateRange = () => {
    const now = new Date()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    return {
      from: new Date(twoWeeksAgo.getFullYear(), twoWeeksAgo.getMonth(), twoWeeksAgo.getDate()),
      to: new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }
  }
  
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => getDefaultDateRange())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all'|'pass'|'fail'|'pending'>('all')
  const [excludeKeywords, setExcludeKeywords] = useState<string>("")
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null)
  const [alertDialogOpen, setAlertDialogOpen] = useState(false)
  const [selectedCase, setSelectedCase] = useState<any | null>(null)
  const [caseDialogOpen, setCaseDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Fetch integrations
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/integrations")
        const data = await res.json()
        if (data?.data) {
          setIntegrations(data.data)
        }
      } catch (err) {
        console.error("Failed to fetch integrations", err)
      }
    }
    run()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const range = toUtc7DateRange(dateRange)
      if (dateRange?.from && dateRange?.to) {
        console.log('[SLA] Converting date range:', { from: dateRange.from, to: dateRange.to }, '→', range)
      }
      
      const params = new URLSearchParams()
      if (integrationFilter && integrationFilter !== "all") params.append("integrationId", integrationFilter)
      if (range) {
        params.append("from_date", range.from)
        params.append("to_date", range.to)
      } else {
        params.append("time_range", "7d")
      }
      
      // Add high limit to get all data (match Alert Panel limit of 10000)
      params.append("limit", "10000")

      const paramsStr = params.toString()
      console.log('[SLA] Fetch params:', paramsStr)
      console.log('[SLA] Full alerts URL:', `/api/alerts?${paramsStr}`)

      if (scope === "all" || scope === "alerts") {
        const resAlerts = await fetch(`/api/alerts?${paramsStr}`)
        const dataAlerts = await resAlerts.json()
        const alertsData = dataAlerts.data || dataAlerts.alerts || []
        console.log('[SLA] Fetched alerts:', alertsData.length, 'Sample:', alertsData[0])
        setAlerts(alertsData)
      } else {
        setAlerts([])
      }

      if (scope === "all" || scope === "tickets") {
        const resCases = await fetch(`/api/cases?${paramsStr}`)
        const dataCases = await resCases.json()
        const casesData = dataCases.data || dataCases.cases || []
        console.log('[SLA] Fetched tickets:', casesData.length, 'Sample:', casesData[0])
        setCases(casesData)
      } else {
        setCases([])
      }
    } catch (err) {
      console.error("Failed to fetch SLA data", err)
    } finally {
      setLoading(false)
    }
  }

  // Log whenever dateRange changes
  useEffect(() => {
    console.log('[SLA] dateRange state changed:', dateRange)
  }, [dateRange])

  // Only fetch after user submits filters
  useEffect(() => {
    if (hasSubmitted) {
      console.log('[SLA] useEffect triggered - hasSubmitted=true, current dateRange:', dateRange)
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationFilter, scope, dateRange, hasSubmitted])

  const onSubmitFilters = () => {
    console.log('[SLA] onSubmitFilters called with current dateRange:', dateRange)
    setHasSubmitted(true)
    setCurrentPage(1)
    // Don't call fetchData() here - let the useEffect handle it when state updates
  }

  const slaRows = useMemo(() => {
    const alertRows = alerts.map((a) => {
      const integration = integrations.find((i) => i.id === a.integrationId)
      const source = integration?.source || a.metadata?.source || ""
      const mttd = computeMTTD(a, source)
      
      // Use severityBasedOnAnalysis ONLY for Stellar Cyber alerts.
      // If missing for Stellar, default to "low" (do NOT fallback to native severity).
      const isStellarcyber = source.toLowerCase().includes('stellar')
      const severityBasedOnAnalysis = isStellarcyber ? (a as any).severityBasedOnAnalysis : null
      const sev = isStellarcyber
        ? getSeverityValue(severityBasedOnAnalysis || 'low', severityBasedOnAnalysis || 'low')
        : getSeverityValue(a.severity, null)
      
      const threshold = severityThresholdMinutes[sev]
      const pass = mttd === null ? false : mttd <= threshold
      
      // Debug log for first few alerts
      if (alerts.indexOf(a) < 3) {
        console.log('[SLA] Alert MTTD calculation:', {
          id: a.id,
          source,
                    isStellarcyber,
          status: a.status,
          severity_native: a.severity,
          severityBasedOnAnalysis,
          finalSeverity: sev,
          timestamp: a.timestamp,
          updatedAt: a.updatedAt,
          mttd,
          threshold,
          metadata_keys: Object.keys(a.metadata || {}),
          user_action: a.metadata?.user_action
        })
      }
      
      // Helper: normalize various timestamp representations to ms since epoch
      const toMs = (v: any): number | null => {
        if (v === undefined || v === null) return null
        if (typeof v === 'number') return v > 1000000000000 ? v : v * 1000
        const parsed = new Date(String(v)).getTime()
        return Number.isFinite(parsed) ? parsed : null
      }

      // Determine alert timestamp candidates (integration-dependent)
      const alertTsCandidates = [a.timestamp, a.metadata?.timestamp, a.metadata?.alert_time, a.metadata?.event_time, a.metadata?.created_at]
      const alertTimestamp = alertTsCandidates.map(toMs).find((t) => t !== null) || null

      return {
        type: "alert" as const,
        id: a.id,
        name: (a as any).title || (a as any).name || a.metadata?.title || a.metadata?.name || `Alert ${a.id.slice(0, 8)}`,
        integration: integration?.name || a.integrationId,
        source,
        severity: sev,
        metric: mttd,
        timestamp: alertTimestamp,
        threshold,
        pass,
        item: a,
      }
    })

    const caseRows = cases.map((c) => {
      const integration = integrations.find((i) => i.id === c.integrationId)
      const source = integration?.source || ""
      const mttr = computeMTTR(c)
      
      // For tickets, DO NOT use severityBasedOnAnalysis (per user request)
      const sev = getSeverityValue(c.severity || undefined, null)
      
      const threshold = severityThresholdMinutes[sev]
      const pass = mttr === null ? false : mttr <= threshold
      
      // Debug log for first few cases
      if (cases.indexOf(c) < 3) {
        console.log('[SLA] Ticket MTTR calculation:', {
          id: c.id,
          source,
          status: c.status,
          severity: c.severity,
          finalSeverity: sev,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          modifiedAt: c.modifiedAt,
          mttrMinutes: c.mttrMinutes,
          alertCount: c.alerts?.length,
          mttr,
          threshold,
        })
      }
      
      const toMs = (v: any): number | null => {
        if (v === undefined || v === null) return null
        if (typeof v === 'number') return v > 1000000000000 ? v : v * 1000
        const parsed = new Date(String(v)).getTime()
        return Number.isFinite(parsed) ? parsed : null
      }

      // For tickets use creation timestamp as primary source
      const caseTsCandidates = [c.createdAt, c.metadata?.created_at, c.metadata?.createdAt, c.metadata?.ticket_created_at]
      const caseTimestamp = caseTsCandidates.map(toMs).find((t) => t !== null) || null

      return {
        type: "ticket" as const,
        id: c.id,
        name: (c as any).name || `Ticket #${(c as any).ticketId || c.id.slice(0, 8)}`,
        integration: integration?.name || c.integrationId,
        source,
        severity: sev,
        metric: mttr,
        timestamp: caseTimestamp,
        threshold,
        pass,
        item: c,
      }
    })

    if (scope === "alerts") return alertRows
    if (scope === "tickets") return caseRows
    return [...alertRows, ...caseRows]
  }, [alerts, cases, integrations, scope])

  // Apply global filters (status + exclude keywords) once, reuse everywhere
  const filteredRows = useMemo(() => {
    let rows = slaRows
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        // Filter for pending: items where metric is null
        rows = rows.filter(r => r.metric === null)
      } else {
        // Filter for pass/fail: items where metric is not null
        rows = rows.filter(r => r.metric !== null && (statusFilter === 'pass' ? r.pass : !r.pass))
      }
    }
    const terms = excludeKeywords
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
    if (terms.length > 0) {
      rows = rows.filter(r => {
        const name = (r.name || "").toString().toLowerCase()
        return !terms.some(t => name.includes(t))
      })
    }
    return rows
  }, [slaRows, statusFilter, excludeKeywords])

  const summary = useMemo(() => {
    const total = filteredRows.length
    const pass = filteredRows.filter((r) => r.metric !== null && r.pass).length
    const fail = filteredRows.filter((r) => r.metric !== null && !r.pass).length
    const pending = filteredRows.filter((r) => r.metric === null).length
    const totalWithMetrics = pass + fail
    const achievement = totalWithMetrics > 0 ? Math.round((pass / totalWithMetrics) * 10000) / 100 : 0
    
    console.log('[SLA Summary]', { total, pass, fail, pending, achievement })
    
    return { total, pass, fail, pending, achievement }
  }, [filteredRows])

  // Apply sorting to filtered rows then paginate
  const sortedRows = useMemo(() => {
    if (!sortBy || !sortDir) return filteredRows
    const copy = [...filteredRows]
    copy.sort((a: any, b: any) => {
      const va = a[sortBy]
      const vb = b[sortBy]
      if (va === vb) return 0
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
      const sa = String(va).toLowerCase()
      const sb = String(vb).toLowerCase()
      if (sa < sb) return sortDir === 'asc' ? -1 : 1
      if (sa > sb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [filteredRows, sortBy, sortDir])

  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize
    const endIdx = startIdx + pageSize
    return sortedRows.slice(startIdx, endIdx)
  }, [sortedRows, currentPage, pageSize])

  const totalFiltered = useMemo(() => {
    return filteredRows.length
  }, [filteredRows])
  const totalPages = Math.ceil(Math.max(1, totalFiltered) / pageSize)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [integrationFilter, scope, dateRange, statusFilter, excludeKeywords])

  const chartData = useMemo(() => {
    const bySource: Record<string, { name: string; pass: number; fail: number }> = {}
    filteredRows.forEach((r) => {
      const key = r.integration
      if (!bySource[key]) bySource[key] = { name: key, pass: 0, fail: 0 }
      if (r.metric === null) return
      if (r.pass) bySource[key].pass += 1
      else bySource[key].fail += 1
    })
    return Object.values(bySource)
  }, [filteredRows])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">SLA Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSubmitFilters} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Apply Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              try {
                // Send the currently filtered rows and visible columns to the server
                const payload = {
                  rows: filteredRows.map(r => ({
                    id: r.id,
                    type: r.type,
                    name: r.name,
                    timestamp: r.timestamp,
                    integration: r.integration,
                    severity: r.severity,
                    metric: r.metric,
                    threshold: r.threshold,
                    status: r.status,
                    pass: r.pass,
                  })),
                  columns: slaColumns.filter(c => c.visible).map(c => c.id),
                  columnLabels: slaColumns.filter(c => c.visible).map(c => c.label),
                }

                const res = await fetch('/api/sla/export', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })

                if (!res.ok) throw new Error('Export failed')
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'sla-export.xlsx'
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              } catch (err) {
                console.error('SLA export failed', err)
                alert('Export failed: ' + (err as any).message)
              } finally {
                setExporting(false)
              }
            }}
          >
            {exporting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" /> Export
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="grid gap-4 md:grid-cols-6 md:items-end">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Integration</span>
            <Select value={integrationFilter} onValueChange={setIntegrationFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All integrations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Integrations</SelectItem>
                {integrations.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">SLA Scope</span>
            <Tabs value={scope} onValueChange={(v) => setScope(v as SlaScope)}>
              <TabsList className="grid grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
                <TabsTrigger value="tickets">Tickets</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <span className="text-xs text-muted-foreground">Date Range (UTC+7)</span>
            <DateRangePicker 
              from={dateRange?.from}
              to={dateRange?.to}
              onDateRangeChange={(newRange) => {
                console.log('[SLA] DateRangePicker onDateRangeChange:', newRange)
                setDateRange(newRange)
              }} 
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Status</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pass">PASS</SelectItem>
                <SelectItem value="fail">FAIL</SelectItem>
                <SelectItem value="pending">PENDING</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Exclude names (comma-separated)</span>
            <Input
              value={excludeKeywords}
              onChange={(e) => { setExcludeKeywords(e.target.value); setCurrentPage(1) }}
              placeholder="e.g. Connector Authentication Failure, Test Alert"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={onSubmitFilters} disabled={loading}>
              Apply Filters
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Items</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{hasSubmitted ? summary.total : 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">PASS</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-green-600">{hasSubmitted ? summary.pass : 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">FAILED</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-red-600">{hasSubmitted ? summary.fail : 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Achievement</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{hasSubmitted ? summary.achievement : 0}%</div>
            <div className="text-xs text-muted-foreground">Pending metrics: {hasSubmitted ? summary.pending : 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">SLA Pass/Fail by Integration</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {!hasSubmitted ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Apply filters to load data</div>
            ) : loading ? (
              <Skeleton className="w-full h-64" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pass" stackId="a" fill="#16a34a" name="Pass" />
                  <Bar dataKey="fail" stackId="a" fill="#ef4444" name="Fail" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">SLA Achievement</CardTitle>
          </CardHeader>
          <CardContent className="h-72 flex items-center justify-center">
            {!hasSubmitted ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Apply filters to load data</div>
            ) : loading ? (
              <Skeleton className="w-full h-64" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie dataKey="value" data={[
                    { name: "Pass", value: summary.pass },
                    { name: "Fail", value: summary.fail },
                    { name: "Pending", value: summary.pending },
                  ]} label>
                    {[summary.pass, summary.fail, summary.pending].map((_, idx) => (
                      <Cell key={idx} fill={SLA_COLORS[idx % SLA_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex w-full flex-row items-center justify-between">
          <div className="flex-1 text-left">
            <CardTitle className="text-sm text-left">SLA Items ({scope === "tickets" ? "Tickets (MTTR)" : scope === "alerts" ? "Alerts (MTTD)" : "Alerts & Tickets"})</CardTitle>
          </div>
          <div className="ml-auto flex-shrink-0">
            <AlertColumnSelector columns={slaColumns} onColumnsChange={(cols) => setSlaColumns(cols)} />
          </div>
        </CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {slaColumns.filter(c => c.visible).map((col) => (
                  <TableHead
                    key={col.id}
                    className="relative"
                    style={columnWidths[col.id] ? { width: `${columnWidths[col.id]}px`, minWidth: `${columnWidths[col.id]}px` } : undefined}
                  >
                    <button
                      className="text-sm font-medium flex items-center gap-2"
                      onClick={() => {
                        // toggle sort for this column
                        if (sortBy === col.id) {
                          setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                        } else {
                          setSortBy(col.id)
                          setSortDir('asc')
                        }
                      }}
                      type="button"
                    >
                      <span>{col.label}</span>
                      <span className="text-xs text-muted-foreground">{sortBy === col.id ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                    {/* Resizer handle (three-line grip, matches AlertTable) */}
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
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hasSubmitted ? (
                <TableRow>
                  <TableCell colSpan={slaColumns.filter(c => c.visible).length} className="text-center text-sm text-muted-foreground">
                    Apply filters and press "Apply Filters" to load data.
                  </TableCell>
                </TableRow>
              ) : loading ? (
                <TableRow>
                  <TableCell colSpan={slaColumns.filter(c => c.visible).length}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : slaRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={slaColumns.filter(c => c.visible).length} className="text-center text-sm text-muted-foreground">
                    No data for selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row) => (
                  <TableRow
                    key={`${row.type}-${row.id}`}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() => {
                      if (row.type === "alert") {
                        setSelectedAlert(row.item)
                        setAlertDialogOpen(true)
                      } else {
                        setSelectedCase(row.item)
                        setCaseDialogOpen(true)
                      }
                    }}
                  >
                    {slaColumns.filter(c => c.visible).map((col) => {
                      const colId = col.id
                      const render = () => {
                        switch (colId) {
                          case 'type':
                            return (
                              <TableCell className="capitalize font-medium">
                                {row.type === "alert" ? (
                                  <Badge variant="outline" className="text-xs">Alert</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">Ticket</Badge>
                                )}
                              </TableCell>
                            )
                          case 'name':
                            return <TableCell className="max-w-xs truncate" title={row.name}>{row.name}</TableCell>
                          case 'timestamp':
                            {
                              const formatTs = (ts: any) => {
                                if (!ts) return null
                                const d = new Date(ts)
                                if (!Number.isFinite(d.getTime())) return null
                                return d.toLocaleString('en-GB', {
                                  timeZone: 'Asia/Jakarta',
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })
                              }
                              const formatted = formatTs((row as any).timestamp)
                              return (
                                <TableCell className="font-mono">
                                  {formatted ? formatted : <span className="text-muted-foreground">-</span>}
                                </TableCell>
                              )
                            }
                          case 'integration':
                            return <TableCell>{row.integration}</TableCell>
                          case 'severity':
                            return (
                              <TableCell>
                                <Badge variant={
                                  row.severity === "critical" ? "destructive" :
                                  row.severity === "high" ? "default" :
                                  row.severity === "medium" ? "secondary" : "outline"
                                } className="capitalize text-xs">
                                  {row.severity}
                                </Badge>
                              </TableCell>
                            )
                          case 'metric':
                            return (
                              <TableCell className="font-mono">
                                {row.metric !== null ? (
                                  row.type === "ticket"
                                    ? `${Math.round(row.metric)} min`
                                    : row.metric >= 1
                                      ? `${Math.round(row.metric)} min`
                                      : `${Math.round(row.metric * 60)} sec`
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            )
                          case 'threshold':
                            return <TableCell className="font-mono text-muted-foreground">{row.threshold} min</TableCell>
                          case 'status':
                            return (
                              <TableCell>
                                {row.metric === null ? (
                                  <Badge variant="outline" className="text-xs">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Pending
                                  </Badge>
                                ) : row.pass ? (
                                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                    <ShieldCheck className="h-3 w-3 mr-1" />
                                    Pass
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    Fail
                                  </Badge>
                                )}
                              </TableCell>
                            )
                          default:
                            return <TableCell>-</TableCell>
                        }
                      }
                      // render() returns a TableCell element — attach key, width and return it directly
                      const cellEl = render()
                      const style = columnWidths[colId] ? { width: `${columnWidths[colId]}px`, minWidth: `${columnWidths[colId]}px` } : undefined
                      if (React.isValidElement(cellEl)) {
                        return React.cloneElement(cellEl as React.ReactElement<any>, { key: col.id, style })
                      }
                      return (
                        <TableCell key={col.id} style={style}>
                          {cellEl}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {totalFiltered === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalFiltered)} of {totalFiltered} items
              </p>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                  <SelectItem value="200">200 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || loading}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Detail dialogs */}
      {selectedAlert && (
        <>
          {(() => {
            const isWazuh = String((selectedAlert.integration?.source || selectedAlert.metadata?.source || "")).toLowerCase().includes("wazuh")
            const enriched = selectedAlert
              ? ({
                  ...selectedAlert,
                  metadata: Object.assign({}, selectedAlert.metadata || {},
                    selectedAlert.hash_sha256 ? { hash_sha256: selectedAlert.hash_sha256 } : {},
                    selectedAlert.sha256 ? { sha256: selectedAlert.sha256 } : {},
                    selectedAlert.sacti_search ? { sacti_search: selectedAlert.sacti_search } : {},
                    selectedAlert.data_win_eventdata_hashes ? { data_win_eventdata_hashes: selectedAlert.data_win_eventdata_hashes } : {},
                    selectedAlert.md5 ? { md5: selectedAlert.md5 } : {},
                    selectedAlert.sha1 ? { sha1: selectedAlert.sha1 } : {}
                  )
                } as any)
              : selectedAlert

            if (isWazuh) return <WazuhAlertDetailDialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen} alert={enriched} />
            if (String((selectedAlert.integration?.source || selectedAlert.metadata?.source || "")).toLowerCase().includes("qradar")) return <QRadarAlertDetailDialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen} alert={selectedAlert} />
            return <AlertDetailDialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen} alert={selectedAlert} />
          })()}
        </>
      )}
      {selectedCase && (
        <CaseDetailDialog open={caseDialogOpen} onOpenChange={setCaseDialogOpen} case={selectedCase} />
      )}
    </div>
  )
}
