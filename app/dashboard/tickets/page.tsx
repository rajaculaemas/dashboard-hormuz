"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/stores/auth-store"
import { hasPermission } from "@/lib/auth/password"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { CaseDetailDialog } from "@/components/case/case-detail-dialog"
import { CaseActionDialog } from "@/components/case/case-action-dialog"
import { ASSIGNEES } from "@/components/case/case-action-dialog"
import { formatDistanceToNow } from "date-fns"
import { format } from "date-fns"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Switch } from "@/components/ui/switch"

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
  const [selectedIntegration, setSelectedIntegration] = useState<string>("all")
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
    // For QRadar: MTTR = Case Created - Alert Created
    // - Alert Created = createdAt (mapped from alert.timestamp in API)
    // - Case Created = updatedAt (mapped from alert.updatedAt in API)
    
    console.log("computeQRadarMttrMinutes input:", { 
      createdAt: qradarCase?.createdAt,
      updatedAt: qradarCase?.updatedAt
    })
    
    // Alert created time - when the alert/offense first appeared (API maps a.timestamp to createdAt)
    const alertCreatedMs = toMillis(qradarCase?.createdAt)
    
    // Case created time - when alert was marked as follow-up (API maps a.updatedAt to updatedAt)
    const caseCreatedMs = toMillis(qradarCase?.updatedAt)
    
    console.log("Converted timestamps:", { alertCreatedMs, caseCreatedMs })
    
    // Both timestamps must be valid
    if (!Number.isFinite(alertCreatedMs) || !Number.isFinite(caseCreatedMs)) {
      console.log("Invalid timestamps, returning null")
      return null
    }
    
    // MTTR = time from alert created to case created (when marked as follow-up)
    const diffMinutes = Math.max(0, Math.round((caseCreatedMs - alertCreatedMs) / 60000))
    console.log("Computed MTTR:", diffMinutes, "minutes")
    return diffMinutes
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
        // Auto-select first integration if none selected
        if (!selectedIntegration && data.data.length > 0) {
          setSelectedIntegration(data.data[0].id)
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
    if (!selectedIntegration) return

    try {
      // Handle "all" integrations
      if (selectedIntegration === "all") {
        console.log("Fetching cases from all integrations")
        console.log("Available integrations:", integrations.map(i => ({ id: i.id, name: i.name, source: i.source })))
        
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
        for (const integration of integrations) {
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
                const transformedCases = data.cases.map((wazuhCase: any) => {
                  const mttrMinutes = computeWazuhMttrMinutes(wazuhCase)
                  if (mttrMinutes !== null && mttrMinutes !== undefined) {
                    mttrSum += mttrMinutes
                    mttrCount += 1
                  }

                  return {
                  id: wazuhCase.id,
                  externalId: wazuhCase.caseNumber,
                  name: wazuhCase.title || `Case ${wazuhCase.caseNumber}`,
                  status: wazuhCase.status === "open" ? "New" : wazuhCase.status === "in_progress" ? "In Progress" : "Resolved",
                  severity: wazuhCase.severity || null,
                  assignee: wazuhCase.assignee?.name || wazuhCase.assignee?.email || null,
                  assigneeName: wazuhCase.assignee?.name || null,
                  createdAt: new Date(wazuhCase.createdAt),
                  modifiedAt: wazuhCase.updatedAt ? new Date(wazuhCase.updatedAt) : null,
                  ticketId: parseInt(wazuhCase.caseNumber) || 0,
                  score: null,
                  size: wazuhCase.alertCount,
                  integration: {
                    id: integration.id,
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
            } else {
              console.log(`Fetching Stellar Cyber cases from: ${integration.name}`)
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
              console.log(`Stellar Cyber response for ${integration.name}:`, data)

              if (data.success) {
                // Apply front-end filtering for status and severity as additional safety
                let filteredData = data.data
                if (statusFilter && statusFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.status === statusFilter)
                }
                if (severityFilter && severityFilter !== "all") {
                  filteredData = filteredData.filter((c: any) => c.severity === severityFilter)
                }
                
                // Compute MTTR for QRadar and Stellar Cyber cases
                const casesWithMttr = filteredData.map((c: any) => {
                  let mttrMinutes = null
                  
                  if (integration.source === "qradar" || integration.name?.toLowerCase().includes("qradar")) {
                    mttrMinutes = computeQRadarMttrMinutes(c)
                  } else if (integration.source === "stellar-cyber" || integration.name?.toLowerCase().includes("stellar")) {
                    // For Stellar Cyber cases
                    mttrMinutes = computeStellarMttrMinutes(c)
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
        console.log("Fetched cases from all integrations:", allCases.length)
        return
      }

      console.log("Fetching cases with params:", {
        integrationId: selectedIntegration,
        time_range: timeRange,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
      })

      // Check if selected integration is Wazuh
      const integration = integrations.find((i) => i.id === selectedIntegration)
      const isWazuh = integration?.source === "wazuh" || integration?.name?.toLowerCase().includes("wazuh")

      let response
      let data

      if (isWazuh) {
        // Fetch from Wazuh API - always include date parameters
        const shouldUseAbsolute = useAbsoluteDate && dateRange
        const params = new URLSearchParams({
          ...(shouldUseAbsolute && { from_date: formatLocalDate(dateRange.from) }),
          ...(shouldUseAbsolute && { to_date: formatLocalDate(dateRange.to) }),
          ...(!shouldUseAbsolute && { time_range: timeRange }),
          ...(statusFilter && statusFilter !== "all" && { status: statusFilter }),
          ...(severityFilter && severityFilter !== "all" && { severity: severityFilter }),
        })
        response = await fetch(`/api/wazuh/cases?${params}`)
        data = await response.json()

        if (data.cases) {
          // Transform Wazuh cases to match Case interface
          let mttrSum = 0
          let mttrCount = 0
          const transformedCases = data.cases.map((wazuhCase: any) => {
            const mttrMinutes = computeWazuhMttrMinutes(wazuhCase)
            if (mttrMinutes !== null && mttrMinutes !== undefined) {
              mttrSum += mttrMinutes
              mttrCount += 1
            }

            return {
            id: wazuhCase.id,
            externalId: wazuhCase.caseNumber,
            name: wazuhCase.title || `Case ${wazuhCase.caseNumber}`,
            status: wazuhCase.status === "open" ? "New" : wazuhCase.status === "in_progress" ? "In Progress" : "Resolved",
            severity: wazuhCase.severity || null,
            assignee: wazuhCase.assignee?.name || wazuhCase.assignee?.email || null,
            assigneeName: wazuhCase.assignee?.name || null,
            createdAt: new Date(wazuhCase.createdAt),
            modifiedAt: wazuhCase.updatedAt ? new Date(wazuhCase.updatedAt) : null,
            ticketId: parseInt(wazuhCase.caseNumber) || 0,
            score: null,
            size: wazuhCase.alertCount,
            integration: {
              id: selectedIntegration,
              name: integration?.name || "Wazuh",
              source: "wazuh",
            },
            // Include alerts data from Wazuh case
            alerts: wazuhCase.alerts || [],
            mttrMinutes,
          }
          })
          setCases(transformedCases)
          
          // Calculate stats
          const stats = {
            total: data.cases.length,
            open: data.cases.filter((c: any) => c.status === "open").length,
            inProgress: data.cases.filter((c: any) => c.status === "in_progress").length,
            resolved: data.cases.filter((c: any) => c.status === "resolved").length,
            critical: data.cases.filter((c: any) => c.severity === "Critical").length,
            avgMttr: mttrCount > 0 ? Math.round(mttrSum / mttrCount) : 0,
          }
          setStats(stats)
          console.log("Fetched Wazuh cases:", data.cases.length)
        }
      } else {
        // Fetch from Stellar Cyber API (original logic)
        const params = new URLSearchParams({
          integrationId: selectedIntegration,
          ...(useAbsoluteDate && dateRange && { from_date: formatLocalDate(dateRange.from) }),
          ...(useAbsoluteDate && dateRange && { to_date: formatLocalDate(dateRange.to) }),
          ...(!useAbsoluteDate && { time_range: timeRange }),
          ...(statusFilter && statusFilter !== "all" && { status: statusFilter }),
          ...(severityFilter && severityFilter !== "all" && { severity: severityFilter }),
        })

        response = await fetch(`/api/cases?${params}`)
        data = await response.json()

        if (data.success) {
          // Compute MTTR for QRadar and Stellar Cyber cases
          const isQRadar = integration?.source === "qradar" || integration?.name?.toLowerCase().includes("qradar")
          const isStellarCyber = integration?.source === "stellar-cyber" || integration?.name?.toLowerCase().includes("stellar")
          let mttrSum = 0
          let mttrCount = 0
          
          const casesWithMttr = data.data.map((c: any) => {
            let mttrMinutes = null
            
            if (isQRadar) {
              console.log("QRadar case data:", { id: c.id, timestamp: c.createdAt, updatedAt: c.updatedAt })
              mttrMinutes = computeQRadarMttrMinutes(c)
              console.log("Computed MTTR for case:", c.id, "=", mttrMinutes, "minutes")
            } else if (isStellarCyber) {
              console.log("Stellar Cyber case data:", { id: c.id, createdAt: c.createdAt, latestAlertTime: c.metadata?.latest_alert_time })
              mttrMinutes = computeStellarMttrMinutes(c)
              console.log("Computed MTTR for case:", c.id, "=", mttrMinutes, "minutes")
            }
            
            if (mttrMinutes !== null && mttrMinutes !== undefined) {
              mttrSum += mttrMinutes
              mttrCount += 1
            }
            return { ...c, mttrMinutes }
          })
          
          setCases(casesWithMttr)
          setStats({
            total: data.stats?.total ?? data.data.length,
            open: data.stats?.open ?? 0,
            inProgress: data.stats?.inProgress ?? 0,
            resolved: data.stats?.resolved ?? 0,
            critical: data.stats?.critical ?? 0,
            avgMttr: mttrCount > 0 ? Math.round(mttrSum / mttrCount) : (data.stats?.avgMttr ?? data.stats?.avgMttd ?? 0),
          })
          console.log("Fetched Stellar Cyber cases:", data.data.length)
        } else {
          console.error("Failed to fetch cases:", data.error)
          toast({
            title: "Error",
            description: data.error || "Failed to fetch cases",
            variant: "destructive",
          })
        }
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
    if (!selectedIntegration) {
      toast({
        title: "Error",
        description: "Please select an integration first",
        variant: "destructive",
      })
      return
    }

    setSyncing(true)
    try {
      // Handle sync all integrations
      if (selectedIntegration === "all") {
        console.log("Starting case sync for all integrations")
        
        for (const integration of integrations) {
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
          description: "Sync completed for all integrations",
        })

        // Auto refresh data after successful sync
        console.log("Sync completed for all integrations, refreshing data...")
        await fetchCases()
        await fetchIntegrations()
        return
      }

      // Original single integration sync
      console.log("Starting case sync for integration:", selectedIntegration)

      const response = await fetch("/api/cases/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integrationId: selectedIntegration,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: `Sync completed: ${data.stats.created} new, ${data.stats.updated} updated`,
        })

        // Auto refresh data after successful sync
        console.log("Sync completed, refreshing data...")
        await fetchCases()
        await fetchIntegrations() // Refresh to update last sync time
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to sync cases",
          variant: "destructive",
        })
      }
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

  // Filter cases based on search term and date range
  const filteredCases = cases.filter((caseItem) => {
    const matchesSearch =
      caseItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      caseItem.externalId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (caseItem.assigneeName && caseItem.assigneeName.toLowerCase().includes(searchTerm.toLowerCase()))

    // Filter by absolute date range if enabled
    let matchesDateRange = true
    if (useAbsoluteDate && dateRange) {
      const caseTime = new Date(caseItem.createdAt).getTime()
      const fromTime = dateRange.from.getTime()
      const toTime = dateRange.to.getTime()
      matchesDateRange = caseTime >= fromTime && caseTime <= toTime
    }

    return matchesSearch && matchesDateRange
  })

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
    if (selectedIntegration) {
      setLoading(true)
      setCurrentPage(1) // Reset to page 1 when filters change
      fetchCases().finally(() => setLoading(false))
    }
  }, [selectedIntegration, timeRange, statusFilter, severityFilter, useAbsoluteDate, dateRange])

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
          <Button onClick={refreshData} disabled={refreshing || syncing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={syncCases}
            disabled={syncing || !selectedIntegration}
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
                <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                  <SelectTrigger>
                    <SelectValue 
                      placeholder={
                        selectedIntegration === "all"
                          ? "All Integrations"
                          : integrations.find((i) => i.id === selectedIntegration)?.name || "Select integration"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Integrations</SelectItem>
                    {integrations
                      .filter((i) => user?.role === 'administrator' || accessibleIntegrationIds.includes(i.id))
                      .map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          {integration.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
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
                {selectedIntegration
                  ? "No cases match your current filters. Try adjusting the time range or filters."
                  : "Please select an integration to view cases."}
              </p>
              {selectedIntegration && selectedIntegration !== "all" && (
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
                  <TableRow>
                    <TableHead>Ticket ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>MTTR</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCases.map((caseItem) => {
                    const StatusIcon = statusIcons[caseItem.status as keyof typeof statusIcons] || AlertCircle
                    return (
                      <TableRow key={caseItem.id}>
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
