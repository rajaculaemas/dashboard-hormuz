"use client"

import * as clipboard from "clipboard-polyfill"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Filter, RefreshCw, AlertCircle, Download, Copy, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { useAlertStore } from "@/lib/stores/alert-store"
import { useIntegrationStore } from "@/lib/stores/integration-store"
import { useAuthStore } from "@/lib/stores/auth-store"
import { hasPermission } from "@/lib/auth/password"
import type { AlertStatus } from "@/lib/config/stellar-cyber"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ASSIGNEES, QRADAR_ASSIGNEES } from "@/components/case/case-action-dialog"
import { SafeDate } from "@/components/ui/safe-date"
import { Switch } from "@/components/ui/switch"
import { SyncStatus } from "@/components/alert/sync-status"
import { EventDetailDialog } from "@/components/alert/event-detail-dialog"
import { AddToCaseDialog } from "@/components/alert/add-to-case-dialog"
import { AlertDetailDialog } from "@/components/alert/alert-detail-dialog"
import { WazuhAlertDetailDialog } from "@/components/alert/wazuh-alert-detail-dialog"
import { WazuhAddToCaseDialog } from "@/components/alert/wazuh-add-to-case-dialog"
import { QRadarAlertDetailDialog } from "@/components/alert/qradar-alert-detail-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { AlertTable } from "@/components/alert/alert-table"
import { AlertColumnSelector, DEFAULT_COLUMNS, type AlertColumn } from "@/components/alert/alert-column-selector"

