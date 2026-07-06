"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from "recharts"
import { FilterSection } from "@/components/professional-dashboard/filter-section"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { exportDashboardToExcel } from "@/lib/utils/excel-export"

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
  title?: string
  description?: string
  externalId?: string
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

interface User {
  id: string
  name: string
}

// Helper function to convert timestamp to UTC+7 date string (YYYY-MM-DD)
function toUTC7DateString(timestamp: string | number | null | undefined): string | null {
  if (!timestamp) return null
  
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return null
    
    // Alert timestamps from API are in UTC (ISO format)
    // To convert to UTC+7, simply add 7 hours
    // UTC+7 offset in milliseconds
    const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
    const utc7Time = date.getTime() + UTC_PLUS_7_OFFSET_MS
    const utc7Date = new Date(utc7Time)
    
    // Extract date components using UTC methods (we already shifted the time)
    const year = utc7Date.getUTCFullYear()
    const month = String(utc7Date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(utc7Date.getUTCDate()).padStart(2, "0")
    
    return `${year}-${month}-${day}`
  } catch (e) {
    console.error("[toUTC7DateString] Error converting timestamp:", timestamp, e)
    return null
  }
}

// Helper function to convert date range to UTC+7 timestamp range for API
function toUTC7TimestampRange(range?: { from: Date; to: Date }) {
  if (!range?.from || !range?.to) {
    return undefined
  }

  // For the from_date: user's local date at 00:00:00 UTC+7
  // For the to_date: user's local date at 23:59:59 UTC+7
  
  const formatUTC7Start = (d: Date) => {
    // Create a date at 00:00:00 in user's local timezone
    const localDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
    // This is 00:00:00 in user's browser timezone, but we need 00:00:00 in UTC+7
    // The offset between browser timezone and UTC+7 is: (7 - browser_tz_offset / 60)
    // But actually, we should use ISO format with the timezone indicator
    
    // Better approach: just return ISO format that represents this moment,
    // then the API can interpret it correctly
    return localDate.toISOString()
  }

  const formatUTC7End = (d: Date) => {
    // End of day: 23:59:59. We'll use 23:59:59 local time
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
    return endOfDay.toISOString()
  }

  return {
    from: formatUTC7Start(range.from),
    to: formatUTC7End(range.to),
  }
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

// Helper function to format analyst names (proper case)
function formatAnalystName(name: string): string {
  if (!name || name === "Unassigned" || name === "unassigned") return "Unassigned"
  
  // Don't format if it looks like an ID
  if (isLikelyAnId(name)) {
    console.debug(`[formatAnalystName] "${name}" looks like an ID, returning Unassigned`)
    return "Unassigned"
  }
  
  const formatted = String(name || "").trim()
  if (!formatted) return "Unassigned"
  
  // Capitalize first letter only
  return formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase()
}

// Helper function to get assigner name from alert - extract assignee directly from integration metadata
// Helper function to get assignee from alert based on integration source

// Helper function to get alert tags/status (TP, BTP, FP, Untagged)
function getAlertTag(alert: AlertItem): string {
  // Check various tag locations based on integration - try multiple sources
  let tagValue: any = null
  
  // Try multiple tag locations
  // Stellar Cyber: metadata.event_tags is array of {tag: "value"}
  if (Array.isArray(alert.metadata?.event_tags) && alert.metadata.event_tags.length > 0) {
    const eventTag = alert.metadata.event_tags[0]
    if (eventTag && typeof eventTag === 'object' && eventTag.tag) {
      tagValue = eventTag.tag
      console.debug(`[getAlertTag] Alert ${alert.id} - found tag at metadata.event_tags[0].tag:`, tagValue)
    }
  }
  // SOCFortress: metadata.tags is array of strings
  else if (Array.isArray(alert.metadata?.tags) && alert.metadata.tags.length > 0) {
    tagValue = alert.metadata.tags[0]
    console.debug(`[getAlertTag] Alert ${alert.id} - found tag at metadata.tags[0]:`, tagValue)
  }
  // QRadar: Check closing_reason_id FIRST (numeric ID mapping)
  // 104 and 2 = False Positive, 54 = Benign True Positive, 105 = True Positive
  else if (typeof alert.metadata?.qradar?.closing_reason_id === 'number') {
    const closingReasonId = alert.metadata.qradar.closing_reason_id
    console.debug(`[getAlertTag] Alert ${alert.id} - found QRadar closing_reason_id:`, closingReasonId)
    if (closingReasonId === 104 || closingReasonId === 2) {
      tagValue = "False Positive"
    } else if (closingReasonId === 54) {
      tagValue = "Benign True Positive"
    } else if (closingReasonId === 105) {
      tagValue = "True Positive"
    }
    console.debug(`[getAlertTag] Alert ${alert.id} - mapped closing_reason_id ${closingReasonId} to:`, tagValue)
  }
  // QRadar: Try closing_reason as fallback
  else if (alert.metadata?.closing_reason) {
    tagValue = alert.metadata?.closing_reason
    console.debug(`[getAlertTag] Alert ${alert.id} - found tag at closing_reason:`, tagValue)
  }
  else if (alert.metadata?.qradar?.closing_reason) {
    tagValue = alert.metadata?.qradar?.closing_reason
    console.debug(`[getAlertTag] Alert ${alert.id} - found tag at qradar.closing_reason:`, tagValue)
  }
  // Copilot/generic plural forms (fallback)
  else if (Array.isArray(alert.metadata?.copilot_tags) && alert.metadata.copilot_tags.length > 0) {
    tagValue = alert.metadata.copilot_tags[0]
    console.debug(`[getAlertTag] Alert ${alert.id} - found tag at metadata.copilot_tags[0]:`, tagValue)
  }
  
  console.debug(`[getAlertTag] Alert ${alert.id} - final tag value:`, tagValue)
  
  if (!tagValue) {
    console.debug(`[getAlertTag] Alert ${alert.id} - no tag found, returning Untagged`)
    return "Untagged"
  }
  
  // Convert to lowercase and remove extra spaces for comparison
  let tagStr = String(tagValue || "").toLowerCase().trim().replace(/\s+/g, ' ')
  console.debug(`[getAlertTag] Alert ${alert.id} - normalized tag string: "${tagStr}"`)
  
  // Check for Benign True Positive FIRST (more specific)
  // Matches: "btp", "benign true positive", "BENIGN TRUE POSITIVE", "Benign True Positive", etc.
  if (
    tagStr === "btp" || 
    tagStr === "benign true positive" || 
    (tagStr.includes("benign") && tagStr.includes("true") && tagStr.includes("positive"))
  ) {
    console.debug(`[getAlertTag] Alert ${alert.id} - matched: Benign True Positive`)
    return "Benign True Positive"
  }
  
  // Check for True Positive (but not benign true positive)
  // Matches: "tp", "true positive", "TRUE POSITIVE", "True Positive", etc.
  if (
    tagStr === "tp" || 
    (tagStr === "true positive" && !tagStr.includes("benign"))
  ) {
    console.debug(`[getAlertTag] Alert ${alert.id} - matched: True Positive`)
    return "True Positive"
  }
  
  // Check for False Positive
  // Matches: "fp", "false positive", "FALSE POSITIVE", "False Positive", etc.
  if (
    tagStr === "fp" || 
    (tagStr === "false positive")
  ) {
    console.debug(`[getAlertTag] Alert ${alert.id} - matched: False Positive`)
    return "False Positive"
  }
  
  console.debug(`[getAlertTag] Alert ${alert.id} - no tag pattern matched, returning Untagged`)
  return "Untagged"
}

// Helper function to get case customer name
function getCaseCustomer(caseItem: CaseItem): string {
  // Try different sources for customer name
  let customer = (
    caseItem.metadata?.customer ||
    caseItem.metadata?.customerName ||
    caseItem.metadata?.organization ||
    caseItem.metadata?.customer_id ||
    "Unknown Customer"
  )
  
  // Clean up the customer name (trim and handle empty strings)
  customer = String(customer || "").trim()
  
  return customer || "Unknown Customer"
}

// Helper function to normalize case status
function normalizeCaseStatus(status: string | undefined): "open" | "in progress" | "closed" {
  if (!status) return "closed"
  const s = String(status || "").toLowerCase().trim()
  if (s === "open" || s === "new") return "open"
  if (s === "in progress" || s === "in_progress") return "in progress"
  return "closed" // includes resolved, closed, etc.
}

// Helper function to get shift based on hour (timestamp)
function getShiftFromTimestamp(timestamp?: string): "Shift 1 (07:00-15:00)" | "Shift 2 (15:00-23:00)" | "Shift 3 (23:00-07:00)" {
  if (!timestamp) return "Shift 3 (23:00-07:00)" // Default to shift 3 if no timestamp
  
  try {
    const date = new Date(timestamp)
    
    // Alert timestamps from API are in UTC (ISO format)
    // To convert to UTC+7, simply add 7 hours
    const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
    const utc7Time = date.getTime() + UTC_PLUS_7_OFFSET_MS
    const utc7Date = new Date(utc7Time)
    
    // Get hours in UTC+7 timezone
    const hour = utc7Date.getUTCHours()
    
    // Shift 1: 07:00 - 15:00 (7-14)
    if (hour >= 7 && hour < 15) {
      return "Shift 1 (07:00-15:00)"
    }
    // Shift 2: 15:00 - 23:00 (15-22)
    else if (hour >= 15 && hour < 23) {
      return "Shift 2 (15:00-23:00)"
    }
    // Shift 3: 23:00 - 07:00 (23-6)
    else {
      return "Shift 3 (23:00-07:00)"
    }
  } catch (e) {
    console.error("Error parsing timestamp:", timestamp, e)
    return "Shift 3 (23:00-07:00)"
  }
}

export default function ProfessionalDashboardOverviewPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [cases, setCases] = useState<CaseItem[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [integrationFilter, setIntegrationFilter] = useState<string[]>(["all"])

  const getDefaultDateRange = () => {
    const now = new Date()
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    return {
      from: new Date(twoWeeksAgo.getFullYear(), twoWeeksAgo.getMonth(), twoWeeksAgo.getDate()),
      to: new Date(now.getFullYear(), now.getMonth(), now.getDate())
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
        const res = await fetch("/api/integrations")
        const data = await res.json()
        
        // Ensure integrations is always an array
        let integArray = []
        if (Array.isArray(data)) {
          integArray = data
        } else if (data && typeof data === 'object') {
          if (Array.isArray(data.data)) {
            integArray = data.data
          } else if (Array.isArray(data.integrations)) {
            integArray = data.integrations
          } else {
            integArray = Object.values(data).filter((item) => typeof item === 'object')
          }
        }
        setIntegrations(integArray)

        const usersRes = await fetch("/api/users")
        const usersData = await usersRes.json()
        
        // Ensure users is always an array
        let usersArray = []
        if (Array.isArray(usersData)) {
          usersArray = usersData
        } else if (usersData && typeof usersData === 'object') {
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
        console.error("Failed to fetch initial data", err)
        setIntegrations([])
        setUsers([])
      }
    }
    run()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Use ISO timestamp format for precise date range boundaries
      let timestampRange: { from: string; to: string } | undefined

      if (dateRange?.from && dateRange?.to) {
        const hasTime = (d: Date) => d.getHours() !== 0 || d.getMinutes() !== 0

        if (hasTime(dateRange.from) || hasTime(dateRange.to)) {
          // User picked a specific time — preserve it by sending full ISO.
          // Browser local time is already in UTC+7, so toISOString() gives the
          // correct UTC equivalent (e.g. 07:00 WIB → 00:00 UTC).
          timestampRange = {
            from: dateRange.from.toISOString(),
            to: dateRange.to.toISOString(),
          }
        } else {
          // Date-only selection — use YYYY-MM-DD so the API applies proper
          // UTC+7 day boundaries (midnight-to-midnight WIB).
          const formatLocalDate = (d: Date) => {
            const year = d.getFullYear()
            const month = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
          }
          timestampRange = {
            from: formatLocalDate(dateRange.from),
            to: formatLocalDate(dateRange.to),
          }
        }

        console.log("[fetchData] Using timestamp range:", {
          from: timestampRange.from,
          to: timestampRange.to,
        })
      }

      // Determine which integrations to fetch
      const isAllIntegrations = integrationFilter.includes("all") || integrationFilter.length === 0
      const selectedIntegrationIds = isAllIntegrations 
        ? integrations.map(i => i.id)
        : integrationFilter

      // Helper function to fetch data for specific integrations
      const fetchForIntegrations = async (integrationIds: string[]) => {
        let allAlerts: AlertItem[] = []
        let allCases: CaseItem[] = []

        // Fetch from API for all selected integrations
        for (const integId of integrationIds) {
          const integration = integrations.find((i) => i.id === integId)
          const sourceNormalized = (integration?.source || "").toLowerCase()

          const params = new URLSearchParams()
          params.append("integrationId", integId)
          if (timestampRange) {
            params.append("from_date", timestampRange.from)
            params.append("to_date", timestampRange.to)
          } else {
            params.append("time_range", "7d")
          }
          params.append("limit", "10000")

          const paramsStr = params.toString()
          console.log(`[Overview] Alert fetch URL: /api/alerts?${paramsStr}`)

          // Fetch alerts (for all integrations, including QRadar and Wazuh)
          try {
            const resAlerts = await fetch(`/api/alerts?${paramsStr}`)
            const dataAlerts = await resAlerts.json()
            const alertsData = dataAlerts.data || dataAlerts.alerts || []
            console.log(`[Overview] Fetched ${alertsData.length} alerts for integration ${integId}`)
            if (alertsData.length > 0) {
              console.log(`[Overview] Sample alert timestamp: ${alertsData[0].timestamp}`)
            }
            allAlerts = [...allAlerts, ...alertsData]
          } catch (err) {
            console.error(`Failed to fetch alerts for integration ${integId}:`, err)
          }

          // Skip cases for QRadar and Wazuh - we'll fetch them separately from their dedicated endpoints
          if (sourceNormalized.includes("qradar") || sourceNormalized.includes("wazuh")) {
            continue
          }

          // Fetch cases (only for non-QRadar, non-Wazuh integrations)
          try {
            const resCases = await fetch(`/api/cases?${paramsStr}`)
            const dataCases = await resCases.json()
            let casesData = dataCases.data || dataCases.cases || []
            allCases = [...allCases, ...casesData]
          } catch (err) {
            console.error(`Failed to fetch cases for integration ${integId}:`, err)
          }
        }

        return { allAlerts, allCases }
      }

      // Fetch data for selected integrations
      const { allAlerts, allCases } = await fetchForIntegrations(selectedIntegrationIds)

      console.log("[Professional Dashboard] Alerts fetched:", allAlerts.length)
      if (allAlerts.length > 0) {
        console.log("[Professional Dashboard] Sample alert:", JSON.stringify(allAlerts[0], null, 2))
      }

      setAlerts(allAlerts)

      // Also fetch Wazuh cases
      let finalCases = allCases
      try {
        const wazuhParams = new URLSearchParams()
        if (timestampRange) {
          wazuhParams.append("from_date", timestampRange.from)
          wazuhParams.append("to_date", timestampRange.to)
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
            if (!isAllIntegrations && !selectedIntegrationIds.includes(c.integrationId)) {
              console.log(`[Professional Dashboard] Skipping Wazuh case ${c.id}: integrationId ${c.integrationId} not in selected`)
              return false
            }
            // Only include case if we can find the integration
            const integration = integrations.find((i) => i.id === c.integrationId)
            if (!integration) {
              console.log(`[Professional Dashboard] Warning: Wazuh case ${c.id} has unknown integrationId ${c.integrationId}`)
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
          finalCases = [...allCases, ...wazuhCasesTransformed]
          console.log("[Professional Dashboard] Wazuh cases added:", wazuhCasesTransformed.length)
        } else {
          finalCases = allCases
          console.log("[Professional Dashboard] No Wazuh cases matched selected integrations")
        }

        console.log("[Professional Dashboard] Wazuh cases fetched from API:", wazuhCases.length)
      } catch (wazuhErr) {
        console.error("[Professional Dashboard] Failed to fetch Wazuh cases:", wazuhErr)
      }

      // Also fetch QRadar cases
      try {
        const qradarParams = new URLSearchParams()
        if (timestampRange) {
          qradarParams.append("from_date", timestampRange.from)
          qradarParams.append("to_date", timestampRange.to)
        } else {
          qradarParams.append("time_range", "7d")
        }
        qradarParams.append("limit", "10000")

        console.log("[Professional Dashboard] QRadar fetch URL:", `/api/qradar/cases?${qradarParams}`)
        
        const resQRadar = await fetch(`/api/qradar/cases?${qradarParams}`)
        const dataQRadar = await resQRadar.json()
        const qradarCases = dataQRadar.cases || []

        console.log("[Professional Dashboard] QRadar API response:", {
          status: resQRadar.status,
          caseCount: qradarCases.length,
          params: { from_date: timestampRange?.from, to_date: timestampRange?.to }
        })

        // Map QRadar cases to their correct integration based on integrationId from alerts
        const qradarCasesTransformed = qradarCases
          .filter((c: any) => {
            // Only include case if the integration is selected
            if (!isAllIntegrations && !selectedIntegrationIds.includes(c.integrationId)) {
              console.log(`[Professional Dashboard] Skipping QRadar case ${c.id}: integrationId ${c.integrationId} not in selected`)
              return false
            }
            // Only include case if we can find the integration
            const integration = integrations.find((i) => i.id === c.integrationId)
            if (!integration) {
              console.log(`[Professional Dashboard] Warning: QRadar case ${c.id} has unknown integrationId ${c.integrationId}`)
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
          finalCases = [...finalCases, ...qradarCasesTransformed]
          console.log("[Professional Dashboard] QRadar cases added:", qradarCasesTransformed.length)
        } else {
          console.log("[Professional Dashboard] No QRadar cases matched selected integrations")
        }

        console.log("[Professional Dashboard] QRadar cases fetched from API:", qradarCases.length)
      } catch (qradarErr) {
        console.error("[Professional Dashboard] Failed to fetch QRadar cases:", qradarErr)
      }

      if (finalCases.length > 0) {
        console.log("[Professional Dashboard] Sample case:", JSON.stringify(finalCases[0], null, 2))
      }

      setCases(finalCases)
    } catch (err) {
      console.error("Failed to fetch dashboard data", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hasSubmitted) {
      fetchData()
    }
  }, [integrationFilter, dateRange, hasSubmitted])

  const [exporting, setExporting] = useState(false)

  const onSubmitFilters = () => {
    setHasSubmitted(true)
  }

  const handleExportToExcel = async () => {
    if (alerts.length === 0 && cases.length === 0) {
      alert("No data to export. Please apply filters first.")
      return
    }

    try {
      setExporting(true)
      await exportDashboardToExcel(alerts, cases, integrations, dateRange)
    } catch (error) {
      console.error("Export failed:", error)
      alert("Failed to export data. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  // Chart 1: Alert & Case per Integrasi (menggunakan integration.name)
  const alertCasePerIntegrationData = useMemo(() => {
    const byIntegration: Record<string, { name: string; alerts: number; cases: number }> = {}

    console.log("[Chart 1] Processing alerts:", alerts.length)
    console.log("[Chart 1] Processing cases:", cases.length)

    alerts.forEach((a) => {
      const integration = integrations.find((i) => i.id === a.integrationId)
      const key = integration?.name || a.integrationId
      if (!byIntegration[key]) {
        byIntegration[key] = { name: key, alerts: 0, cases: 0 }
      }
      byIntegration[key].alerts += 1
      console.log(`[Chart 1] Alert ${a.id} - integration: ${key}, total_alerts_now: ${byIntegration[key].alerts}`)
    })

    cases.forEach((c) => {
      const integration = integrations.find((i) => i.id === c.integrationId)
      const key = integration?.name || c.integrationId
      if (!byIntegration[key]) {
        byIntegration[key] = { name: key, alerts: 0, cases: 0 }
      }
      byIntegration[key].cases += 1
      console.log(`[Chart 1] Case ${c.id} - integration: ${key}, total_cases_now: ${byIntegration[key].cases}`)
    })

    const result = Object.values(byIntegration)
    console.log("[Chart 1] Final data (alerts + cases per integration):", result)
    return result
  }, [alerts, cases, integrations])

  // Chart 2: Stacked Bar Chart Case per Integrasi (berdasarkan status)
  const casePerIntegrationData = useMemo(() => {
    const byIntegration: Record<string, { name: string; open: number; "in progress": number; closed: number }> = {}

    console.log("[Chart 2] Processing cases per integration:", cases.length)
    
    cases.forEach((c) => {
      const integration = integrations.find((i) => i.id === c.integrationId)
      const integrationName = integration?.name || c.integrationId
      
      console.log(`[Chart 2] Case ${c.id} - integration: "${integrationName}", status: "${c.status}"`)
      
      if (!byIntegration[integrationName]) {
        byIntegration[integrationName] = { name: integrationName, open: 0, "in progress": 0, closed: 0 }
      }
      
      const status = normalizeCaseStatus(c.status)
      byIntegration[integrationName][status] += 1
    })

    const result = Object.values(byIntegration)
    console.log("[Chart 2] Final data (cases per integration):", result)
    return result
  }, [cases, integrations])

  // Chart 3: Line Chart Alert Trend per Hari (dipisah berdasarkan tag: TP, BTP, FP, Untagged)
  const alertTrendData = useMemo(() => {
    const byDate: Record<string, { date: string; "True Positive": number; "Benign True Positive": number; "False Positive": number; "Untagged": number }> = {}

    console.log("[Chart 3] Processing alerts for trend:", alerts.length)
    console.log("[Chart 3] Alert timestamps range:", {
      count: alerts.length,
      firstAlert: alerts[0]?.timestamp,
      lastAlert: alerts[alerts.length - 1]?.timestamp,
      dateRange: {
        from: dateRange?.from?.toISOString(),
        to: dateRange?.to?.toISOString()
      }
    })

    const tagDistribution: Record<string, number> = {}
    const integrationTagDistribution: Record<string, Record<string, number>> = {}

    alerts.forEach((a, index) => {
      const date = toUTC7DateString(a.timestamp)
      if (!date) {
        console.debug(`[Chart 3] Alert ${a.id} - no date found (timestamp: ${a.timestamp})`)
        return
      }

      if (!byDate[date]) {
        byDate[date] = { date, "True Positive": 0, "Benign True Positive": 0, "False Positive": 0, "Untagged": 0 }
      }

      const tag = getAlertTag(a)
      tagDistribution[tag] = (tagDistribution[tag] || 0) + 1
      
      // Track tags by integration
      const integration = integrations.find(i => i.id === a.integrationId)
      const intName = integration?.name || a.integrationId || "Unknown"
      if (!integrationTagDistribution[intName]) {
        integrationTagDistribution[intName] = {}
      }
      integrationTagDistribution[intName][tag] = (integrationTagDistribution[intName][tag] || 0) + 1
      
      if (index < 5) {
        console.debug(`[Chart 3] Alert ${index} - id: ${a.id}`)
        console.debug(`  integration: ${intName}`)
        console.debug(`  date: ${date}`)
        console.debug(`  tag result: ${tag}`)
        console.debug(`  metadata.event_tags (Stellar):`, a.metadata?.event_tags)
        console.debug(`  metadata.tags (SOCFortress):`, a.metadata?.tags)
        console.debug(`  metadata.closing_reason (QRadar):`, a.metadata?.closing_reason)
        console.debug(`  metadata.copilot_tags:`, a.metadata?.copilot_tags)
      }
      
      if (tag === "True Positive" || tag === "Benign True Positive" || tag === "False Positive" || tag === "Untagged") {
        byDate[date][tag] += 1
      }
    })

    console.log("[Chart 3] Tag distribution (global):", tagDistribution)
    console.log("[Chart 3] Tag distribution by integration:", integrationTagDistribution)
    
    const result = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
    
    // Add detailed logging for date breakdown
    console.log("[Chart 3] Alert breakdown by date:")
    result.forEach(dateData => {
      const total = dateData["True Positive"] + dateData["Benign True Positive"] + dateData["False Positive"] + dateData["Untagged"]
      console.log(`  ${dateData.date}: TP=${dateData["True Positive"]} BTP=${dateData["Benign True Positive"]} FP=${dateData["False Positive"]} Untagged=${dateData["Untagged"]} (total=${total})`)
    })
    
    console.log("[Chart 3] Final data (by date):", result.slice(0, 3), "... (showing first 3)")
    console.log("[Chart 3] Total dates with data:", result.length)
    return result
  }, [alerts, dateRange, integrations])

  // Chart 5: Horizontal Bar Chart Alert per Shift
  const alertPerShiftData = useMemo(() => {
    const byShift: Record<string, number> = {
      "Shift 1 (07:00-15:00)": 0,
      "Shift 2 (15:00-23:00)": 0,
      "Shift 3 (23:00-07:00)": 0,
    }

    console.log("[Chart 5] Processing alerts for shift distribution:", alerts.length)

    alerts.forEach((a) => {
      const timestamp = a.timestamp || a.updatedAt
      const shift = getShiftFromTimestamp(timestamp)
      byShift[shift] += 1
    })

    const shiftColors: Record<string, string> = {
      "Shift 1 (07:00-15:00)": "#3b82f6", // Blue
      "Shift 2 (15:00-23:00)": "#f59e0b", // Amber
      "Shift 3 (23:00-07:00)": "#10b981", // Green
    }

    const result = Object.entries(byShift)
      .map(([shift, count]) => ({ 
        shift, 
        count,
        fill: shiftColors[shift]
      }))
      .sort((a, b) => {
        // Sort by shift order: Shift 1, Shift 2, Shift 3
        const shiftOrder = {
          "Shift 1 (07:00-15:00)": 0,
          "Shift 2 (15:00-23:00)": 1,
          "Shift 3 (23:00-07:00)": 2,
        }
        return (shiftOrder[a.shift as keyof typeof shiftOrder] || 999) - (shiftOrder[b.shift as keyof typeof shiftOrder] || 999)
      })

    console.log("[Chart 5] Alert distribution by shift:", result)
    return result
  }, [alerts])

  // Metrics Calculation
  const metrics = useMemo(() => {
    // Metric 1: Total Alert
    const totalAlert = alerts.length

    // Metric 2: Case Backlog Ratio
    const totalCases = cases.length
    const backlogCases = cases.filter((c) => {
      const status = (c.status || "").toLowerCase().trim()
      return (
        status === "open" || 
        status === "new" || 
        status === "in progress" || 
        status === "in_progress" || 
        status === "follow_up" || 
        status === "followup"
      )
    }).length
    const caseBacklogRatio = totalCases > 0 ? ((backlogCases / totalCases) * 100).toFixed(1) : "0.0"

    // Metric 3: Alert Backlog Ratio
    const backlogAlerts = alerts.filter((a) => {
      const status = (a.status || "").toLowerCase().trim()
      return status === "open" || status === "new" || status === "in progress" || status === "in_progress"
    }).length
    const alertBacklogRatio = totalAlert > 0 ? ((backlogAlerts / totalAlert) * 100).toFixed(1) : "0.0"

    // Metric 4: Average Alert Per Shift
    const avgAlertPerShift = totalAlert > 0 ? (totalAlert / 3).toFixed(1) : "0.0"

    console.log("[Metrics]", {
      totalAlert,
      backlogCases,
      totalCases,
      caseBacklogRatio,
      backlogAlerts,
      alertBacklogRatio,
      avgAlertPerShift,
    })

    return {
      totalAlert,
      caseBacklogRatio: parseFloat(caseBacklogRatio),
      alertBacklogRatio: parseFloat(alertBacklogRatio),
      avgAlertPerShift: parseFloat(avgAlertPerShift),
    }
  }, [alerts, cases])

  const COLORS = ["#3b82f6", "#ef4444", "#10b981"]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alert and Case Distribution</h1>
        <Button
          onClick={handleExportToExcel}
          disabled={exporting || !hasSubmitted}
          variant="outline"
          size="sm"
        >
          {exporting ? (
            <>
              <div className="animate-spin mr-2 h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Export to Excel
            </>
          )}
        </Button>
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
        {/* Metric 1: Total Alert */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Alert</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalAlert}</div>
            <p className="text-xs text-muted-foreground mt-1">Alerts per filter</p>
          </CardContent>
        </Card>

        {/* Metric 2: Case Backlog Ratio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Case Backlog Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.caseBacklogRatio}%</div>
            <p className="text-xs text-muted-foreground mt-1">Open/In Progress/Follow-up</p>
          </CardContent>
        </Card>

        {/* Metric 3: Alert Backlog Ratio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alert Backlog Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.alertBacklogRatio}%</div>
            <p className="text-xs text-muted-foreground mt-1">Open/In Progress</p>
          </CardContent>
        </Card>

        {/* Metric 4: Average Alert Per Shift */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Alert Per Shift</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgAlertPerShift}</div>
            <p className="text-xs text-muted-foreground mt-1">Alerts / 3 shifts</p>
          </CardContent>
        </Card>
      </div>

      {!hasSubmitted ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert & Case Distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
              Click "Apply Filters" to load data
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Case Status by Integration</CardTitle>
            </CardHeader>
            <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
              Click "Apply Filters" to load data
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Trend (Daily) by Tag</CardTitle>
            </CardHeader>
            <CardContent className="h-96 flex items-center justify-center text-muted-foreground">
              Click "Apply Filters" to load data
            </CardContent>
          </Card>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-80 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chart 1: Alert & Case per Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert & Case Distribution by Integration</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {alertCasePerIntegrationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alertCasePerIntegrationData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
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
                    <Bar dataKey="alerts" fill="#3b82f6" name="Alerts" />
                    <Bar dataKey="cases" fill="#ef4444" name="Cases" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 2: Stacked Bar Chart Case per Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Case Status by Integration</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {casePerIntegrationData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={casePerIntegrationData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
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
                    <Bar dataKey="open" fill="#3b82f6" name="Open" stackId="a" />
                    <Bar dataKey="in progress" fill="#f59e0b" name="In Progress" stackId="a" />
                    <Bar dataKey="closed" fill="#10b981" name="Closed" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 3: Line Chart Alert Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Trend (Daily) by Tag</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {alertTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={alertTrendData} margin={{ top: 20, right: 30, left: 0, bottom: 60 }}>
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
                    <Line type="monotone" dataKey="True Positive" stroke="#10b981" dot={false} strokeWidth={2} name="True Positive (TP)" />
                    <Line type="monotone" dataKey="Benign True Positive" stroke="#f59e0b" dot={false} strokeWidth={2} name="Benign True Positive (BTP)" />
                    <Line type="monotone" dataKey="False Positive" stroke="#ef4444" dot={false} strokeWidth={2} name="False Positive (FP)" />
                    <Line type="monotone" dataKey="Untagged" stroke="#6b7280" dot={false} strokeWidth={2} name="Untagged" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart 5: Horizontal Bar Chart Alert per Shift */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Alert Distribution by Shift</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {alertPerShiftData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alertPerShiftData} margin={{ top: 20, right: 30, left: 120, bottom: 20 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis 
                      dataKey="shift" 
                      type="category"
                      width={110}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar dataKey="count" name="Alert Count" radius={[0, 8, 8, 0]}>
                      {alertPerShiftData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
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
