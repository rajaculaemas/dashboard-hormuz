"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie,
} from "recharts"
import { FilterSection } from "@/components/professional-dashboard/filter-section"
import { Skeleton } from "@/components/ui/skeleton"

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
  assigned_to?: number | string
}

interface User {
  id: string
  name: string
  role?: string
}

function toUtc7DateRange(range?: { from: Date; to: Date }) {
  if (!range?.from || !range?.to) {
    return undefined
  }
  
  // Use toISOString() to send full ISO format with time
  // This matches Alert Panel format: "2026-05-06T07:00:00.000Z"
  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  }
}

// Helper function to detect escalation level from alert metadata
function getEscalationLevel(alert: AlertItem): "L1" | "L2" | "L3" {
  // Escalation check based on case assignment
  // If alert_id connects to a case, it's considered escalated
  return "L1" // For now, all are L1 until we have escalation API
}

// Helper function to get escalation level based on escalation data
function getEscalationLevelFromData(escalationData: any): "L1" | "L2" | "L3" {
  if (!escalationData) return "L1"
  
  const escalationLevel = escalationData.escalationLevel
  if (escalationLevel === 2) return "L3" // Escalated to L3
  if (escalationLevel === 1) return "L2" // Escalated to L2
  
  return "L1"
}

// Helper function to detect escalation level from case metadata
function getCaseEscalationLevel(caseItem: CaseItem): "L1" | "L2" | "L3" {
  // Case existence means the alert was escalated to case management (L2)
  // In Progress/Open = being escalated (L2)
  // Closed = was fully escalated and resolved (L3)
  
  const caseStatus = (caseItem.status || "").toLowerCase()
  
  if (caseStatus.includes("closed")) {
    return "L3" // Fully escalated and closed
  } else if (caseStatus.includes("in progress") || caseStatus.includes("open")) {
    return "L2" // Currently escalated
  }
  
  return "L1"
}

interface CaseItem {
  id: string
  externalId?: string
  integrationId: string
  status: string
  severity?: string | null
  createdAt?: string
  updatedAt?: string
  modifiedAt?: string
  alerts?: any[]
  metadata?: any
  name?: string
  assigneeName?: string | null
}

// Helper function to check if a string looks like an ID/hash rather than a name
function isLikelyAnId(value: string): boolean {
  if (!value) return false
  
  // Check for hash-like patterns (mixed case with numbers, long random strings)
  // IDs typically: contain numbers + letters mixed, 20+ chars, no spaces
  if (/[a-zA-Z0-9]{20,}/.test(value) && /[0-9]/.test(value) && !/\s/.test(value)) {
    return true
  }
  
  // UUIDs pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true
  }
  
  // Numeric-only IDs
  if (/^\d+$/.test(value)) {
    return true
  }
  
  return false
}