export default function AlertPanel() {
  const {
    alerts,
    loading,
    error,
    activeTab,
    filters,
    searchQuery,
    autoRefresh,
    lastSync,
    fetchAlerts,
    updateAlertStatus,
    setActiveTab,
    setFilters,
    setSearchQuery,
    setAutoRefresh,
    syncAlerts,
    getFilteredAlerts,
    startAutoRefresh,
    stopAutoRefresh,
  } = useAlertStore()

  const { integrations, fetchIntegrations } = useIntegrationStore()
  const { user } = useAuthStore()
  const canUpdateAlert = user ? hasPermission(user.role, 'update_alert_status') : false
  
  // Debug log
  useEffect(() => {
    console.log('[Dashboard] Current user:', user)
    console.log('[Dashboard] canUpdateAlert:', canUpdateAlert)
    console.log('[Dashboard] user role:', user?.role)
  }, [user, canUpdateAlert])
  
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<any>(null)
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([])
  const [addToCaseDialogOpen, setAddToCaseDialogOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<AlertStatus>("In Progress")
  const [comments, setComments] = useState("")
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [copiedAlertId, setCopiedAlertId] = useState(false)
  const [copiedRawData, setCopiedRawData] = useState(false)
  const [showRelatedEventsModal, setShowRelatedEventsModal] = useState(false)
  const [relatedEvents, setRelatedEvents] = useState<any[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [closingReasons, setClosingReasons] = useState<Array<{ id: number; text: string }>>([])
  const [selectedClosingReason, setSelectedClosingReason] = useState<number | null>(null)
  const [showClosingReasonDialog, setShowClosingReasonDialog] = useState(false)
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [showEventDetailModal, setShowEventDetailModal] = useState(false)
  const [showAlertDetailModal, setShowAlertDetailModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [paginationData, setPaginationData] = useState<any>(null)
  const [wazuhAddToCaseOpen, setWazuhAddToCaseOpen] = useState(false)
  const [wazuhCaseAlertIds, setWazuhCaseAlertIds] = useState<string[]>([])
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null)
  const [severityBasedOnAnalysis, setSeverityBasedOnAnalysis] = useState<string | null>(null)
  const [analysisNotes, setAnalysisNotes] = useState("")
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [appUsers, setAppUsers] = useState<Array<{ id: string; name: string }>>([{ id: "admin-user-1", name: "Admin" }])
  const [showUpdateStatusDialog, setShowUpdateStatusDialog] = useState(false)
  const [pendingSearchQuery, setPendingSearchQuery] = useState("")
  const [useAbsoluteDate, setUseAbsoluteDate] = useState(false)
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>(undefined)
  const [accessibleIntegrationIds, setAccessibleIntegrationIds] = useState<string[]>([])
  const [allFilteredAlerts, setAllFilteredAlerts] = useState<any[]>([])
  const [alertColumns, setAlertColumns] = useState<AlertColumn[]>(DEFAULT_COLUMNS)

  // Set default integration saat komponen mount
  useEffect(() => {
    // Set "All Integrations" as default (null means show all)
    setSelectedIntegration(null)
  }, [integrations])

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Fetch accessible integrations for current user
  useEffect(() => {
    const fetchAccessibleIntegrations = async () => {
      try {
        const response = await fetch('/api/auth/me')
        const data = await response.json()
        if (data.success && data.user) {
          // For admin users, get all integrations
          if (data.user.role === 'administrator') {
            const allIntegrations = Array.isArray(integrations) ? integrations : []
            const allIntegrationIds = allIntegrations.map((i: any) => i.id)
            setAccessibleIntegrationIds(allIntegrationIds)
          } else if (data.user.assignedIntegrations) {
            // For non-admin users, use assigned integrations
            const integrationIds = data.user.assignedIntegrations.map((ai: any) => ai.integrationId)
            setAccessibleIntegrationIds(integrationIds)
          }
        }
      } catch (error) {
        console.error('Failed to fetch accessible integrations:', error)
      }
    }
    fetchAccessibleIntegrations()
  }, [integrations])

  // Fetch application users for Wazuh alert assignee
  useEffect(() => {
    const fetchAppUsers = async () => {
      try {
        const response = await fetch("/api/users")
        const data = await response.json()
        if (data.success && Array.isArray(data.users)) {
          setAppUsers(data.users.map((user: any) => ({ id: user.id, name: user.name })))
        }
      } catch (error) {
        console.error("Failed to fetch app users:", error)
        // Keep default admin user
      }
    }
    fetchAppUsers()
  }, [])

  // Fetch closing reasons when a QRadar alert is selected
  useEffect(() => {
    const fetchClosingReasons = async () => {
      if (!selectedAlert?.metadata?.qradar || !selectedIntegration) return

      try {
        const response = await fetch(`/api/qradar/closing-reasons?integrationId=${selectedIntegration}`)
        const data = await response.json()
        if (data.success) {
          setClosingReasons(data.reasons || [])
        }
      } catch (error) {
        console.error("Failed to fetch closing reasons:", error)
      }
    }

    fetchClosingReasons()
    // set selected assignee when opening details
    if (selectedAlert) {
      setSelectedAssignee(selectedAlert.metadata?.assignee || null)
    } else {
      setSelectedAssignee(null)
    }
  }, [selectedAlert?.metadata?.qradar, selectedIntegration])

  // Convert local date to YYYY-MM-DD format string for API
  // This preserves the user's local date regardless of timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const loadAlerts = async (page: number = 1, size: number = pageSize, search?: string) => {
    try {
      setRefreshing(true)

      // Build query parameters with proper timezone handling
      const params = new URLSearchParams()

      if (selectedIntegration) {
        params.append("integrationId", selectedIntegration)
      }

      // Add pagination parameters
      params.append("page", page.toString())
      params.append("limit", size.toString())

      // Set time range based on current filter
      const now = new Date()
      let fromDate: Date

      if (useAbsoluteDate && dateRange) {
        // Use absolute date range from picker
        fromDate = dateRange.from
        params.append("from_date", formatLocalDate(dateRange.from))
        params.append("to_date", formatLocalDate(dateRange.to))
        params.append("time_range", "custom")
      } else {
        // Use relative time range
        switch (filters.timeRange) {
          case "1h":
            fromDate = new Date(now.getTime() - 60 * 60 * 1000)
            break
          case "2h":
            fromDate = new Date(now.getTime() - 2 * 60 * 60 * 1000)
            break
          case "3h":
            fromDate = new Date(now.getTime() - 3 * 60 * 60 * 1000)
            break
          case "6h":
            fromDate = new Date(now.getTime() - 6 * 60 * 60 * 1000)
            break
          case "12h":
            fromDate = new Date(now.getTime() - 12 * 60 * 60 * 1000)
            break
          case "24h":
            fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            break
          case "7d":
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          default:
            fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000) // Default to 24h
        }
        params.append("time_range", filters.timeRange || "7d")
      }

      if (filters.status && filters.status !== "all") {
        params.append("status", filters.status)
      }

      if (filters.severity && filters.severity !== "all") {
        params.append("severity", filters.severity)
      }

      // Add search query parameter if provided
      if (search !== undefined) {
        params.append("search", search)
      }

      console.log("Loading alerts with params:", Object.fromEntries(params))

      const response = await fetch(`/api/alerts?${params.toString()}`)
      const data = await response.json()

      console.log("Alert API response:", data)

      if (data.success) {
        // Update the alert store and pagination info
        useAlertStore.setState({
          alerts: data.data || [],
          loading: false,
          error: null,
        })
        // Update pagination state
        setCurrentPage(data.pagination?.page || 1)
        setTotalPages(data.pagination?.pages || 1)
        setPaginationData(data.pagination)
      } else {
        console.error("Failed to fetch alerts:", data.error)
        useAlertStore.setState({
          alerts: [],
          loading: false,
          error: data.error,
        })
      }
    } catch (error) {
      console.error("Failed to fetch alerts:", error)
      useAlertStore.setState({
        alerts: [],
        loading: false,
        error: "Failed to fetch alerts",
      })
    } finally {
      setRefreshing(false)
    }
  }

  // Fetch all alerts matching filters (without pagination) for statistics
  const loadAllFilteredAlerts = async () => {
    try {
      const params = new URLSearchParams()

      if (selectedIntegration) {
        params.append("integrationId", selectedIntegration)
      }

      // Set high limit to get all matching alerts
      params.append("limit", "10000")
      params.append("page", "1")

      // Set time range based on current filter
      const now = new Date()

      if (useAbsoluteDate && dateRange) {
        params.append("from_date", formatLocalDate(dateRange.from))
        params.append("to_date", formatLocalDate(dateRange.to))
        params.append("time_range", "custom")
      } else {
        params.append("time_range", filters.timeRange || "7d")
      }

      if (filters.status && filters.status !== "all") {
        params.append("status", filters.status)
      }

      if (filters.severity && filters.severity !== "all") {
        params.append("severity", filters.severity)
      }

      console.log("Loading all filtered alerts with params:", Object.fromEntries(params))

      const response = await fetch(`/api/alerts?${params.toString()}`)
      const data = await response.json()

      console.log("All filtered alerts response:", data)

      if (data.success) {
        setAllFilteredAlerts(data.data || [])
      } else {
        setAllFilteredAlerts([])
      }
    } catch (error) {
      console.error("Failed to fetch all filtered alerts:", error)
      setAllFilteredAlerts([])
    }
  }

  const handleSyncAlerts = async () => {
    if (!selectedIntegration) return

    try {
      setSyncing(true)
      await syncAlerts(selectedIntegration)
      // After sync completes, refresh the alerts
      await loadAlerts()
      await loadAllFilteredAlerts()
    } catch (error) {
      console.error("Failed to sync alerts:", error)
    } finally {
      setSyncing(false)
    }
  }

  // Sync alerts from all integrations
  const handleSyncAllIntegrations = async () => {
    try {
      setSyncing(true)
      console.log("Starting sync for all integrations...")

      // Get available integrations
      const integrationsToSync = Array.isArray(integrations) ? integrations : []

      // Sync each integration sequentially
      for (const integration of integrationsToSync) {
        try {
          console.log(`Syncing integration: ${integration.name} (${integration.id})`)
          await syncAlerts(integration.id)
        } catch (error) {
          console.error(`Failed to sync ${integration.name}:`, error)
          // Continue with next integration even if one fails
        }
      }

      console.log("All integrations synced, refreshing alerts...")
      // After all syncs complete, refresh the alerts
      await loadAlerts()
      await loadAllFilteredAlerts()
    } catch (error) {
      console.error("Failed to sync all integrations:", error)
    } finally {
      setSyncing(false)
    }
  }

  // Auto-sync effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout

    const startAutoSync = () => {
      // First sync immediately (all integrations)
      handleSyncAllIntegrations()
      // Then set up interval for every 3 minutes (180000 ms)
      intervalId = setInterval(handleSyncAllIntegrations, 270000)
    }

    if (autoRefresh) {
      startAutoSync()
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [autoRefresh])

  useEffect(() => {
    // Don't auto-load alerts on mount - wait for user action
    fetchIntegrations()
  }, [])

  // Load alerts when selected integration changes (skip if no alerts loaded yet)
  useEffect(() => {
    if (selectedIntegration && alerts.length > 0) {
      loadAlerts()
      loadAllFilteredAlerts()
    }
  }, [selectedIntegration])

  // Load alerts when absolute date range changes (only if already loaded)
  useEffect(() => {
    if (useAbsoluteDate && dateRange && alerts.length > 0) {
      loadAlerts()
      loadAllFilteredAlerts()
    }
  }, [useAbsoluteDate, dateRange])

  // Helper function to determine which status options to show
  const getStatusOptionsForSource = () => {
    const integration = integrations.find((i) => i.id === selectedIntegration)

    if (integration) {
      const name = (integration.name || "").toLowerCase()
      if (integration.source === "qradar" || name.includes("qradar")) {
        return [
          { value: "all", label: "All Status" },
          { value: "New", label: "OPEN" },
          { value: "In Progress", label: "FOLLOW_UP" },
          { value: "Closed", label: "CLOSED" },
        ]
      }
      if (integration.source === "wazuh" || name.includes("wazuh")) {
        return [
          { value: "all", label: "All Status" },
          { value: "New", label: "New" },
          { value: "In Progress", label: "In Progress" },
          { value: "Closed", label: "Closed" },
        ]
      }
    }

    // Default Stellar Cyber statuses
    return [
      { value: "all", label: "All Status" },
      { value: "New", label: "New" },
      { value: "In Progress", label: "In Progress" },
      { value: "Ignored", label: "Ignored" },
      { value: "Closed", label: "Closed" },
    ]
  }

  // Helper variables
  const availableIntegrations = Array.isArray(integrations) 
    ? integrations.filter(i => 
        user?.role === 'administrator' || accessibleIntegrationIds.includes(i.id)
      ) 
    : []

  const alertsArray = Array.isArray(alerts) ? alerts : []

  const filteredAlerts = getFilteredAlerts ? getFilteredAlerts() : alertsArray

  // Use allFilteredAlerts for statistics (all data matching filters, not just current page)
  const chartData = [
    { name: "Critical", value: allFilteredAlerts.filter((a) => a.severity === "Critical").length },
    { name: "High", value: allFilteredAlerts.filter((a) => a.severity === "High").length },
    { name: "Medium", value: allFilteredAlerts.filter((a) => a.severity === "Medium").length },
    { name: "Low", value: allFilteredAlerts.filter((a) => a.severity === "Low").length },
  ]

  // Calculate alerts by integration using allFilteredAlerts
  // Count alerts by integration robustly (handles different field shapes)
  const integrationChartData = availableIntegrations
    .map((integration) => {
      const count = allFilteredAlerts.filter((a) => {
        const alertIntegrationId =
          a.integrationId || a.integration_id || a.integration?.id
        return alertIntegrationId === integration.id
      }).length
      return { name: integration.name, value: count }
    })
    .filter((item) => item.value > 0)

  // Colors for pie chart
  const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F"]

  // Helper functions
  const truncateAlertId = (id: string, length = 20) => {
    return id.length > length ? id.substring(0, length) + "..." : id
  }

  const copyToClipboard = (text: string, type: string) => {
    clipboard.writeText(text).then(() => {
      if (type === "alertId") {
        setCopiedAlertId(true)
        setTimeout(() => setCopiedAlertId(false), 2000)
      } else if (type === "rawData") {
        setCopiedRawData(true)
        setTimeout(() => setCopiedRawData(false), 2000)
      }
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

  const fetchRelatedEvents = async (offenseId: number) => {
    try {
      setLoadingEvents(true)
      const response = await fetch(`/api/qradar/events?offenseId=${offenseId}&integrationId=${selectedIntegration}`)
      const data = await response.json()
      if (data.success) {
        setRelatedEvents(data.events || [])
      }
      setShowRelatedEventsModal(true)
    } catch (error) {
      console.error("Failed to fetch related events:", error)
    } finally {
      setLoadingEvents(false)
    }
  }

  const handleUpdateStatus = async () => {
    if (!selectedAlert) return

    // For QRadar alerts, assignee is required
    if (selectedAlert.metadata?.qradar && !selectedAssignee) {
      alert("Please assign the alert to a user before updating status")
      return
    }

    // For QRadar CLOSED status, show closing reason dialog
    if (selectedAlert.metadata?.qradar && updateStatus === "Closed" && !selectedClosingReason) {
      setShowClosingReasonDialog(true)
      return
    }

    try {
      setIsUpdatingStatus(true)
      const body: any = {
        status: updateStatus,
        comments,
      }

      // For Wazuh alerts, include severity
      if (selectedAlert.metadata?.wazuh || selectedAlert.source === "wazuh") {
        if (selectedSeverity) {
          body.severity = selectedSeverity
        }
      }

      // Always include custom analysis fields (stored locally)
      if (severityBasedOnAnalysis) {
        body.severityBasedOnAnalysis = severityBasedOnAnalysis
      }
      if (analysisNotes) {
        body.analysisNotes = analysisNotes
      }

      // For QRadar, include closing reason and create ticket if FOLLOW_UP
      if (selectedAlert.metadata?.qradar) {
        body.isQRadar = true
        if (selectedAssignee) {
          body.assignedTo = selectedAssignee
        }
        if (updateStatus === "Closed" && selectedClosingReason) {
          body.closingReasonId = selectedClosingReason
        }
        if (updateStatus === "In Progress") {
          // FOLLOW_UP in QRadar terminology - create ticket
          body.shouldCreateTicket = true
        }
      }

      const response = await fetch(`/api/alerts/${selectedAlert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const result = await response.json()
        console.log("[Dashboard] Alert status updated successfully:", result)
        
        // Refresh alerts after update
        await loadAlerts()
        
        // If alert detail modal is open, fetch fresh data for that alert
        if (showAlertDetailModal && selectedAlert) {
          // Find the updated alert from the refreshed list
          const updatedAlertFromList = alertsArray.find((a) => a.id === selectedAlert.id)
          if (updatedAlertFromList) {
            setSelectedAlert(updatedAlertFromList)
          }
        } else {
          setSelectedAlert(null)
        }
        
        setUpdateStatus("In Progress")
        setComments("")
        setSelectedClosingReason(null)
        setShowClosingReasonDialog(false)
        setSelectedSeverity(null)
        setSelectedAssignee(null)
        setSeverityBasedOnAnalysis(null)
        setAnalysisNotes("")
        setShowUpdateStatusDialog(false)
      }
    } catch (error) {
      console.error("Failed to update alert status:", error)
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Alert Panel</h1>
          <p className="text-muted-foreground">Monitor and respond to security alerts in real-time</p>
          {lastSync && (
            <p className="text-xs text-muted-foreground mt-1">
              Last sync: <SafeDate date={lastSync.toISOString()} />
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto-refresh toggle - now controls auto-sync */}
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={(checked) => {
                setAutoRefresh(checked)
              }}
            />
            <Label htmlFor="auto-refresh" className="text-sm">
              Auto-sync (3m)
            </Label>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadAlerts()
              // refresh stats dataset alongside the list refresh
              setTimeout(() => {
                loadAllFilteredAlerts()
              }, 0)
            }}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button 
            variant="default" 
            size="sm" 
            onClick={handleSyncAllIntegrations} 
            disabled={syncing}
            className="hidden"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            Sync Alerts
          </Button>

          <div className="flex items-center gap-2">
            <Select
              value={selectedIntegration === null ? "all" : (selectedIntegration || "")}
              onValueChange={(id) => {
                useAlertStore.getState().setSelectedIntegration(id === "all" ? null : id)
                setSelectedIntegration(id === "all" ? null : id)
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue
                  placeholder={
                    selectedIntegration === null
                      ? "All Integrations"
                      : selectedIntegration
                      ? availableIntegrations.find((i) => i.id === selectedIntegration)?.name
                      : "Select integration"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Integrations
                </SelectItem>
                {availableIntegrations.map((integration) => (
                  <SelectItem key={integration.id} value={integration.id}>
                    {integration.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (selectedIntegration === null) {
                  handleSyncAllIntegrations()
                } else {
                  handleSyncAlerts()
                }
                // also refresh stats dataset explicitly
                setTimeout(() => {
                  loadAllFilteredAlerts()
                }, 0)
              }} 
              disabled={syncing}
            >
              <Download className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync Alerts"}
            </Button>
          </div>

          {/* Filter Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Filter Alerts</h4>
                  <p className="text-sm text-muted-foreground">Customize your alert view</p>
                </div>
                <div className="grid gap-2">
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="timeRange">Time Range</Label>
                    <Select
                      value={filters.timeRange}
                      onValueChange={(value) => {
                        setFilters({ timeRange: value as any })
                        setTimeout(() => {
                          loadAlerts()
                          loadAllFilteredAlerts()
                        }, 0)
                      }}
                      disabled={useAbsoluteDate}
                    >
                      <SelectTrigger className="col-span-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1h">Last 1 hour</SelectItem>
                        <SelectItem value="2h">Last 2 hours</SelectItem>
                        <SelectItem value="3h">Last 3 hours</SelectItem>
                        <SelectItem value="6h">Last 6 hours</SelectItem>
                        <SelectItem value="12h">Last 12 hours</SelectItem>
                        <SelectItem value="24h">Last 24 hours</SelectItem>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="all">All time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="absoluteDate" className="col-span-3 flex items-center gap-2">
                      <Switch
                        id="absoluteDate"
                        checked={useAbsoluteDate}
                        onCheckedChange={setUseAbsoluteDate}
                      />
                      <span className="text-sm">Use Absolute Date</span>
                    </Label>
                  </div>
                  {useAbsoluteDate && (
                    <div className="col-span-3 pt-2 border-t">
                      <DateRangePicker
                        from={dateRange?.from}
                        to={dateRange?.to}
                        onDateRangeChange={(range) => {
                          setDateRange(range)
                          setTimeout(() => {
                            loadAlerts()
                            loadAllFilteredAlerts()
                          }, 0)
                        }}
                        placeholder="Select date range"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={filters.status}
                      onValueChange={(value) => {
                        setFilters({ status: value as any })
                        setTimeout(() => {
                          loadAlerts()
                          loadAllFilteredAlerts()
                        }, 0)
                      }}
                    >
                      <SelectTrigger className="col-span-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getStatusOptionsForSource().map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <Label htmlFor="severity">Severity</Label>
                    <Select
                      value={filters.severity}
                      onValueChange={(value) => {
                        setFilters({ severity: value })
                        setTimeout(() => {
                          loadAlerts()
                          loadAllFilteredAlerts()
                        }, 0)
                      }}
                    >
                      <SelectTrigger className="col-span-2">
                        <SelectValue />
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
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-red-600 font-medium">Error saat mengambil data alert:</p>
                <p className="text-red-600">{error}</p>
                <p className="text-sm text-red-500 mt-2">
                  Pastikan integrasi Stellar Cyber sudah dikonfigurasi dengan benar dan kredensial valid. Coba refresh
                  halaman atau periksa log server untuk informasi lebih lanjut.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <SyncStatus />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Alert Overview</CardTitle>
            <CardDescription>Current security alerts by severity</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {loading ? (
              <div className="h-[300px] flex items-center justify-center w-full">
                <Skeleton className="h-[250px] w-full" />
              </div>
            ) : (
              <ChartContainer
                config={{
                  value: {
                    label: "Count",
                    color: "hsl(var(--chart-1))",
                  },
                }}
                className="h-[300px] w-full px-4"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Alert Statistics</CardTitle>
            <CardDescription>Summary of all current alert status (based on filters)</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total Alerts</span>
                  <Badge variant="outline" className="text-lg">
                    {allFilteredAlerts.length}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">New</span>
                  <Badge variant="outline" className="bg-red-500/10 text-red-500">
                    {allFilteredAlerts.filter((a) => a.status === "New").length}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">In Progress</span>
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500">
                    {allFilteredAlerts.filter((a) => a.status === "In Progress").length}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Ignored</span>
                  <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
                    {allFilteredAlerts.filter((a) => a.status === "Ignored").length}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Closed</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500">
                    {allFilteredAlerts.filter((a) => a.status === "Closed").length}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Alerts by Integration</CardTitle>
            <CardDescription>Alert distribution per integration</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {loading ? (
              <div className="h-[300px] flex items-center justify-center w-full">
                <Skeleton className="h-[250px] w-full" />
              </div>
            ) : integrationChartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center w-full">
                <p className="text-muted-foreground">No alerts to display</p>
              </div>
            ) : (
              <ChartContainer
                config={{
                  value: {
                    label: "Alerts",
                    color: "hsl(var(--chart-1))",
                  },
                }}
                className="h-[320px] w-full flex items-center justify-center"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie
                      data={integrationChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {integrationChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Alert Feed</CardTitle>
            <div className="flex items-center gap-2">
              <AlertColumnSelector 
                columns={alertColumns} 
                onColumnsChange={setAlertColumns}
              />
              {selectedAlerts.length > 0 && canUpdateAlert && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    // Check if all selected alerts are from the same integration
                    const selectedAlertObjs = selectedAlerts
                      .map((id) => alerts.find((a) => a.id === id))
                      .filter(Boolean) as any[]
                    
                    const integrations = new Set(selectedAlertObjs.map((a) => a.integrationId))
                    
                    if (integrations.size !== 1) {
                      alert("Please select alerts from the same integration")
                      return
                    }
                    
                    // Check if alerts are from Wazuh by looking at metadata or integration source
                    const firstAlert = selectedAlertObjs[0]
                    const isWazuh = firstAlert?.metadata?.agentId ||
                                   firstAlert?.integration?.source?.toLowerCase() === "wazuh" ||
                                   firstAlert?.source?.toLowerCase() === "wazuh"
                    
                    if (isWazuh) {
                      // For Wazuh, use Wazuh dialog
                      setWazuhCaseAlertIds(selectedAlerts)
                      setWazuhAddToCaseOpen(true)
                    } else {
                      // For other integrations, use standard dialog
                      setAddToCaseDialogOpen(true)
                    }
                  }}
                >
                  Add {selectedAlerts.length} Alert{selectedAlerts.length > 1 ? "s" : ""} to Case
                </Button>
              )}
            </div>
          </div>
          <Tabs
            defaultValue="all"
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as AlertStatus | "all")}
          >
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="New">New</TabsTrigger>
              <TabsTrigger value="In Progress">In Progress</TabsTrigger>
              <TabsTrigger value="Ignored">Ignored</TabsTrigger>
              <TabsTrigger value="Closed">Closed</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search alerts by title, description, IP, assignee..."
                className="pl-8 pr-10"
                value={pendingSearchQuery}
                onChange={(e) => setPendingSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // Submit search on Enter key
                    setSearchQuery(pendingSearchQuery)
                    setCurrentPage(1)
                    loadAlerts(1, pageSize, pendingSearchQuery)
                    loadAllFilteredAlerts()
                  }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => {
                  // Submit search on button click
                  setSearchQuery(pendingSearchQuery)
                  setCurrentPage(1)
                  loadAlerts(1, pageSize, pendingSearchQuery)
                  loadAllFilteredAlerts()
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AlertTable
            alerts={filteredAlerts}
            loading={loading}
            selectedAlerts={selectedAlerts}
            availableIntegrations={availableIntegrations}
            canUpdateAlert={canUpdateAlert}
            columns={alertColumns}
            onSelectAlert={(checked, alertId) => {
              if (checked) {
                setSelectedAlerts([...selectedAlerts, alertId])
              } else {
                setSelectedAlerts(selectedAlerts.filter((id) => id !== alertId))
              }
            }}
            onViewDetails={(alert) => {
              setSelectedAlert(alert)
              setShowAlertDetailModal(true)
            }}
            onUpdateStatus={(alert) => {
              setSelectedAlert(alert)
              if (alert.metadata?.assignee || alert.metadata?.qradar?.assigned_to) {
                setSelectedAssignee(alert.metadata?.assignee || alert.metadata?.qradar?.assigned_to)
              } else {
                setSelectedAssignee("")
              }
              setShowUpdateStatusDialog(true)
            }}
          />
        </CardContent>
      </Card>

      {/* Update Status Dialog - Outside of loop for proper control */}
      <Dialog open={showUpdateStatusDialog} onOpenChange={setShowUpdateStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Alert Status</DialogTitle>
            <DialogDescription>
              Change the status of this alert and add optional comments.
            </DialogDescription>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4 py-4">
              {(selectedAlert.metadata?.wazuh || selectedAlert.source === "wazuh") && (
                <div className="space-y-2">
                  <Label htmlFor="severity">Severity</Label>
                  <Select value={selectedSeverity || ""} onValueChange={(v) => setSelectedSeverity(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={updateStatus}
                  onValueChange={(value) => setUpdateStatus(value as AlertStatus)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedAlert.metadata?.qradar ? (
                      <>
                        <SelectItem value="New">Open</SelectItem>
                        <SelectItem value="In Progress">Follow Up (Create Ticket)</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Ignored">Ignored</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assign">
                  Assign To {selectedAlert.metadata?.qradar && <span className="text-red-500">*</span>}
                </Label>
                <Select value={selectedAssignee || ""} onValueChange={(v) => setSelectedAssignee(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedAlert.metadata?.qradar 
                      ? QRADAR_ASSIGNEES.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))
                      : (selectedAlert.metadata?.wazuh || selectedAlert.source === "wazuh" ? appUsers : ASSIGNEES).map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="comments">Comments</Label>
                <Textarea
                  id="comments"
                  placeholder="Add comments about this status change..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>

              {/* Custom Analysis Fields - Available for all alert types, stored locally only */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3">Analysis (Local Only)</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="severity-analysis">Severity Based on Analysis</Label>
                  <Select value={severityBasedOnAnalysis || ""} onValueChange={(v) => setSeverityBasedOnAnalysis(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="analysis-notes">Analysis Notes</Label>
                  <Textarea
                    id="analysis-notes"
                    placeholder="Add analysis notes (stored locally, not sent to external systems)..."
                    value={analysisNotes}
                    onChange={(e) => setAnalysisNotes(e.target.value)}
                    className="h-20"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleUpdateStatus} disabled={isUpdatingStatus}>
              {isUpdatingStatus && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {isUpdatingStatus ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination Controls */}
      {!loading && filteredAlerts.length > 0 && totalPages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} | Total Alerts: {paginationData?.total || 0}
                </span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="page-size" className="text-sm">Items per page:</Label>
                  <Select value={pageSize.toString()} onValueChange={(v) => {
                    setPageSize(parseInt(v))
                    setCurrentPage(1)
                    loadAlerts(1, parseInt(v))
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
                    loadAlerts(newPage, pageSize)
                  }}
                  disabled={currentPage === 1}
                >
                  ← Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newPage = currentPage + 1
                    setCurrentPage(newPage)
                    loadAlerts(newPage, pageSize)
                  }}
                  disabled={currentPage === totalPages}
                >
                  Next →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Related Events Modal */}
      <Dialog open={showRelatedEventsModal} onOpenChange={setShowRelatedEventsModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Related Events</DialogTitle>
            <DialogDescription>Events related to QRadar Offense {selectedAlert?.metadata?.qradar?.id}</DialogDescription>
          </DialogHeader>

          {loadingEvents ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="mt-4 text-muted-foreground">Loading related events...</p>
              </div>
            </div>
          ) : relatedEvents && relatedEvents.length > 0 ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">Found {relatedEvents.length} related events</div>
              <div className="max-h-[500px] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">QID</th>
                      <th className="px-4 py-2 text-left font-medium">Source IP</th>
                      <th className="px-4 py-2 text-left font-medium">Dest IP</th>
                      <th className="px-4 py-2 text-left font-medium">Start Time</th>
                      <th className="px-4 py-2 text-left font-medium">Summary</th>
                      <th className="px-4 py-2 text-left font-medium">Category</th>
                      <th className="px-4 py-2 text-left font-medium">Severity</th>
                      <th className="px-4 py-2 text-left font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedEvents.map((event: any, idx: number) => (
                      <tr key={idx} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-2 font-mono text-xs">{event.qid || "N/A"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{event.sourceip || "N/A"}</td>
                        <td className="px-4 py-2 font-mono text-xs">{event.destinationip || "N/A"}</td>
                        <td className="px-4 py-2 text-xs">{event.starttime ? new Date(event.starttime).toLocaleString() : "N/A"}</td>
                        <td className="px-4 py-2 text-xs max-w-[36ch] truncate">{event.summary || event.payloadSnippet || "N/A"}</td>
                        <td className="px-4 py-2 text-xs">{event.category || "N/A"}</td>
                        <td className="px-4 py-2">
                          <Badge
                            className={
                              event.severity >= 7
                                ? "bg-red-500/10 text-red-500"
                                : event.severity >= 4
                                  ? "bg-orange-500/10 text-orange-500"
                                  : "bg-yellow-500/10 text-yellow-500"
                            }
                          >
                            {event.severity || 0}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedEvent(event)
                              setShowEventDetailModal(true)
                            }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No related events found</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRelatedEventsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Closing Reason Dialog for QRadar */}
      <Dialog open={showClosingReasonDialog} onOpenChange={setShowClosingReasonDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Closing Reason</DialogTitle>
            <DialogDescription>Choose a closing reason for this QRadar offense</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="closingReason">Closing Reason</Label>
              <Select
                value={selectedClosingReason?.toString() || ""}
                onValueChange={(value) => setSelectedClosingReason(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select closing reason" />
                </SelectTrigger>
                <SelectContent>
                  {closingReasons.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id.toString()}>
                      ID: {reason.id} - {reason.text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClosingReasonDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (selectedClosingReason) {
                  await handleUpdateStatus()
                }
              }}
              disabled={!selectedClosingReason}
            >
              Confirm Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <EventDetailDialog
        open={showEventDetailModal}
        onOpenChange={setShowEventDetailModal}
        event={selectedEvent}
      />

      {/* Alert Detail Dialog - Conditional based on integration type */}
      {/* Helper function to determine if alert is from Wazuh, QRadar, or generic */}
      {selectedAlert && (() => {
        const isWazuh = selectedAlert.metadata?.agentId ||
          selectedAlert.integration?.source?.toLowerCase() === "wazuh" || 
          selectedAlert.integration?.name?.toLowerCase().includes("wazuh") ||
          selectedAlert.metadata?.ruleId ||
          selectedAlert.metadata?.ruleLevel !== undefined
        
        const isQRadar = selectedAlert.metadata?.qradar ||
          selectedAlert.integration?.source?.toLowerCase() === "qradar" ||
          selectedAlert.integration?.name?.toLowerCase().includes("qradar")

        if (isWazuh) {
          return (
            <WazuhAlertDetailDialog
              open={showAlertDetailModal}
              onOpenChange={setShowAlertDetailModal}
              alert={selectedAlert}
            />
          )
        } else if (isQRadar) {
          return (
            <QRadarAlertDetailDialog
              open={showAlertDetailModal}
              onOpenChange={setShowAlertDetailModal}
              alert={selectedAlert}
              isLoadingEvents={loadingEvents}
              onViewRelatedEvents={() => {
                if (selectedAlert?.metadata?.qradar?.id) {
                  fetchRelatedEvents(selectedAlert.metadata.qradar.id)
                }
              }}
            />
          )
        } else {
          return (
            <AlertDetailDialog
              open={showAlertDetailModal}
              onOpenChange={setShowAlertDetailModal}
              alert={selectedAlert}
            />
          )
        }
      })()}

      {/* Add to Case Dialog - untuk non-Wazuh alerts */}
      {selectedAlerts.length > 0 && (
        <AddToCaseDialog
          open={addToCaseDialogOpen}
          onOpenChange={setAddToCaseDialogOpen}
          alerts={selectedAlerts.map((id) => alerts.find((a) => a.id === id)).filter(Boolean) as any[]}
          integrationId={selectedIntegration || undefined}
          onSuccess={() => {
            setSelectedAlerts([])
            loadAlerts()
          }}
        />
      )}

      {/* Wazuh Add to Case Dialog */}
      <WazuhAddToCaseDialog
        open={wazuhAddToCaseOpen}
        onOpenChange={setWazuhAddToCaseOpen}
        alertIds={wazuhCaseAlertIds}
        onCaseCreated={() => {
          loadAlerts()
        }}
      />
    </div>
  )
}

