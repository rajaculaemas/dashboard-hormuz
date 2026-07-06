"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/stores/auth-store"
import { hasPermission } from "@/lib/auth/password"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  FolderSyncIcon as Sync,
  Eye,
  TrendingUp,
  TrendingDown,
  Activity,
  Timer,
  AlertTriangle,
  Edit,
  ChevronDown,
  Trash,
  Download,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { CaseDetailDialog } from "@/components/case/case-detail-dialog"
import { CaseActionDialog } from "@/components/case/case-action-dialog"
import { ASSIGNEES } from "@/components/case/case-action-dialog"
import { formatDistanceToNow } from "date-fns"
import { format } from "date-fns"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Switch } from "@/components/ui/switch"
import { exportTicketsToExcel } from "@/lib/utils/tickets-excel-export"

interface Integration {
  id: string
  name: string
  source: string
  status: string
  lastSync: Date | null
}

interface Case {
  id: string
  externalId: string
  name: string
  status: string
  severity: string | null
  assignee: string | null
  assigneeName: string | null
  createdAt: Date
  updatedAt?: Date
  modifiedAt: Date | null
  ticketId: number
  score: number | null
  size: number | null
  integration: {
    id: string
    name: string
    source?: string
  }
  alerts?: any[]
  mttrMinutes?: number | null
}

interface CaseStats {
  total: number
  open: number
  inProgress: number
  resolved: number
  critical: number
  avgMttr: number
}

const statusColors = {
  New: "bg-blue-100 text-blue-800",
  "In Progress": "bg-yellow-100 text-yellow-800",
  Resolved: "bg-green-100 text-green-800",
  Cancelled: "bg-gray-100 text-gray-800",
  Closed: "bg-gray-100 text-gray-800",
}

const severityColors = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-green-100 text-green-800",
}

const statusIcons = {
  New: AlertCircle,
  "In Progress": Clock,
  Resolved: CheckCircle,
  Cancelled: XCircle,
  Closed: CheckCircle,
}