export default function AnalystPerformancePage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [cases, setCases] = useState<CaseItem[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [alertEscalations, setAlertEscalations] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [integrationFilter, setIntegrationFilter] = useState<string[]>(["all"])

  const getDefaultDateRange = () => {
    const now = new Date()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    return {
      from: new Date(twoWeeksAgo.getFullYear(), twoWeeksAgo.getMonth(), twoWeeksAgo.getDate()),
      to: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    }
  }

  const [dateRange, setDateRangeState] = useState<{ from: Date; to: Date }>(() => getDefaultDateRange())
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const setDateRange = (range: { from: Date; to: Date } | undefined) => {
    if (range) {
      setDateRangeState(range)
    }
  }

  // Fetch integrations and users
  useEffect(() => {
    const run = async () => {
      try {
        const [integRes, usersRes] = await Promise.all([
          fetch("/api/integrations"),
          fetch("/api/users"),
        ])
        const integData = await integRes.json()
        const usersData = await usersRes.json()
        
        // Ensure integrations is always an array
        let integArray = []
        if (Array.isArray(integData)) {
          integArray = integData
        } else if (integData && typeof integData === 'object') {
          // Check if response is wrapped in a property
          if (Array.isArray(integData.data)) {
            integArray = integData.data
          } else if (Array.isArray(integData.integrations)) {
            integArray = integData.integrations
          } else {
            integArray = Object.values(integData).filter((item) => typeof item === 'object')
          }
        }
        setIntegrations(integArray)
        
        // Ensure users is always an array
        let usersArray = []
        if (Array.isArray(usersData)) {
          usersArray = usersData
        } else if (usersData && typeof usersData === 'object') {
          // Check if response is wrapped in a property
          if (Array.isArray(usersData.data)) {
            usersArray = usersData.data
          } else if (Array.isArray(usersData.users)) {
            usersArray = usersData.users
          } else {
            usersArray = Object.values(usersData).filter((item) => typeof item === 'object')
          }
        }
        setUsers(usersArray)
      } catch (err) {
        console.error("Failed to fetch integrations/users", err)
        setIntegrations([])
        setUsers([])
      }
    }
    run()
  }, [])

  // Fetch alerts and cases
  const fetchData = async () => {
    setLoading(true)
    try {
      const dateStr = toUtc7DateRange(dateRange)
      const isAllIntegrations = integrationFilter.includes("all")
      const selectedIntegrationIds = isAllIntegrations
        ? integrations.map((i) => i.id)
        : integrationFilter

      let allAlerts: AlertItem[] = []
      let allCases: CaseItem[] = []

      // Fetch for each selected integration using GET requests
      for (const integId of selectedIntegrationIds) {
        const integration = integrations.find((i) => i.id === integId)
        const sourceNormalized = (integration?.source || "").toLowerCase()

        const params = new URLSearchParams()
        params.append("integrationId", integId)
        if (dateStr) {
          params.append("from_date", dateStr.from)
          params.append("to_date", dateStr.to)
        } else {
          params.append("time_range", "7d")
        }
        params.append("limit", "10000")

        // Fetch alerts (for all integrations, including QRadar and Wazuh)
        try {
          const alertsRes = await fetch(`/api/alerts?${params.toString()}`)
          const alertsData = await alertsRes.json()
          
          // Handle wrapped response
          let alertsArray: AlertItem[] = []
          if (Array.isArray(alertsData)) {
            alertsArray = alertsData
          } else if (alertsData && typeof alertsData === 'object') {
            if (Array.isArray(alertsData.data)) {
              alertsArray = alertsData.data
            } else if (Array.isArray(alertsData.alerts)) {
              alertsArray = alertsData.alerts
            }
          }
          allAlerts = [...allAlerts, ...alertsArray]
        } catch (err) {
          console.error(`Failed to fetch alerts for integration ${integId}:`, err)
        }

        // Skip cases for QRadar and Wazuh - we'll fetch them separately from their dedicated endpoints
        if (sourceNormalized.includes("qradar") || sourceNormalized.includes("wazuh")) {
          continue
        }

        // Fetch cases (only for non-QRadar, non-Wazuh integrations)
        try {
          const casesRes = await fetch(`/api/cases?${params.toString()}`)
          const casesData = await casesRes.json()
          
          // Handle wrapped response
          let casesArray: CaseItem[] = []
          if (Array.isArray(casesData)) {
            casesArray = casesData
          } else if (casesData && typeof casesData === 'object') {
            if (Array.isArray(casesData.data)) {
              casesArray = casesData.data
            } else if (Array.isArray(casesData.cases)) {
              casesArray = casesData.cases
            }
          }
          allCases = [...allCases, ...casesArray]
        } catch (err) {
          console.error(`Failed to fetch cases for integration ${integId}:`, err)
        }
      }

      setAlerts(allAlerts)
      setCases(allCases)
      console.log("[Analyst Performance] Alerts fetched:", allAlerts.length, "Cases fetched:", allCases.length)
      
      // Fetch Wazuh cases
      try {
        const wazuhParams = new URLSearchParams()
        if (dateRange?.from && dateRange?.to) {
          // Format as date-only strings (YYYY-MM-DD) in user's local timezone
          const formatLocalDate = (date: Date) => {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
          }
          wazuhParams.append("from_date", formatLocalDate(dateRange.from))
          wazuhParams.append("to_date", formatLocalDate(dateRange.to))
        } else {
          wazuhParams.append("time_range", "7d")
        }
        wazuhParams.append("limit", "10000")

        const resWazuh = await fetch(`/api/wazuh/cases?${wazuhParams}`)
        const dataWazuh = await resWazuh.json()
        const wazuhCases = dataWazuh.cases || []

        // Map Wazuh cases to their correct integration based on integrationId from alerts
        const wazuhCasesTransformed = wazuhCases
          .filter((c: any) => {
            // Only include case if the integration is selected
            if (!selectedIntegrationIds.includes(c.integrationId)) {
              return false
            }
            // Only include case if we can find the integration
            const integration = integrations.find((i) => i.id === c.integrationId)
            if (!integration) {
              console.log(`[Analyst Performance] Warning: Wazuh case ${c.id} has unknown integrationId ${c.integrationId}`)
              return false
            }
            return true
          })
          .map((c: any) => ({
            id: c.id,
            externalId: c.caseNumber,
            integrationId: c.integrationId,
            name: c.title || `Case ${c.caseNumber}`,
            status: c.status, // Backend already normalizes status
            severity: c.severity || null,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            modifiedAt: c.updatedAt,
            metadata: c.metadata || {},
            alerts: c.alerts || []
          }))

        if (wazuhCasesTransformed.length > 0) {
          setCases((prev) => [...prev, ...wazuhCasesTransformed])
        }

        console.log("[Analyst Performance] Wazuh cases fetched:", wazuhCases.length)
      } catch (wazuhErr) {
        console.error("[Analyst Performance] Failed to fetch Wazuh cases:", wazuhErr)
      }

      // Fetch QRadar cases
      try {
        const qradarParams = new URLSearchParams()
        if (dateRange?.from && dateRange?.to) {
          // Format as date-only strings (YYYY-MM-DD) in user's local timezone
          const formatLocalDate = (date: Date) => {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
          }
          qradarParams.append("from_date", formatLocalDate(dateRange.from))
          qradarParams.append("to_date", formatLocalDate(dateRange.to))
        } else {
          qradarParams.append("time_range", "7d")
        }
        qradarParams.append("limit", "10000")

        const resQRadar = await fetch(`/api/qradar/cases?${qradarParams}`)
        const dataQRadar = await resQRadar.json()
        const qradarCases = dataQRadar.cases || []

        // Map QRadar cases to their correct integration based on integrationId from alerts
        const qradarCasesTransformed = qradarCases
          .filter((c: any) => {
            // Only include case if the integration is selected
            if (!selectedIntegrationIds.includes(c.integrationId)) {
              return false
            }
            // Only include case if we can find the integration
            const integration = integrations.find((i) => i.id === c.integrationId)
            if (!integration) {
              console.log(`[Analyst Performance] Warning: QRadar case ${c.id} has unknown integrationId ${c.integrationId}`)
              return false
            }
            return true
          })
          .map((c: any) => ({
            id: c.id,
            externalId: c.externalId || c.id,
            integrationId: c.integrationId,
            name: c.name || c.title || `Case ${c.id}`,
            status: c.status || "New",
            severity: c.severity || null,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            modifiedAt: c.updatedAt,
            metadata: c.metadata || {},
            alerts: c.alerts || []
          }))

        if (qradarCasesTransformed.length > 0) {
          setCases((prev) => [...prev, ...qradarCasesTransformed])
        }

        console.log("[Analyst Performance] QRadar cases fetched:", qradarCases.length)
      } catch (qradarErr) {
        console.error("[Analyst Performance] Failed to fetch QRadar cases:", qradarErr)
      }
      
      // Fetch escalation data for all alerts in ONE query (instead of one-by-one)
      if (allAlerts.length > 0) {
        const alertIds = allAlerts.map(a => a.id)
        
        console.log(`[Analyst Performance] Fetching escalations for ${alertIds.length} alerts with bulk POST`)
        
        try {
          // Use POST with body to avoid URL length limits
          const res = await fetch(`/api/alerts/escalations/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alertIds })
          })
          
          if (!res.ok) {
            throw new Error(`Failed to fetch escalations: ${res.status}`)
          }
          
          const data = await res.json()
          console.log("[Analyst Performance] Escalations bulk fetch result:", data)
          
          const escalationMap: Record<string, any> = {}
          if (data.escalations && Array.isArray(data.escalations)) {
            data.escalations.forEach((esc: any) => {
              escalationMap[esc.alertId] = esc
            })
          }
          
          setAlertEscalations(escalationMap)
          console.log("[Analyst Performance] Escalation data loaded for", Object.keys(escalationMap).length, "alerts")
        } catch (err) {
          console.error("[Analyst Performance] Failed to fetch escalations bulk:", err)
          setAlertEscalations({})
        }
      } else {
        setAlertEscalations({})
        console.log("[Analyst Performance] No alerts to fetch escalation for")
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err)
      setAlerts([])
      setCases([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hasSubmitted) {
      fetchData()
    }
  }, [integrationFilter, dateRange, hasSubmitted])

  const onSubmitFilters = () => {
    setHasSubmitted(true)
  }

  // Metrics Calculation
  const metrics = useMemo(() => {
    // Metric 1: Number of unique analysts (get from alerts assignee field, case insensitive)
    const uniqueAnalysts = new Set<string>()
    alerts.forEach((a) => {
      let analyst = a.metadata?.assignee || a.metadata?.socfortress?.assigned_to || a.metadata?.qradar?.assigned_to || null
      
      // Exclude if it's an ID/hash
      if (analyst && isLikelyAnId(String(analyst))) {
        analyst = null
      }
      
      if (analyst && analyst !== "Unassigned") {
        const normalizedAnalyst = String(analyst).trim().toLowerCase()
        if (normalizedAnalyst) {
          uniqueAnalysts.add(normalizedAnalyst)
        }
      }
    })
    const numberOfAnalysts = uniqueAnalysts.size

    // Metric 2: Escalation Ratio (alerts that have active escalation)
    const totalAlerts = alerts.length
    const escalatedAlerts = alerts.filter((a) => alertEscalations[a.id]).length
    const escalationRatio = totalAlerts > 0 ? ((escalatedAlerts / totalAlerts) * 100).toFixed(1) : "0.0"

    // Metric 3: Average alert per analyst
    const avgAlertPerAnalyst = numberOfAnalysts > 0 ? (totalAlerts / numberOfAnalysts).toFixed(1) : "0.0"

    // Metric 4: L1 Closure Rate (alerts not escalated)
    const l1Alerts = alerts.filter((a) => !alertEscalations[a.id]).length
    const l1ClosureRate = totalAlerts > 0 ? ((l1Alerts / totalAlerts) * 100).toFixed(1) : "0.0"

    // Debug: log escalation breakdown
    const l2Alerts = alerts.filter((a) => {
      const esc = alertEscalations[a.id]
      return esc && esc.escalationLevel === 1
    }).length
    const l3Alerts = alerts.filter((a) => {
      const esc = alertEscalations[a.id]
      return esc && esc.escalationLevel === 2
    }).length
    console.log("[Analyst Performance Metrics] Escalation breakdown: L1=", l1Alerts, "L2=", l2Alerts, "L3=", l3Alerts, "Total=", totalAlerts)

    return {
      numberOfAnalysts,
      escalationRatio: parseFloat(escalationRatio),
      avgAlertPerAnalyst: parseFloat(avgAlertPerAnalyst),
      l1ClosureRate: parseFloat(l1ClosureRate),
    }
  }, [alerts, alertEscalations])

  // Chart 1: Alert Distribution by Analyst
  const alertPerAnalystData = useMemo(() => {
    const byAnalyst: Record<string, number> = {}

    alerts.forEach((a) => {
      let analyst = a.metadata?.assignee || a.metadata?.socfortress?.assigned_to || a.metadata?.qradar?.assigned_to || "Unassigned"
      
      // If analyst looks like an ID/hash, treat as Unassigned
      if (isLikelyAnId(String(analyst))) {
        analyst = "Unassigned"
      }
      
      // Normalize analyst name - case insensitive, trim whitespace
      const analystStr = String(analyst).trim().toLowerCase() || "unassigned"
      byAnalyst[analystStr] = (byAnalyst[analystStr] || 0) + 1
    })

    const result = Object.entries(byAnalyst)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return result
  }, [alerts])

  // Chart 2: Alert Escalation Trend (Daily)
  const alertEscalationTrendData = useMemo(() => {
    const byDate: Record<string, { date: string; "L1 (No Escalation)": number; "L2 Escalated": number; "L3 Escalated": number }> = {}

    alerts.forEach((a) => {
      const timestamp = a.timestamp || a.updatedAt || ""
      if (!timestamp) return

      const date = new Date(timestamp)
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

      if (!byDate[dateStr]) {
        byDate[dateStr] = {
          date: dateStr,
          "L1 (No Escalation)": 0,
          "L2 Escalated": 0,
          "L3 Escalated": 0,
        }
      }

      // Determine escalation level based on escalation data
      const escalationData = alertEscalations[a.id]
      const escalationLevel = getEscalationLevelFromData(escalationData)

      if (escalationLevel === "L1") {
        byDate[dateStr]["L1 (No Escalation)"] += 1
      } else if (escalationLevel === "L2") {
        byDate[dateStr]["L2 Escalated"] += 1
      } else if (escalationLevel === "L3") {
        byDate[dateStr]["L3 Escalated"] += 1
      }
    })

    const result = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
    return result
  }, [alerts, alertEscalations])

  // Chart 3: Escalation Distribution by Integration
  const escalationByIntegrationData = useMemo(() => {
    const byIntegrationAndLevel: Record<string, { L1: number; L2: number; L3: number }> = {}

    // Process all alerts and determine escalation level based on escalation data
    alerts.forEach((a) => {
      const integration = integrations.find((i) => i.id === a.integrationId)
      const key = integration?.name || a.integrationId
      
      if (!byIntegrationAndLevel[key]) {
        byIntegrationAndLevel[key] = { L1: 0, L2: 0, L3: 0 }
      }

      // Get escalation level from escalation data
      const escalationData = alertEscalations[a.id]
      const escalationLevel = getEscalationLevelFromData(escalationData)
      
      byIntegrationAndLevel[key][escalationLevel] += 1
    })

    const result = Object.entries(byIntegrationAndLevel)
      .map(([name, counts]) => ({
        name,
        "L1 (No Escalation)": counts.L1,
        "L2 Escalated": counts.L2,
        "L3 Escalated": counts.L3,
      }))
      .sort((a, b) => (b["L2 Escalated"] + b["L3 Escalated"]) - (a["L2 Escalated"] + a["L3 Escalated"]))

    return result
  }, [alerts, alertEscalations, integrations])

  // Chart 4: Alert Closure Rate (Pie Chart)
  const alertClosureRateData = useMemo(() => {
    const l1Count = alerts.filter((a) => !alertEscalations[a.id]).length
    const l2Count = alerts.filter((a) => {
      const esc = alertEscalations[a.id]
      return esc && esc.escalationLevel === 1
    }).length
    const l3Count = alerts.filter((a) => {
      const esc = alertEscalations[a.id]
      return esc && esc.escalationLevel === 2
    }).length

    const result = [
      { name: "L1 (No Escalation)", value: l1Count, fill: "#10b981" },
      { name: "L2 Escalated", value: l2Count, fill: "#f59e0b" },
      { name: "L3 Escalated", value: l3Count, fill: "#ef4444" },
    ]

    return result
  }, [alerts, alertEscalations])

  const COLORS = ["#3b82f6", "#ef4444", "#10b981"]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-4">Analyst Performance</h1>
      </div>

      {/* Filter Section */}
      <FilterSection
        integrations={integrations}
        integrationFilter={integrationFilter}
        onIntegrationFilterChange={setIntegrationFilter}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        loading={loading}
        onSubmit={onSubmitFilters}
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Number of Analysts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Number of Analysts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.numberOfAnalysts}</div>
            <p className="text-xs text-muted-foreground mt-1">L1, L2, L3 Users</p>
          </CardContent>
        </Card>

        {/* Metric 2: Escalation Ratio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Escalation Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.escalationRatio}%</div>
            <p className="text-xs text-muted-foreground mt-1">Alerts Escalated</p>
          </CardContent>
        </Card>

        {/* Metric 3: Average Alert Per Analyst */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Alert/Analyst</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgAlertPerAnalyst}</div>
            <p className="text-xs text-muted-foreground mt-1">Per Analyst</p>
          </CardContent>
        </Card>

        {/* Metric 4: L1 Closure Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">L1 Closure Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.l1ClosureRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">No Escalation</p>
          </CardContent>
        </Card>
      </div>

      {!hasSubmitted ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <p>Click "Apply Filters" to view analyst performance data</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chart 1: Alert Distribution by Analyst */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Distribution by Analyst</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {alertPerAnalystData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alertPerAnalystData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" name="Alert Count" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 2: Alert Escalation Trend (Daily) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Escalation Trend (Daily)</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {alertEscalationTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={alertEscalationTrendData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis label={{ value: "Count", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="L1 (No Escalation)" stroke="#10b981" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="L2 Escalated" stroke="#f59e0b" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="L3 Escalated" stroke="#ef4444" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 3: Escalation Distribution by Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Escalation Distribution by Integration</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {escalationByIntegrationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={escalationByIntegrationData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis label={{ value: "Count", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="L1 (No Escalation)" fill="#10b981" stackId="a" />
                    <Bar dataKey="L2 Escalated" fill="#f59e0b" stackId="a" />
                    <Bar dataKey="L3 Escalated" fill="#ef4444" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No escalations found
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 4: Alert Closure Rate (Pie Chart) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Closure Rate by Escalation Level</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {alertClosureRateData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={alertClosureRateData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {alertClosureRateData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