export default function TicketsPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [stats, setStats] = useState<CaseStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    critical: 0,
    avgMttr: 0,
  })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Helper function to get assignee name from ID or use existing name
  const getAssigneeName = (assigneeId: string | null, assigneeName: string | null): string => {
    // If assigneeName already has a valid value (not null and not "Unassigned"), use it
    if (assigneeName && assigneeName !== "Unassigned" && assigneeName.trim()) {
      return assigneeName
    }
    // Otherwise try to map from ID
    if (assigneeId) {
      const assignee = ASSIGNEES.find((a) => a.id === assigneeId)
      if (assignee) {
        return assignee.name
      }
    }
    return "Unassigned"
  }
  const [refreshing, setRefreshing] = useState(false)
  const [integrationFilter, setIntegrationFilter] = useState<string[]>(["all"])
  const [integrationPopoverOpen, setIntegrationPopoverOpen] = useState(false)
  const [timeRange, setTimeRange] = useState("7d")
  const [useAbsoluteDate, setUseAbsoluteDate] = useState(false)
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>(undefined)
  const [statusFilter, setStatusFilter] = useState("")
  const [severityFilter, setSeverityFilter] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCase, setSelectedCase] = useState<Case | null>(null)
  const [actionCase, setActionCase] = useState<Case | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [accessibleIntegrationIds, setAccessibleIntegrationIds] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<string>("createdAt")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)
  const { toast } = useToast()
  const user = useAuthStore((state) => state.user)

  // Convert local date to YYYY-MM-DD format string for API
  // This preserves the user's local date regardless of timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const toMillis = (value: any): number => {
    if (value === null || value === undefined) return NaN
    if (value instanceof Date) return value.getTime()
    if (typeof value === "number") {
      // If value looks like seconds (10 digits), convert to ms
      return value < 1e12 ? value * 1000 : value
    }
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? NaN : parsed
  }

  // Integration filter handlers
  const isAllIntegrations = integrationFilter.includes("all")
  const selectedCount = integrationFilter.filter(f => f !== "all").length

  const handleSelectAllIntegrations = (checked: boolean) => {
    if (checked) {
      setIntegrationFilter(["all"])
    } else {
      setIntegrationFilter([])
    }
  }

  const handleSelectIntegration = (integrationId: string, checked: boolean) => {
    // If "all" is selected, first remove it when selecting individual integrations
    let newFilters = integrationFilter.filter(f => f !== "all")
    
    if (checked) {
      newFilters.push(integrationId)
    } else {
      newFilters = newFilters.filter(f => f !== integrationId)
    }
    
    // If all individual integrations are selected, replace with "all"
    if (newFilters.length === integrations.length) {
      setIntegrationFilter(["all"])
    } else {
      setIntegrationFilter(newFilters)
    }
  }

  const getIntegrationDisplayLabel = () => {
    if (isAllIntegrations) {
      return "All Integrations"
    }
    if (selectedCount === 0) {
      return "No integration selected"
    }
    if (selectedCount === 1) {
      const selected = integrations.find(i => integrationFilter.includes(i.id))
      return selected?.name || "1 Integration"
    }
    return `${selectedCount} Integrations`
  }

  const extractAlertTimestamp = (rawAlert: any): number => {
    const alert = rawAlert?.alert ?? rawAlert
    const candidates = [
      alert?.timestamp,
      alert?.alert_time,
      alert?.alertTime,
      alert?.event_time,
      alert?.metadata?.timestamp,
      alert?.metadata?.alert_time,
      alert?.metadata?.alertTime,
    ]

    for (const candidate of candidates) {
      const ts = toMillis(candidate)
      if (Number.isFinite(ts)) return ts
    }
    return NaN
  }

  const computeWazuhMttrMinutes = (wazuhCase: any): number | null => {
    const createdMs = toMillis(wazuhCase?.createdAt)
    const alerts = wazuhCase?.alerts || []
    if (!Number.isFinite(createdMs) || alerts.length === 0) return null

    const firstAlertTs = alerts
      .map((a: any) => extractAlertTimestamp(a))
      .filter((ts: number) => Number.isFinite(ts))
      .reduce((min: number, ts: number) => Math.min(min, ts), Infinity)

    if (!Number.isFinite(firstAlertTs) || !Number.isFinite(createdMs)) return null

    const diffMinutes = Math.max(0, Math.round((createdMs - firstAlertTs) / 60000))
    return diffMinutes
  }

  const computeQRadarMttrMinutes = (qradarCase: any): number | null => {
    // For QRadar cases: MTTR = Case Created - Oldest Alert Created
    // If mttrMinutes is already provided from API, use it
    if (qradarCase.mttrMinutes !== undefined && qradarCase.mttrMinutes !== null) {
      return qradarCase.mttrMinutes;
    }

    // Fallback calculation if not provided by API
    if (qradarCase.alerts && qradarCase.alerts.length > 0) {
      const alertCreatedTimes = qradarCase.alerts
        .filter((ca: any) => ca.alert && ca.alert.createdAt)
        .map((ca: any) => new Date(ca.alert.createdAt).getTime());
      
      if (alertCreatedTimes.length > 0) {
        const oldestAlertTime = Math.min(...alertCreatedTimes);
        const caseCreatedTime = new Date(qradarCase.createdAt).getTime();
        const diffMinutes = Math.max(0, Math.round((caseCreatedTime - oldestAlertTime) / 60000));
        return diffMinutes;
      }
    }

    return null;
  }

  const computeStellarMttrMinutes = (stellarCase: any): number | null => {
    // For Stellar Cyber: MTTR = case.createdAt - latest alert_time
    // latest_alert_time is stored in metadata during sync (in milliseconds)
    
    console.log("computeStellarMttrMinutes input:", {
      id: stellarCase?.id,
      createdAt: stellarCase?.createdAt,
      latestAlertTime: stellarCase?.metadata?.latest_alert_time,
    })

    const caseCreatedMs = toMillis(stellarCase?.createdAt)
    if (!Number.isFinite(caseCreatedMs)) {
      console.log("Invalid case created time")
      return null
    }

    // Get latest alert time from metadata (stored during sync in milliseconds)
    let latestAlertTimeMs = stellarCase?.metadata?.latest_alert_time
    
    // Ensure it's in milliseconds format
    if (typeof latestAlertTimeMs === "number") {
      // If it looks like seconds (< 1000000000000), convert to ms
      if (latestAlertTimeMs < 1000000000000 && latestAlertTimeMs > 0) {
        latestAlertTimeMs = latestAlertTimeMs * 1000
      }
    } else {
      latestAlertTimeMs = toMillis(latestAlertTimeMs)
    }
    
    console.log("Converted timestamps:", { caseCreatedMs, latestAlertTimeMs })

    if (!Number.isFinite(latestAlertTimeMs)) {
      console.log("Invalid latest alert time")
      return null
    }

    // MTTR = case created - latest alert time
    const diffMinutes = Math.max(0, Math.round((caseCreatedMs - latestAlertTimeMs) / 60000))
    console.log("Computed Stellar MTTR:", diffMinutes, "minutes")
    return diffMinutes
  }

  const getMttrThresholdMinutes = (severity: string | null | undefined): number | null => {
    if (!severity) return null
    switch (severity.toLowerCase()) {
      case "low":
        return 120
      case "medium":
        return 60
      case "high":
        return 30
      case "critical":
        return 15
      default:
        return null
    }
  }

  const renderMttr = (caseItem: Case) => {
    if (caseItem.mttrMinutes === null || caseItem.mttrMinutes === undefined) {
      return <div className="text-sm text-muted-foreground">N/A</div>
    }

    const threshold = getMttrThresholdMinutes(caseItem.severity)
    const breached = threshold !== null && caseItem.mttrMinutes > threshold

    return (
      <div className={`text-sm ${breached ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
        {caseItem.mttrMinutes}m
      </div>
    )
  }

  // Fetch integrations
  const fetchIntegrations = async () => {
    try {
      const response = await fetch("/api/integrations")
      const data = await response.json()

      if (data.success) {
        setIntegrations(data.data)
        // Auto-select "all" if no integrations are selected
        if (integrationFilter.length === 0 && data.data.length > 0) {
          setIntegrationFilter(["all"])
        }
      }
    } catch (error) {
      console.error("Error fetching integrations:", error)
      toast({
        title: "Error",
        description: "Failed to fetch integrations",
        variant: "destructive",
      })
    }
  }

  // Fetch cases
  const fetchCases = async () => {
    if (!integrationFilter || integrationFilter.length === 0) return

    try {
      // Determine which integrations to fetch from
      const isAllIntegrations = integrationFilter.includes("all")
      const integrationsToFetch = isAllIntegrations 
        ? integrations 
        : integrations.filter(i => integrationFilter.includes(i.id))

      // Handle multiple integrations
      if (integrationsToFetch.length > 0) {
        console.log("Fetching cases from integrations:", integrationsToFetch.map(i => ({ id: i.id, name: i.name, source: i.source })))
        
        const allCases: Case[] = []
        let totalStats = {
          total: 0,
          open: 0,
          inProgress: 0,
          resolved: 0,
          critical: 0,
          avgMttr: 0,
        }
        let mttrSum = 0
        let mttrCount = 0

        // Fetch from each integration
        for (const integration of integrationsToFetch) {
          try {
            console.log(`Processing integration: ${integration.name} (${integration.id}) - source: ${integration.source}`)
            let data
            if (integration.source === "wazuh" || integration.name?.toLowerCase().includes("wazuh")) {
              console.log(`Fetching Wazuh cases from: ${integration.name}`)
              const params = new URLSearchParams({
                ...(useAbsoluteDate && dateRange && { from_date: formatLocalDate(dateRange.from) }),
                ...(useAbsoluteDate && dateRange && { to_date: formatLocalDate(dateRange.to) }),
                ...(!useAbsoluteDate && { time_range: timeRange }),
                ...(statusFilter && statusFilter !== "all" && { status: statusFilter }),
                ...(severityFilter && severityFilter !== "all" && { severity: severityFilter }),
              })
              const response = await fetch(`/api/wazuh/cases?${params}`)
              data = await response.json()
              console.log(`Wazuh response for ${integration.name}:`, data)

              if (data.cases) {
                // Filter cases to only include those belonging to this specific integration
                const filteredCases = data.cases.filter((wazuhCase: any) => wazuhCase.integrationId === integration.id)
                console.log(`[Tickets] Wazuh cases for ${integration.name}: ${filteredCases.length} (of ${data.cases.length} total Wazuh cases)`)
                
                const transformedCases = filteredCases.map((wazuhCase: any) => {
                  const mttrMinutes = computeWazuhMttrMinutes(wazuhCase)
                  if (mttrMinutes !== null && mttrMinutes !== undefined) {
                    mttrSum += mttrMinutes
                    mttrCount += 1
                  }

                  return {
                  id: wazuhCase.id,
                  externalId: wazuhCase.caseNumber,
                  name: wazuhCase.title || `Case ${wazuhCase.caseNumber}`,
                  status: wazuhCase.status, // Backend already normalizes status
                  severity: wazuhCase.severity || null,
                  assignee: wazuhCase.assignee?.name || wazuhCase.assignee?.email || null,
                  assigneeName: wazuhCase.assignee?.name || null,
                  createdAt: new Date(wazuhCase.createdAt),
                  modifiedAt: wazuhCase.updatedAt ? new Date(wazuhCase.updatedAt) : null,
                  ticketId: parseInt(wazuhCase.caseNumber) || 0,
                  score: null,
                  size: wazuhCase.alertCount,
                  integration: {
                    id: wazuhCase.integrationId,
                    name: integration.name,
                    source: "wazuh",
                  },
                  alerts: wazuhCase.alerts || [],
                  mttrMinutes,
                }
                })
                
                // Apply front-end filtering for status and severity as additional safety
                let filteredData = transformedCases
                if (statusFilter && statusFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.status === statusFilter)
                }
                if (severityFilter && severityFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.severity === severityFilter)
                }
                
                allCases.push(...filteredData)
                totalStats.total += filteredData.length
                totalStats.open += filteredData.filter((c: any) => c.status === "New").length
                totalStats.inProgress += filteredData.filter((c: any) => c.status === "In Progress").length
                totalStats.resolved += filteredData.filter((c: any) => c.status === "Resolved").length
                totalStats.critical += filteredData.filter((c: any) => c.severity === "Critical").length
              }
            } else if (integration.source === "qradar" || integration.name?.toLowerCase().includes("qradar")) {
              console.log(`Fetching QRadar cases from: ${integration.name}`)
              const params = new URLSearchParams({
                ...(useAbsoluteDate && dateRange && { from_date: formatLocalDate(dateRange.from) }),
                ...(useAbsoluteDate && dateRange && { to_date: formatLocalDate(dateRange.to) }),
                ...(!useAbsoluteDate && { time_range: timeRange }),
                ...(statusFilter && statusFilter !== "all" && { status: statusFilter }),
                ...(severityFilter && severityFilter !== "all" && { severity: severityFilter }),
              })
              const response = await fetch(`/api/qradar/cases?${params}`)
              data = await response.json()
              console.log(`QRadar response for ${integration.name}:`, data)

              if (data.cases) {
                // Filter cases to only include those belonging to this specific integration
                const filteredCases = data.cases.filter((qradarCase: any) => qradarCase.integrationId === integration.id)
                console.log(`[Tickets] QRadar cases for ${integration.name}: ${filteredCases.length} (of ${data.cases.length} total QRadar cases)`)
                
                const transformedCases = filteredCases.map((qradarCase: any) => {
                  const mttrMinutes = computeQRadarMttrMinutes(qradarCase)
                  if (mttrMinutes !== null && mttrMinutes !== undefined) {
                    mttrSum += mttrMinutes
                    mttrCount += 1
                  }

                  return {
                    id: qradarCase.id,
                    externalId: qradarCase.caseNumber,
                    name: qradarCase.title || `Case ${qradarCase.caseNumber}`,
                    status: qradarCase.status, // Backend already normalizes status
                    severity: qradarCase.severity || null,
                    assignee: qradarCase.assignee?.name || qradarCase.assignee?.email || null,
                    assigneeName: qradarCase.assignee?.name || null,
                    createdAt: new Date(qradarCase.createdAt),
                    modifiedAt: qradarCase.updatedAt ? new Date(qradarCase.updatedAt) : null,
                    ticketId: parseInt(qradarCase.caseNumber) || 0,
                    score: null,
                    size: qradarCase.alertCount,
                    integration: {
                      id: qradarCase.integrationId,
                      name: integration.name,
                      source: "qradar",
                    },
                    alerts: qradarCase.alerts || [],
                    mttrMinutes,
                  }
                })
                
                // Apply front-end filtering for status and severity as additional safety
                let filteredData = transformedCases
                if (statusFilter && statusFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.status === statusFilter)
                }
                if (severityFilter && severityFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.severity === severityFilter)
                }
                
                allCases.push(...filteredData)
                totalStats.total += filteredData.length
                totalStats.open += filteredData.filter((c: any) => c.status === "New").length
                totalStats.inProgress += filteredData.filter((c: any) => c.status === "In Progress").length
                totalStats.resolved += filteredData.filter((c: any) => c.status === "Resolved").length
                totalStats.critical += filteredData.filter((c: any) => c.severity === "Critical").length
              }
            } else {
              console.log(`Fetching Stellar Cyber/SOCFortress cases from: ${integration.name}`)
              const params = new URLSearchParams({
                integrationId: integration.id,
                time_range: useAbsoluteDate ? "custom" : timeRange,
                ...(useAbsoluteDate && dateRange && { from_date: formatLocalDate(dateRange.from) }),
                ...(useAbsoluteDate && dateRange && { to_date: formatLocalDate(dateRange.to) }),
                ...(statusFilter && statusFilter !== "all" && { status: statusFilter }),
                ...(severityFilter && severityFilter !== "all" && { severity: severityFilter }),
              })
              const response = await fetch(`/api/cases?${params}`)
              data = await response.json()
              console.log(`Stellar Cyber/SOCFortress response for ${integration.name}:`, data)

              if (data.success) {
                // Apply front-end filtering for status and severity as additional safety
                let filteredData = data.data
                if (statusFilter && statusFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.status === statusFilter)
                }
                if (severityFilter && severityFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.severity === severityFilter)
                }
                
                const isStellarCyber = integration.source === "stellar-cyber" || integration.name?.toLowerCase().includes("stellar")
                const isSocfortress = integration.source === "socfortress" || integration.source === "copilot" || integration.name?.toLowerCase().includes("socfortress")
                
                const casesWithMttr = filteredData.map((c: any) => {
                  let mttrMinutes = null
                  
                  if (isStellarCyber) {
                    // For Stellar Cyber cases
                    mttrMinutes = computeStellarMttrMinutes(c)
                  } else if (isSocfortress) {
                    // For SOCFortress/Copilot cases, MTTR already calculated in API
                    mttrMinutes = c.mttrMinutes || null
                  }
                  
                  if (mttrMinutes !== null && mttrMinutes !== undefined) {
                    mttrSum += mttrMinutes
                    mttrCount += 1
                  }
                  return { ...c, mttrMinutes }
                })
                
                allCases.push(...casesWithMttr)
                totalStats.total += casesWithMttr.length
                totalStats.open += casesWithMttr.filter((c: any) => c.status === "New").length
                totalStats.inProgress += casesWithMttr.filter((c: any) => c.status === "In Progress").length
                totalStats.resolved += casesWithMttr.filter((c: any) => c.status === "Resolved").length
                totalStats.critical += casesWithMttr.filter((c: any) => c.severity === "Critical").length
              }
            }
          } catch (error) {
            console.error(`Error fetching cases from ${integration.name}:`, error)
          }
        }

        if (mttrCount > 0) {
          totalStats.avgMttr = Math.round(mttrSum / mttrCount)
        }

        setCases(allCases)
        setStats(totalStats)
        console.log("Fetched cases from integrations:", allCases.length)
        return
      }
    } catch (error) {
      console.error("Error fetching cases:", error)
      toast({
        title: "Error",
        description: "Failed to fetch cases",
        variant: "destructive",
      })
    }
  }

  // Sync cases
  const syncCases = async () => {
    if (!integrationFilter || integrationFilter.length === 0) {
      toast({
        title: "Error",
        description: "Please select an integration first",
        variant: "destructive",
      })
      return
    }

    setSyncing(true)
    try {
      const isAllIntegrations = integrationFilter.includes("all")
      const integrationsToSync = isAllIntegrations 
        ? integrations 
        : integrations.filter(i => integrationFilter.includes(i.id))

      console.log("Starting case sync for integrations:", integrationsToSync.map(i => i.name).join(", "))
      
      for (const integration of integrationsToSync) {
        try {
          console.log(`Syncing cases for integration: ${integration.name} (${integration.id})`)
          
          const response = await fetch("/api/cases/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              integrationId: integration.id,
            }),
          })

          const data = await response.json()

          if (data.success) {
            console.log(`Sync completed for ${integration.name}: ${data.stats.created} new, ${data.stats.updated} updated`)
          } else {
            console.error(`Failed to sync ${integration.name}:`, data.error)
          }
        } catch (error) {
          console.error(`Error syncing ${integration.name}:`, error)
        }
      }

      toast({
        title: "Success",
        description: `Sync completed for ${integrationsToSync.length} integration${integrationsToSync.length !== 1 ? "s" : ""}`,
      })

      // Auto refresh data after successful sync
      console.log("Sync completed, refreshing data...")
      await fetchCases()
      await fetchIntegrations()
    } catch (error) {
      console.error("Error syncing cases:", error)
      toast({
        title: "Error",
        description: "Failed to sync cases",
        variant: "destructive",
      })
    } finally {
      setSyncing(false)
    }
  }

  // Manual refresh
  const refreshData = async () => {
    setRefreshing(true)
    try {
      console.log("Manual refresh triggered")
      await Promise.all([fetchCases(), fetchIntegrations()])
      toast({
        title: "Success",
        description: "Data refreshed successfully",
      })
    } catch (error) {
      console.error("Error refreshing data:", error)
      toast({
        title: "Error",
        description: "Failed to refresh data",
        variant: "destructive",
      })
    } finally {
      setRefreshing(false)
    }
  }

  // Mouse move/up handlers for column resizing
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

  // Handle sorting
  const handleSort = (columnId: string) => {
    if (sortBy === columnId) {
      // Toggle sort direction
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to asc
      setSortBy(columnId)
      setSortDir('asc')
    }
  }

  // Column definitions
  const columns = [
    { id: 'ticketId', label: 'Ticket ID' },
    { id: 'name', label: 'Name' },
    { id: 'status', label: 'Status' },
    { id: 'severity', label: 'Severity' },
    { id: 'integration', label: 'Integration' },
    { id: 'assigneeName', label: 'Assignee' },
    { id: 'createdAt', label: 'Created' },
    { id: 'mttrMinutes', label: 'MTTR' },
  ]

  // Sort function
  const getSortValue = (caseItem: Case, columnId: string): any => {
    switch (columnId) {
      case 'ticketId':
        return caseItem.ticketId
      case 'name':
        return caseItem.name
      case 'status':
        return caseItem.status
      case 'severity':
        return caseItem.severity || ''
      case 'assigneeName':
        return getAssigneeName(caseItem.assignee, caseItem.assigneeName)
      case 'createdAt':
        return new Date(caseItem.createdAt).getTime()
      case 'integration':
        return caseItem.integration?.name || ''
      case 'mttrMinutes':
        return caseItem.mttrMinutes || 0
      default:
        return ''
    }
  }

  // Handle case action (edit)
  const handleCaseAction = (caseItem: Case) => {
    console.log("Opening case action dialog for:", caseItem)
    setActionCase(caseItem)
    setActionDialogOpen(true)
  }

  // Handle case detail (view)
  const handleCaseDetail = (caseItem: Case) => {
    console.log("Opening case detail dialog for:", caseItem)
    setSelectedCase(caseItem)
    setDetailDialogOpen(true)
  }

  // Handle case update
  const handleCaseUpdate = async () => {
    // Refresh the cases data after update
    await fetchCases()

    toast({
      title: "Success",
      description: "Case updated successfully",
    })
  }

  // Handle case delete
  const handleDeleteCase = async (caseItem: Case) => {
    // Show confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete case "${caseItem.name}" (${caseItem.externalId})? This action cannot be undone.`
    )
    
    if (!confirmed) {
      return
    }

    try {
      let url = ''
      
      // Determine the correct endpoint based on integration source
      if (caseItem.integration?.source === 'wazuh') {
        url = `/api/wazuh/cases/${caseItem.id}`
      } else if (caseItem.integration?.source === 'qradar') {
        url = `/api/qradar/cases/${caseItem.id}`
      } else {
        // For Stellar Cyber and SOCFortress
        url = `/api/cases/${caseItem.id}`
      }

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete case')
      }

      toast({
        title: "Success",
        description: `Case "${caseItem.name}" deleted successfully`,
      })

      // Refresh the cases data after delete
      await fetchCases()
    } catch (error) {
      console.error('Error deleting case:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to delete case',
        variant: "destructive",
      })
    }
  }

  // Filter cases based on search term only
  // Note: Date filtering is already handled by the API (server-side)
  // Client-side date filtering causes timezone issues, so we skip it
  const filteredCases = cases
    .filter((caseItem) => {
      const matchesSearch =
        caseItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        caseItem.externalId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (caseItem.assigneeName && caseItem.assigneeName.toLowerCase().includes(searchTerm.toLowerCase()))

      return matchesSearch
    })
    .sort((a, b) => {
      const aVal = getSortValue(a, sortBy)
      const bVal = getSortValue(b, sortBy)
      
      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return sortDir === 'asc' ? 1 : -1
      if (bVal == null) return sortDir === 'asc' ? -1 : 1
      
      // Compare values
      let comparison = 0
      if (aVal < bVal) comparison = -1
      else if (aVal > bVal) comparison = 1
      
      return sortDir === 'asc' ? comparison : -comparison
    })

  const handleExportTickets = async () => {
    if (filteredCases.length === 0) {
      toast({
        title: "No data to export",
        description: "No cases match the current filters.",
        variant: "destructive",
      })
      return
    }

    try {
      setExporting(true)
      await exportTicketsToExcel(filteredCases)
      toast({
        title: "Export successful",
        description: "Ticket report has been downloaded.",
      })
    } catch (error) {
      console.error("Error exporting tickets:", error)
      toast({
        title: "Export failed",
        description: "Failed to generate Excel file.",
        variant: "destructive",
      })
    } finally {
      setExporting(false)
    }
  }

  // Calculate pagination
  const calculatedTotalPages = Math.ceil(filteredCases.length / pageSize) || 1
  const paginatedCases = filteredCases.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Update total pages when filtered cases change
  useEffect(() => {
    setTotalPages(calculatedTotalPages)
    if (currentPage > calculatedTotalPages) {
      setCurrentPage(Math.max(1, calculatedTotalPages))
    }
  }, [filteredCases.length, pageSize, calculatedTotalPages])

  // Load data on mount and when filters change
  useEffect(() => {
    fetchIntegrations()
    // Fetch user's accessible integrations
    const fetchAccessibleIntegrations = async () => {
      try {
        const response = await fetch("/api/auth/me")
        if (response.ok) {
          const data = await response.json()
          if (data.user) {
            // For admin users, get all integrations
            if (data.user.role === 'administrator') {
              const allIntegrationIds = integrations.map((i) => i.id)
              setAccessibleIntegrationIds(allIntegrationIds)
            } else if (data.user.assignedIntegrations) {
              // For non-admin users, use assigned integrations
              const assignedIds = data.user.assignedIntegrations.map((ai: any) => ai.integrationId)
              setAccessibleIntegrationIds(assignedIds)
            }
          }
        }
      } catch (error) {
        console.error("Error fetching accessible integrations:", error)
      }
    }
    fetchAccessibleIntegrations()
  }, [integrations])

  useEffect(() => {
    if (integrationFilter && integrationFilter.length > 0) {
      setLoading(true)
      setCurrentPage(1) // Reset to page 1 when filters change
      fetchCases().finally(() => setLoading(false))
    }
  }, [integrationFilter, timeRange, statusFilter, severityFilter, useAbsoluteDate, dateRange])

  // Update action case when cases data changes (after sync/update)
  useEffect(() => {
    if (actionCase && actionDialogOpen) {
      const updatedCaseData = cases.find((c) => c.id === actionCase.id)
      if (updatedCaseData) {
        console.log("Updating actionCase with fresh data:", {
          oldAssignee: actionCase.assigneeName,
          newAssignee: updatedCaseData.assigneeName,
        })
        setActionCase(updatedCaseData)
      }
    }
  }, [cases, actionCase?.id, actionDialogOpen])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Security Tickets</h1>
          <p className="text-muted-foreground">
            {syncing ? "Sync in progress..." : "Manage and track security incidents and cases"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportTickets}
            disabled={exporting || loading || syncing || filteredCases.length === 0}
            variant="outline"
            size="sm"
          >
            {exporting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </>
            )}
          </Button>
          <Button onClick={refreshData} disabled={refreshing || syncing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={syncCases}
            disabled={syncing || !integrationFilter || integrationFilter.length === 0}
            size="sm"
          >
            <Sync className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Cases"}
          </Button>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 inline mr-1" />
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.open}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 inline mr-1" />
              Needs attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">
              <Activity className="h-3 w-3 inline mr-1" />
              Being worked on
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 inline mr-1" />
              Completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <p className="text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              High priority
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg MTTR</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgMttr}m</div>
            <p className="text-xs text-muted-foreground">
              <TrendingDown className="h-3 w-3 inline mr-1" />
              Mean time to resolve
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter cases by integration, time range, status, and severity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="integration">Integration</Label>
                <Popover open={integrationPopoverOpen} onOpenChange={setIntegrationPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span>{getIntegrationDisplayLabel()}</span>
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="start">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 py-1">
                        <Checkbox
                          id="integration-all"
                          checked={isAllIntegrations}
                          onCheckedChange={handleSelectAllIntegrations}
                        />
                        <label htmlFor="integration-all" className="text-sm font-medium cursor-pointer flex-1">
                          All Integrations
                        </label>
                      </div>
                      <div className="border-t pt-2">
                        {integrations
                          .filter((i) => user?.role === 'administrator' || accessibleIntegrationIds.includes(i.id))
                          .map((integration) => (
                            <div key={integration.id} className="flex items-center gap-2 py-1">
                              <Checkbox
                                id={`integration-${integration.id}`}
                                checked={integrationFilter.includes(integration.id)}
                                onCheckedChange={(checked) =>
                                  handleSelectIntegration(integration.id, !!checked)
                                }
                              />
                              <label htmlFor={`integration-${integration.id}`} className="text-sm cursor-pointer flex-1">
                                {integration.name}
                              </label>
                            </div>
                          ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeRange">Time Range</Label>
                <Select value={timeRange} onValueChange={setTimeRange} disabled={useAbsoluteDate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12h">Last 12 Hours</SelectItem>
                    <SelectItem value="1d">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="90d">Last 90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="severity">Severity</Label>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severity</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  placeholder="Search cases..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  id="absolute-date"
                  checked={useAbsoluteDate}
                  onCheckedChange={setUseAbsoluteDate}
                />
                <Label htmlFor="absolute-date" className="cursor-pointer">
                  Use Absolute Date Range
                </Label>
              </div>
              {useAbsoluteDate && (
                <div className="flex-1">
                  <DateRangePicker
                    from={dateRange?.from}
                    to={dateRange?.to}
                    onDateRangeChange={setDateRange}
                    placeholder="Select date range"
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cases Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cases ({filteredCases.length})</CardTitle>
          <CardDescription>Showing {paginatedCases.length} of {filteredCases.length} cases</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading cases...</span>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No cases found</h3>
              <p className="text-muted-foreground mb-4">
                {integrationFilter && integrationFilter.length > 0
                  ? "No cases match your current filters. Try adjusting the time range or filters."
                  : "Please select an integration to view cases."}
              </p>
              {integrationFilter && integrationFilter.length > 0 && !isAllIntegrations && (
                <Button onClick={syncCases} disabled={syncing}>
                  <Sync className="h-4 w-4 mr-2" />
                  Sync Cases
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {columns.map((col) => {
                      const w = columnWidths[col.id]
                      const style = w ? { width: `${w}px`, minWidth: `${w}px` } : undefined
                      const isSorted = col.id === sortBy
                      return (
                        <TableHead key={col.id} style={style} className="relative">
                          <div className="flex items-center gap-2 pr-6">
                            <button
                              className="text-sm font-medium flex items-center gap-2 hover:text-foreground transition-colors"
                              onClick={() => handleSort(col.id)}
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
                  {paginatedCases.map((caseItem) => {
                    const StatusIcon = statusIcons[caseItem.status as keyof typeof statusIcons] || AlertCircle
                    return (
                      <TableRow key={`${caseItem.integration?.id || 'unknown'}-${caseItem.id}`}>
                        <TableCell className="font-mono text-sm">#{caseItem.ticketId}</TableCell>
                        <TableCell>
                          <div className="font-medium">{caseItem.name}</div>
                          <div className="text-sm text-muted-foreground">{caseItem.externalId}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              statusColors[caseItem.status as keyof typeof statusColors] || "bg-gray-100 text-gray-800"
                            }
                          >
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {caseItem.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {caseItem.severity ? (
                            <Badge
                              className={
                                severityColors[caseItem.severity as keyof typeof severityColors] ||
                                "bg-gray-100 text-gray-800"
                              }
                            >
                              {caseItem.severity}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50">
                              Not Set
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const src = caseItem.integration?.source
                            const name = caseItem.integration?.name || '-'
                            const colorMap: Record<string, string> = {
                              wazuh: 'bg-blue-100 text-blue-800',
                              qradar: 'bg-purple-100 text-purple-800',
                              'stellar-cyber': 'bg-indigo-100 text-indigo-800',
                              socfortress: 'bg-orange-100 text-orange-800',
                              copilot: 'bg-orange-100 text-orange-800',
                            }
                            const colorClass = (src && colorMap[src]) || 'bg-gray-100 text-gray-800'
                            return (
                              <Badge className={colorClass}>
                                {name}
                              </Badge>
                            )
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {(() => {
                              const displayName = getAssigneeName(caseItem.assignee, caseItem.assigneeName)
                              return (
                                <>
                                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs">
                                    {displayName !== "Unassigned" ? displayName.charAt(0).toUpperCase() : "?"}
                                  </div>
                                  <span className="text-sm">{displayName}</span>
                                </>
                              )
                            })()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(caseItem.createdAt), "yyyy-MM-dd HH:mm:ss")}
                          </div>
                        </TableCell>
                        <TableCell>
                          {renderMttr(caseItem)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleCaseDetail(caseItem)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {hasPermission(useAuthStore.getState().user?.role || '', 'update_case') && (
                              <Button variant="ghost" size="sm" onClick={() => handleCaseAction(caseItem)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {useAuthStore.getState().user?.role === 'administrator' && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeleteCase(caseItem)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && filteredCases.length > 0 && totalPages > 1 && (
            <div className="mt-6 pt-4 border-t">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages} | Total Cases: {filteredCases.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="page-size" className="text-sm">Items per page:</Label>
                    <Select value={pageSize.toString()} onValueChange={(v) => {
                      setPageSize(parseInt(v))
                      setCurrentPage(1)
                    }}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newPage = currentPage - 1
                      setCurrentPage(newPage)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newPage = currentPage + 1
                      setCurrentPage(newPage)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Case Detail Dialog */}
      <CaseDetailDialog case={selectedCase} open={detailDialogOpen} onOpenChange={setDetailDialogOpen} />

      {/* Case Action Dialog */}
      <CaseActionDialog
        case={actionCase}
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        onUpdate={handleCaseUpdate}
      />
    </div>
  )
}
