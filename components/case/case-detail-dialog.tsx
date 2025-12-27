"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  CalendarIcon,
  UserIcon,
  AlertTriangleIcon,
  ClockIcon,
  TagIcon,
  RefreshCwIcon,
  EyeIcon,
  MessageSquareIcon,
} from "lucide-react"
import { SafeDate } from "@/components/ui/safe-date"
import { AlertDetailDialog } from "@/components/alert/alert-detail-dialog"
import { WazuhAlertDetailDialog } from "@/components/alert/wazuh-alert-detail-dialog"
import { QRadarAlertDetailDialog } from "@/components/alert/qradar-alert-detail-dialog"
import { EventDetailDialog } from "@/components/alert/event-detail-dialog"
import { ASSIGNEES } from "@/components/case/case-action-dialog"

interface CaseDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  case: any
}

interface CaseDetail {
  id: string
  externalId: string
  ticketId: number
  name: string
  description: string
  status: string
  severity: string
  assignee?: string
  assigneeName?: string
  createdAt: Date
  modifiedAt: Date
  acknowledgedAt?: Date
  closedAt?: Date
  startTimestamp?: Date
  endTimestamp?: Date
  score: number
  size: number
  tags: string[]
  version: number
  createdBy?: string
  createdByName?: string
  modifiedBy?: string
  modifiedByName?: string
  custId?: string
  tenantName?: string
  metadata: any
  integration: {
    id: string
    name: string
    source?: string
  }
}

interface Alert {
  _id: string
  alert_name: string
  xdr_event?: {
    display_name?: string
  }
  severity: string
  alert_time: number
  status: string
  source_ip?: string
  dest_ip?: string
  description: string
  metadata: any
  id?: string
  externalId?: string
  title?: string
  timestamp?: string
  srcip?: string
  dstip?: string
  srcport?: number
  dstport?: number
  xdr_desc?: string
  alert_type?: string
}

interface CaseComment {
  id: string
  content: string
  author: string
  caseId: string
  createdAt: string
}

export function CaseDetailDialog({ open, onOpenChange, case: caseData }: CaseDetailDialogProps) {
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [comments, setComments] = useState<CaseComment[]>([])
  const [loading, setLoading] = useState(false)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [alertDetailOpen, setAlertDetailOpen] = useState(false)

  const isWazuhIntegration = (integration?: { source?: string; name?: string }) => {
    const name = integration?.name?.toLowerCase?.() || ""
    return integration?.source === "wazuh" || name.includes("wazuh")
  }

  useEffect(() => {
    if (open && caseData) {
      setCaseDetail(caseData)
      fetchCaseDetails(caseData.id)
      fetchCaseAlerts(caseData.id)
      fetchCaseComments(caseData.id)
      fetchCaseTimeline(caseData.id)
    }
  }, [open, caseData])

  const getAssigneeName = (assigneeId: string | null, assigneeName: string | null): string => {
    if (assigneeName && assigneeName !== "Unassigned" && assigneeName.trim()) {
      return assigneeName
    }
    if (assigneeId) {
      const assignee = ASSIGNEES.find((a) => a.id === assigneeId)
      if (assignee) {
        return assignee.name
      }
    }
    return "Unassigned"
  }

  const fetchCaseDetails = async (id: string) => {
    // Fetch fresh case details from server to ensure we have latest data
    // especially for status, assignee, and timestamps
    try {
      // Determine if this is a Wazuh case based on integration source
      const isWazuh = isWazuhIntegration(caseData?.integration)
      
      let endpoint = `/api/cases/${id}`
      if (isWazuh) {
        endpoint = `/api/wazuh/cases?caseId=${id}`
      }
      
      console.log("Fetching case details from:", endpoint)
      const response = await fetch(endpoint)
      const data = await response.json()
      
      if (isWazuh && data.cases && data.cases[0]) {
        // For Wazuh, the API returns an array of cases, so take the first one
        // Transform to match CaseDetail interface
        const wazuhCase = data.cases[0]
        
        // If case severity is not set, try to get it from the first alert
        let caseSeverity = wazuhCase.severity || "Medium"
        if (!wazuhCase.severity && wazuhCase.alerts && wazuhCase.alerts.length > 0) {
          const firstAlert = wazuhCase.alerts[0]?.alert || wazuhCase.alerts[0]
          caseSeverity = firstAlert?.severity || "Medium"
        }
        
        const transformedCase = {
          id: wazuhCase.id,
          externalId: wazuhCase.caseNumber,
          ticketId: parseInt(wazuhCase.caseNumber) || 0,
          name: wazuhCase.title || `Case ${wazuhCase.caseNumber}`,
          description: wazuhCase.description || "",
          status: wazuhCase.status === "open" ? "New" : wazuhCase.status === "in_progress" ? "In Progress" : "Resolved",
          severity: caseSeverity,
          assignee: wazuhCase.assignee?.name,
          assigneeName: wazuhCase.assignee?.name,
          createdAt: new Date(wazuhCase.createdAt),
          modifiedAt: new Date(wazuhCase.updatedAt),
          createdBy: wazuhCase.createdBy,
          metadata: {},
          integration: caseData.integration || { id: "", name: "Wazuh" },
          alerts: wazuhCase.alerts, // Include alerts from Wazuh case
        } as any
        console.log("Fetched Wazuh case details:", transformedCase)
        setCaseDetail(transformedCase)
      } else if (data.success && data.data) {
        setCaseDetail(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch case details:", error)
    }
  }

  const fetchCaseAlerts = async (id: string) => {
    if (!id) return

    setAlertsLoading(true)
    try {
      console.log("Frontend: Fetching alerts for case:", id)
      console.log("Frontend: Integration source:", caseDetail?.integration?.source)
      console.log("Frontend: caseDetail available:", !!caseDetail)

      // Check if this is a Wazuh case
      if (isWazuhIntegration(caseDetail?.integration ?? caseData?.integration)) {
        console.log("Frontend: This is a Wazuh case")
        
        // For Wazuh cases, if caseDetail has alerts, use them directly
        if (caseDetail?.alerts && Array.isArray(caseDetail.alerts) && caseDetail.alerts.length > 0) {
          console.log("Frontend: Using alerts from caseDetail, count:", caseDetail.alerts.length)
          
          const transformedAlerts = caseDetail.alerts.map((caseAlert: any) => {
            const alert = caseAlert.alert || caseAlert;
            console.log("Frontend: Processing alert:", alert)

            // Preserve and augment metadata with top-level hash fields if present
            const meta = Object.assign({}, alert.metadata || {})
            // Ensure data_id (HTTP response code) is preserved from possible locations
            if (!meta.data_id) meta.data_id = alert.data_id || alert.dataId || alert.metadata?.data_id || alert.metadata?.dataId || alert.raw_es?.data_id || alert.raw_es?.id || alert.data?.id || undefined
            if (!meta.hash_sha256 && alert.hash_sha256) meta.hash_sha256 = alert.hash_sha256
            if (!meta.sha256 && alert.sha256) meta.sha256 = alert.sha256
            if (!meta.sacti_search && alert.sacti_search) meta.sacti_search = alert.sacti_search
            if (!meta.data_win_eventdata_hashes && alert.data_win_eventdata_hashes) meta.data_win_eventdata_hashes = alert.data_win_eventdata_hashes
            if (!meta.md5 && alert.md5) meta.md5 = alert.md5
            if (!meta.sha1 && alert.sha1) meta.sha1 = alert.sha1

            // For Wazuh alerts, preserve full metadata structure so WazuhAlertDetailDialog can access it
            return {
              _id: alert.id,
              alert_name: alert.title,
              xdr_event: {
                display_name: alert.title,
              },
              severity: alert.severity || "Unknown",
              alert_time: alert.timestamp ? new Date(alert.timestamp).getTime() : 0,
              status: alert.status || "Unknown",
              source_ip: alert.metadata?.srcIp || alert.metadata?.srcip,
              dest_ip: alert.metadata?.dstIp || alert.metadata?.dstip,
              description: alert.description,
              metadata: meta,
              id: alert.id,
              externalId: alert.externalId,
              title: alert.title,
              timestamp: alert.timestamp,
              // Pass full alert object structure for Wazuh
              rule: {
                id: alert.metadata?.ruleId || alert.rule?.id,
                level: alert.metadata?.ruleLevel || alert.rule?.level,
                description: alert.metadata?.ruleDescription || alert.rule?.description,
                groups: alert.metadata?.ruleGroups || alert.rule?.groups,
                mitre: alert.rule?.mitre,
                pci_dss: alert.rule?.pci_dss,
                gdpr: alert.rule?.gdpr,
                hipaa: alert.rule?.hipaa,
                nist_800_53: alert.rule?.nist_800_53,
              },
              agent: {
                id: alert.metadata?.agentId || alert.agent?.id,
                name: alert.metadata?.agentName || alert.agent?.name,
                ip: alert.metadata?.agentIp || alert.agent?.ip,
                labels: alert.metadata?.agentLabels || alert.agent?.labels,
              },
              manager: {
                name: alert.metadata?.managerId || alert.manager?.name,
              },
              srcIp: alert.metadata?.srcIp || alert.metadata?.srcip,
              dstIp: alert.metadata?.dstIp || alert.metadata?.dstip,
              srcPort: alert.metadata?.srcPort || alert.metadata?.srcport,
              dstPort: alert.metadata?.dstPort || alert.metadata?.dstport,
              protocol: alert.metadata?.protocol,
            }
          })
          
          setAlerts(transformedAlerts)
          console.log("Frontend: Successfully transformed and set alerts from caseDetail:", transformedAlerts.length)
        } else {
          console.log("Frontend: No alerts in caseDetail, attempting API fetch")
          
          // If no alerts in caseDetail, try fetching from API
          const response = await fetch(`/api/wazuh/cases?caseId=${id}`)
          const data = await response.json()
          
          console.log("Frontend: API response for Wazuh case:", data)
          
          if (data.cases && data.cases[0] && data.cases[0].alerts) {
            const transformedAlerts = data.cases[0].alerts.map((caseAlert: any) => {
              const alert = caseAlert.alert || caseAlert;
              const meta = Object.assign({}, alert.metadata || {})
              // Ensure data_id (HTTP response code) is preserved from possible locations
              if (!meta.data_id) meta.data_id = alert.data_id || alert.dataId || alert.metadata?.data_id || alert.metadata?.dataId || alert.raw_es?.data_id || alert.raw_es?.id || alert.data?.id || undefined
              if (!meta.hash_sha256 && alert.hash_sha256) meta.hash_sha256 = alert.hash_sha256
              if (!meta.sha256 && alert.sha256) meta.sha256 = alert.sha256
              if (!meta.sacti_search && alert.sacti_search) meta.sacti_search = alert.sacti_search
              if (!meta.data_win_eventdata_hashes && alert.data_win_eventdata_hashes) meta.data_win_eventdata_hashes = alert.data_win_eventdata_hashes
              if (!meta.md5 && alert.md5) meta.md5 = alert.md5
              if (!meta.sha1 && alert.sha1) meta.sha1 = alert.sha1

              return {
                _id: alert.id,
                alert_name: alert.title,
                xdr_event: {
                  display_name: alert.title,
                },
                severity: alert.severity || "Unknown",
                alert_time: alert.timestamp ? new Date(alert.timestamp).getTime() : 0,
                status: alert.status || "Unknown",
                source_ip: alert.metadata?.srcIp || alert.metadata?.srcip,
                dest_ip: alert.metadata?.dstIp || alert.metadata?.dstip,
                description: alert.description,
                metadata: meta,
                id: alert.id,
                externalId: alert.externalId,
                title: alert.title,
                timestamp: alert.timestamp,
                // Pass full alert object structure for Wazuh
                rule: {
                  id: alert.metadata?.ruleId || alert.rule?.id,
                  level: alert.metadata?.ruleLevel || alert.rule?.level,
                  description: alert.metadata?.ruleDescription || alert.rule?.description,
                  groups: alert.metadata?.ruleGroups || alert.rule?.groups,
                  mitre: alert.rule?.mitre,
                  pci_dss: alert.rule?.pci_dss,
                  gdpr: alert.rule?.gdpr,
                  hipaa: alert.rule?.hipaa,
                  nist_800_53: alert.rule?.nist_800_53,
                },
                agent: {
                  id: alert.metadata?.agentId || alert.agent?.id,
                  name: alert.metadata?.agentName || alert.agent?.name,
                  ip: alert.metadata?.agentIp || alert.agent?.ip,
                  labels: alert.metadata?.agentLabels || alert.agent?.labels,
                },
                manager: {
                  name: alert.metadata?.managerId || alert.manager?.name,
                },
                srcIp: alert.metadata?.srcIp || alert.metadata?.srcip,
                dstIp: alert.metadata?.dstIp || alert.metadata?.dstip,
                srcPort: alert.metadata?.srcPort || alert.metadata?.srcport,
                dstPort: alert.metadata?.dstPort || alert.metadata?.dstport,
                protocol: alert.metadata?.protocol,
              }
            })
            
            setAlerts(transformedAlerts)
            console.log("Frontend: Successfully fetched and transformed alerts from API:", transformedAlerts.length)
          } else {
            console.error("Frontend: No alerts found in API response", data)
            // Fallback: try the generic case alerts endpoint in case Wazuh API returned empty
            try {
              console.log("Frontend: Falling back to /api/cases/{id}/alerts")
              const fallbackResp = await fetch(`/api/cases/${id}/alerts`)
              const fallbackData = await fallbackResp.json()
              console.log("Frontend: Fallback alerts response:", fallbackData)
              if (fallbackData.success && fallbackData.data) {
                const alertsData = fallbackData.data.alerts || fallbackData.data || []
                if (Array.isArray(alertsData) && alertsData.length > 0) {
                  const transformedAlerts = alertsData.map((alert: any) => ({
                    _id: alert.metadata?.alert_id || alert.externalId || alert.id || alert._id,
                    alert_name: alert.metadata?.alert_name || alert.title || alert.alert_name || "Unknown",
                    severity: String(alert.metadata?.severity || alert.severity || "Unknown"),
                    alert_time: alert.alert_time || (alert.timestamp ? new Date(alert.timestamp).getTime() : 0),
                    status: alert.metadata?.event_status || alert.status || "Unknown",
                    metadata: alert.metadata || {},
                    id: alert.id,
                    externalId: alert.externalId,
                    title: alert.title,
                    timestamp: alert.timestamp,
                  }))
                  setAlerts(transformedAlerts)
                  console.log("Frontend: Set alerts from fallback endpoint:", transformedAlerts.length)
                } else {
                  setAlerts([])
                }
              } else {
                setAlerts([])
              }
            } catch (fbErr) {
              console.error("Frontend: Fallback fetch failed:", fbErr)
              setAlerts([])
            }
          }
        }
      } else {
        // For other integrations, use original API
        console.log("Frontend: Using original API for non-Wazuh case")
        console.log("Frontend: Integration source:", caseDetail?.integration?.source)
        const response = await fetch(`/api/cases/${id}/alerts`)
        const data = await response.json()

        console.log("Frontend: Alerts response:", data)

        if (data.success && data.data) {
          const alertsData = data.data.alerts || data.data || []
          console.log("Frontend: Extracted alerts data:", alertsData)

          if (Array.isArray(alertsData)) {
            const transformedAlerts = alertsData.map((alert: any, idx: number) => {
              console.log(`[${idx}] Alert object:`, {
                alert_time: alert.alert_time,
                timestamp: alert.timestamp,
                metadata_alert_time: alert.metadata?.alert_time,
                metadata_timestamp: alert.metadata?.timestamp,
                all_keys: Object.keys(alert).filter(k => k.includes('time') || k.includes('date'))
              })
              console.log("Transforming alert:", alert)

              const alertName =
                alert.metadata?.alert_name ||
                alert.title ||
                alert.metadata?.xdr_event?.display_name ||
                alert.metadata?.event_name ||
                alert.alert_name ||
                "Unknown Alert"

              const alertId = alert.metadata?.alert_id || alert.externalId || alert.id || alert._id

              let alertTime = 0
              // Priority: alert_time (top-level) > metadata.alert_time > metadata.stellar.alert_time > timestamp (last resort)
              if (alert.alert_time) {
                // alert_time from Stellar Cyber API - already in milliseconds
                const time = alert.alert_time
                alertTime = (typeof time === "number") ? time : new Date(time).getTime()
              } else if (alert.metadata?.stellar?.alert_time) {
                // Stellar object within metadata
                const time = alert.metadata.stellar.alert_time
                alertTime = (typeof time === "number") ? time : new Date(time).getTime()
              } else if (alert.metadata?.alert_time) {
                // If already in milliseconds, use as-is
                const time = alert.metadata.alert_time
                alertTime = (typeof time === "number") ? time : new Date(time).getTime()
              } else if (alert.timestamp) {
                const time = alert.timestamp
                alertTime = (typeof time === "number") ? time : new Date(time).getTime()
              } else if (alert.metadata?.timestamp) {
                alertTime = new Date(alert.metadata.timestamp).getTime()
              }
              
              console.log(`Alert ${alert._id}: alert_time raw=${alert.alert_time}, converted=${alertTime}`)

              // For QRadar integrations, check if this is an event or offense
              let metadata = alert.metadata || {}
              let isEvent = alert.isQRadarEvent || false
              
              if (caseDetail?.integration?.source === "qradar" && !isEvent) {
                // Check if this is an event (has event-level fields like qid, sourceip) or offense
                // Events have metadata with event fields, not offense fields
                if (alert.metadata?.qid || alert.metadata?.sourceip || (alert.metadata && !alert.metadata.offense_type)) {
                  // This is a QRadar event, not an offense
                  isEvent = true
                } else if (!metadata.qradar) {
                  // Map QRadar event data to expected qradar format for offenses
                  metadata.qradar = {
                    id: alert.metadata?.qid || alert.id,
                    status: alert.status || "N/A",
                    severity: alert.severity || alert.metadata?.severity || 0,
                    offense_type: alert.metadata?.offense_type || "Unknown",
                    start_time: alert.alert_time || alert.timestamp || Date.now(),
                    last_update_time: alert.alert_time || alert.timestamp || Date.now(),
                    event_count: 1,
                    device_count: 0,
                  }
                }
              }

              const transformedAlert = {
                _id: alertId,
                alert_name: alertName,
                xdr_event: {
                  display_name: alertName,
                },
                severity: String(alert.metadata?.severity || alert.severity || "Unknown"),
                alert_time: alertTime,
                status: alert.metadata?.event_status || alert.status || "Unknown",
                source_ip: alert.metadata?.srcip || alert.metadata?.source_ip || alert.source_ip || alert.metadata?.sourceip,
                dest_ip: alert.metadata?.dstip || alert.metadata?.dest_ip || alert.dest_ip || alert.metadata?.destinationip,
                description: alert.metadata?.xdr_desc || alert.description || alert.metadata?.description || "",
                metadata: metadata,
                id: alert.id,
                externalId: alert.externalId,
                title: alert.title || alertName,
                timestamp: alert.timestamp || alertTime,
                srcip: alert.metadata?.srcip || alert.source_ip || alert.metadata?.sourceip,
                dstip: alert.metadata?.dstip || alert.dest_ip || alert.metadata?.destinationip,
                srcport: alert.metadata?.srcport || alert.source_port || alert.metadata?.sourceport,
                dstport: alert.metadata?.dstport || alert.dest_port || alert.metadata?.destinationport,
                xdr_desc: alert.metadata?.xdr_desc || alert.description,
                alert_type: alert.metadata?.alert_type || alert.metadata?.event_type,
                isEvent: isEvent,  // Flag to indicate this is a QRadar event
                // Include summary from alert if available (for EventDetailDialog)
                summary: alert.summary || alert.metadata?.summary || "",
                // For EventDetailDialog (QRadar events), spread all normalized metadata fields
                ...(isEvent && alert.metadata ? alert.metadata : {}),
              }

              console.log("Transformed alert:", transformedAlert)
              return transformedAlert
            })

            setAlerts(transformedAlerts)
            console.log("Frontend: Successfully set alerts:", transformedAlerts.length)
          } else {
            console.error("Frontend: Alerts data is not an array:", typeof alertsData)
            setAlerts([])
          }
        } else {
          console.error("Frontend: Failed to fetch alerts:", data.error || "Unknown error")
          setAlerts([])
        }
      }
    } catch (error) {
      console.error("Frontend: Error fetching case alerts:", error)
      setAlerts([])
    } finally {
      setAlertsLoading(false)
    }
  }

  const fetchCaseComments = async (id: string) => {
    if (!id) return

    setCommentsLoading(true)
    try {
      console.log("Frontend: Fetching comments for case:", id)
      const response = await fetch(`/api/cases/${id}/comments`)
      const data = await response.json()

      console.log("Frontend: Comments response:", data)

      if (data.success && data.data) {
        setComments(data.data)
        console.log("Frontend: Successfully set comments:", data.data.length)
      } else {
        console.error("Frontend: Failed to fetch comments:", data.error || "Unknown error")
        setComments([])
      }
    } catch (error) {
      console.error("Frontend: Error fetching case comments:", error)
      setComments([])
    } finally {
      setCommentsLoading(false)
    }
  }

  const fetchCaseTimeline = async (id: string) => {
    if (!id) return

    setTimelineLoading(true)
    try {
      console.log("Frontend: Fetching timeline for case:", id)
      const response = await fetch(`/api/cases/${id}/timeline`)
      const data = await response.json()

      console.log("Frontend: Timeline response:", data)

      if (data.success && data.data) {
        setTimelineEvents(data.data)
        console.log("Frontend: Successfully set timeline events:", data.data.length)
      } else {
        console.error("Frontend: Failed to fetch timeline:", data.error || "Unknown error")
        setTimelineEvents([])
      }
    } catch (error) {
      console.error("Frontend: Error fetching case timeline:", error)
      setTimelineEvents([])
    } finally {
      setTimelineLoading(false)
    }
  }

  const handleViewAlertDetail = (alert: Alert) => {
    console.log("Opening alert detail for:", alert)
    setSelectedAlert(alert)
    setAlertDetailOpen(true)
  }

  const getSeverityColor = (severity: unknown) => {
    if (typeof severity !== "string") return "outline"

    switch (severity.toLowerCase()) {
      case "critical":
        return "destructive"
      case "high":
        return "destructive"
      case "medium":
        return "default"
      case "low":
        return "secondary"
      default:
        return "outline"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
      case "new":
        return "destructive"
      case "in progress":
        return "default"
      case "resolved":
        return "secondary"
      case "closed":
      case "cancelled":
        return "outline"
      default:
        return "outline"
    }
  }

  const toMillis = (value: any): number => {
    if (value === null || value === undefined) return NaN
    if (value instanceof Date) return value.getTime()
    if (typeof value === "number") return value < 1e12 ? value * 1000 : value
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? NaN : parsed
  }

  const extractAlertTimestamp = (rawAlert: any): number => {
    const a = rawAlert?.alert ?? rawAlert
    const candidates = [
      a?.timestamp,
      a?.alert_time,
      a?.alertTime,
      a?.event_time,
      a?.metadata?.timestamp,
      a?.metadata?.alert_time,
      a?.metadata?.alertTime,
    ]
    for (const c of candidates) {
      const ts = toMillis(c)
      if (Number.isFinite(ts)) return ts
    }
    return NaN
  }

  const getWazuhMttr = () => {
    if (!isWazuhIntegration(caseDetail?.integration)) return null
    const alertList = alerts?.length ? alerts : (caseDetail as any)?.alerts || []
    if (!alertList || alertList.length === 0 || !caseDetail?.createdAt) return null

    const firstAlertMs = alertList
      .map((a: any) => extractAlertTimestamp(a))
      .filter((ts: number) => Number.isFinite(ts))
      .reduce((min: number, ts: number) => Math.min(min, ts), Infinity)

    const createdMs = toMillis(caseDetail.createdAt)
    if (!Number.isFinite(firstAlertMs) || !Number.isFinite(createdMs)) return null

    const mttrMinutes = Math.max(0, Math.round((createdMs - firstAlertMs) / 60000))
    return { firstAlertMs, createdMs, mttrMinutes }
  }

  const getQRadarMttr = () => {
    if (caseDetail?.integration?.source !== "qradar") return null
    
    // Alert created timestamp - from timeline event "created" (alert.timestamp)
    let alertCreatedMs = NaN
    
    if (timelineEvents && timelineEvents.length > 0) {
      const createdEvent = timelineEvents.find((e: any) => e.eventType === 'created')
      if (createdEvent?.timestamp) {
        alertCreatedMs = toMillis(createdEvent.timestamp)
      }
    }
    
    // Case created timestamp - from timeline event "updated" (alert.updatedAt - when marked as follow-up)
    let caseCreatedMs = NaN
    
    if (timelineEvents && timelineEvents.length > 0) {
      const updatedEvent = timelineEvents.find((e: any) => e.eventType === 'updated')
      if (updatedEvent?.timestamp) {
        caseCreatedMs = toMillis(updatedEvent.timestamp)
      }
    }
    
    // Fallback if timeline not available
    if (!Number.isFinite(alertCreatedMs) && caseDetail?.createdAt) {
      alertCreatedMs = toMillis(caseDetail.createdAt)
    }
    
    if (!Number.isFinite(caseCreatedMs) && caseDetail?.modifiedAt) {
      caseCreatedMs = toMillis(caseDetail.modifiedAt)
    }

    if (!Number.isFinite(caseCreatedMs) || !Number.isFinite(alertCreatedMs)) return null

    const mttrMinutes = Math.max(0, Math.round((caseCreatedMs - alertCreatedMs) / 60000))
    return { alertCreatedMs, createdMs: caseCreatedMs, mttrMinutes }
  }

  const getStellarMttr = () => {
    if (caseDetail?.integration?.source !== "stellar_cyber" && !caseDetail?.integration?.source?.includes("stellar")) return null

    console.log("getStellarMttr - caseDetail metadata:", caseDetail?.metadata?.latest_alert_time)

    // Get latest alert time from metadata (stored during sync in milliseconds)
    let latestAlertTimeMs = caseDetail?.metadata?.latest_alert_time
    
    // Ensure it's in milliseconds format
    if (typeof latestAlertTimeMs === "number") {
      // If it looks like seconds (< 1000000000000 = year 2001 in ms), convert to ms
      if (latestAlertTimeMs < 1000000000000 && latestAlertTimeMs > 0) {
        latestAlertTimeMs = latestAlertTimeMs * 1000
      }
    } else {
      latestAlertTimeMs = toMillis(latestAlertTimeMs)
    }
    
    const caseCreatedMs = toMillis(caseDetail?.createdAt)

    if (!Number.isFinite(caseCreatedMs) || !Number.isFinite(latestAlertTimeMs)) return null

    const mttrMinutes = Math.max(0, Math.round((caseCreatedMs - latestAlertTimeMs) / 60000))
    return { alertCreatedMs: latestAlertTimeMs, createdMs: caseCreatedMs, mttrMinutes }
  }

  const formatDateTime = (value: any) => {
    if (!value && value !== 0) return "N/A"
    try {
      const date = new Date(toMillis(value))
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleString()
    } catch {
      return String(value)
    }
  }

  const formatAlertTime = (timestamp: number) => {
    try {
      if (!timestamp || timestamp === 0) return "N/A"

      const date = new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000)

      if (isNaN(date.getTime())) return "N/A"

      return date.toLocaleString()
    } catch (error) {
      console.error("Error formatting alert time:", error)
      return "N/A"
    }
  }

  // Create timeline events from case data and comments
  const getTimelineEvents = () => {
    const events = []

    // If we have timeline events from database (Wazuh, QRadar, or Stellar Cyber cases)
    if (timelineEvents && timelineEvents.length > 0) {
      timelineEvents.forEach((event: any) => {
        const eventTypeMap: Record<string, string> = {
          created: "create",
          status_change: "modify",
          assignee_change: "modify",
          severity_change: "modify",
          resolved: "close",
          closed: "close",
          acknowledged: "acknowledge",
          modified: "modify",
          updated: "modify",
        }

        const titleMap: Record<string, string> = {
          created: "Case Created",
          status_change: "Status Changed",
          assignee_change: "Assignee Changed",
          severity_change: "Severity Changed",
          resolved: "Case Resolved",
          closed: "Case Closed",
          acknowledged: "Case Acknowledged",
          modified: "Case Modified",
          updated: "Case Updated",
        }

        events.push({
          type: event.eventType,
          timestamp: new Date(event.timestamp),
          title: titleMap[event.eventType] || "Updated",
          description: event.description,
          changedBy: event.changedBy,
          changedByUser: event.changedByUser,
          icon: eventTypeMap[event.eventType] || "modify",
        })
      })
    } else {
      // Fallback for cases without timeline events (shouldn't happen for Stellar Cyber, but kept for safety)
      // Case created event
      if (caseDetail?.createdAt) {
        events.push({
          type: "created",
          timestamp: new Date(caseDetail.createdAt),
          title: "Case Created",
          description: `Created by ${caseDetail.createdByName || caseDetail.createdBy || "System"}`,
          icon: "create",
        })
      }

      // Case acknowledged event
      if (caseDetail?.acknowledgedAt) {
        events.push({
          type: "acknowledged",
          timestamp: new Date(caseDetail.acknowledgedAt),
          title: "Case Acknowledged",
          description: "Case was acknowledged",
          icon: "acknowledge",
        })
      }

      // Add comments as timeline events
      comments.forEach((comment) => {
        events.push({
          type: "comment",
          timestamp: new Date(comment.createdAt),
          title: "Case Updated",
          description: comment.content,
          author: comment.author,
          icon: "comment",
        })
      })

      // Case modified event (if different from created)
      if (caseDetail?.modifiedAt && caseDetail.modifiedAt !== caseDetail.createdAt) {
        events.push({
          type: "modified",
          timestamp: new Date(caseDetail.modifiedAt),
          title: "Last Modified",
          description: `Modified by ${caseDetail.modifiedByName || caseDetail.modifiedBy || "System"}`,
          icon: "modify",
        })
      }

      // Case closed event
      if (caseDetail?.closedAt) {
        events.push({
          type: "closed",
          timestamp: new Date(caseDetail.closedAt),
          title: "Case Closed",
          description: "Case was closed",
          icon: "close",
        })
      }
    }

    // Add comments separately (if not from Wazuh timeline)
    if (!isWazuhIntegration(caseDetail?.integration) && comments.length > 0) {
      comments.forEach((comment) => {
        events.push({
          type: "comment",
          timestamp: new Date(comment.createdAt),
          title: "Case Comment",
          description: comment.content,
          author: comment.author,
          icon: "comment",
        })
      })
    }

    // Sort by timestamp ascending (oldest first)
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case "created":
        return "w-2 h-2 bg-blue-500 rounded-full mt-2"
      case "acknowledged":
        return "w-2 h-2 bg-yellow-500 rounded-full mt-2"
      case "comment":
        return "w-2 h-2 bg-green-500 rounded-full mt-2"
      case "modified":
        return "w-2 h-2 bg-orange-500 rounded-full mt-2"
      case "closed":
        return "w-2 h-2 bg-gray-500 rounded-full mt-2"
      default:
        return "w-2 h-2 bg-gray-400 rounded-full mt-2"
    }
  }

  if (!open) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-7xl w-[98vw] max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5" />
              Case Details
              {caseDetail && (
                <Badge variant="outline" className="ml-2">
                  #{caseDetail.ticketId}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {caseDetail ? `Viewing details for case: ${caseDetail.name}` : "Loading case details..."}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCwIcon className="h-8 w-8 animate-spin" />
            </div>
          ) : caseDetail ? (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3 overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="alerts">Related Alerts ({alerts.length})</TabsTrigger>
                <TabsTrigger value="timeline">Timeline ({getTimelineEvents().length})</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Basic Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {caseDetail.integration?.source === "qradar" ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Offense ID</label>
                                <p className="text-sm font-medium">{caseDetail.metadata?.qradar?.id || caseDetail.externalId}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Status</label>
                                <Badge variant={getStatusColor(caseDetail.status || (caseDetail.metadata?.qradar?.status || "Open"))}>
                                  {caseDetail.status || (caseDetail.metadata?.qradar?.status || "Open")}
                                </Badge>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Severity (numeric)</label>
                                <p className="text-sm font-medium">{caseDetail.metadata?.qradar?.severity ?? caseDetail.severity}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Events Count</label>
                                <p className="text-sm font-medium">{caseDetail.metadata?.qradar?.event_count ?? "N/A"}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Assigned To</label>
                                <p className="text-sm font-medium">{caseDetail.metadata?.qradar?.assigned_to || "Unassigned"}</p>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-muted-foreground">Categories</label>
                                <p className="text-sm font-medium">{(caseDetail.metadata?.qradar?.categories || []).slice(0, 5).join(", ") || "-"}</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Case Name</label>
                              <p className="text-sm font-medium">{caseDetail.name}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Ticket ID</label>
                              <p className="text-sm font-medium">#{caseDetail.ticketId}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Status</label>
                              <Badge variant={getStatusColor(caseDetail.status)}>{caseDetail.status}</Badge>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Severity</label>
                              {caseDetail.severity ? (
                                <Badge variant={getSeverityColor(caseDetail.severity)}>{caseDetail.severity}</Badge>
                              ) : (
                                <Badge variant="outline">Not Set</Badge>
                              )}
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Score</label>
                              <p className="text-sm font-medium">{caseDetail.score}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Size</label>
                              <p className="text-sm font-medium">{caseDetail.size}</p>
                            </div>
                          </div>
                        )}

                        <Separator />

                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Description</label>
                          <p className="text-sm mt-1">{caseDetail.description || "No description available"}</p>
                        </div>

                        {caseDetail.tags && caseDetail.tags.length > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Tags</label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {caseDetail.tags.map((tag, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  <TagIcon className="h-3 w-3 mr-1" />
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {isWazuhIntegration(caseDetail.integration) && getWazuhMttr() && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">MTTR</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(() => {
                            const mttr = getWazuhMttr()
                            if (!mttr) return null
                            return (
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">First Alert</label>
                                  <p className="text-sm font-medium">{formatDateTime(mttr.firstAlertMs)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Case Created</label>
                                  <p className="text-sm font-medium">{formatDateTime(mttr.createdMs)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">MTTR</label>
                                  <p className="text-sm font-medium">
                                    {mttr.mttrMinutes >= 1 ? `${Math.round(mttr.mttrMinutes)} minutes` : `${Math.max(0, Math.round(mttr.mttrMinutes * 60))} seconds`}
                                  </p>
                                </div>
                              </div>
                            )
                          })()}
                        </CardContent>
                      </Card>
                    )}

                    {caseDetail?.integration?.source === "qradar" && getQRadarMttr() && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">MTTR</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(() => {
                            const mttr = getQRadarMttr()
                            if (!mttr) return null
                            return (
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Alert Created</label>
                                  <p className="text-sm font-medium">{formatDateTime(mttr.alertCreatedMs)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Case Created</label>
                                  <p className="text-sm font-medium">{formatDateTime(mttr.createdMs)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">MTTR</label>
                                  <p className="text-sm font-medium">
                                    {mttr.mttrMinutes >= 1 ? `${Math.round(mttr.mttrMinutes)} minutes` : `${Math.max(0, Math.round(mttr.mttrMinutes * 60))} seconds`}
                                  </p>
                                </div>
                              </div>
                            )
                          })()}
                        </CardContent>
                      </Card>
                    )}

                    {(caseDetail?.integration?.source === "stellar_cyber" || caseDetail?.integration?.source?.includes("stellar")) && getStellarMttr() && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">MTTR</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(() => {
                            const mttr = getStellarMttr()
                            if (!mttr) return null
                            return (
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Latest Alert Created</label>
                                  <p className="text-sm font-medium">{formatDateTime(mttr.alertCreatedMs)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Case Created</label>
                                  <p className="text-sm font-medium">{formatDateTime(mttr.createdMs)}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">MTTR</label>
                                  <p className="text-sm font-medium">
                                    {mttr.mttrMinutes >= 1 ? `${Math.round(mttr.mttrMinutes)} minutes` : `${Math.max(0, Math.round(mttr.mttrMinutes * 60))} seconds`}
                                  </p>
                                </div>
                              </div>
                            )
                          })()}
                        </CardContent>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Assignment</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Assignee</label>
                            <div className="flex items-center gap-2 mt-1">
                              <UserIcon className="h-4 w-4 text-muted-foreground" />
                              <p className="text-sm">
                                {getAssigneeName(caseDetail.assignee, caseDetail.assigneeName)}
                              </p>
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Integration</label>
                            <p className="text-sm font-medium">{caseDetail.integration.name}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Timeline</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Created</label>
                            <div className="flex items-center gap-2 mt-1">
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                              <SafeDate date={caseDetail.createdAt} />
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Last Modified</label>
                            <div className="flex items-center gap-2 mt-1">
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                              <SafeDate date={caseDetail.modifiedAt} />
                            </div>
                          </div>
                          {caseDetail.acknowledgedAt && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Acknowledged</label>
                              <div className="flex items-center gap-2 mt-1">
                                <ClockIcon className="h-4 w-4 text-muted-foreground" />
                                <SafeDate date={caseDetail.acknowledgedAt} />
                              </div>
                            </div>
                          )}
                          {caseDetail.closedAt && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Closed</label>
                              <div className="flex items-center gap-2 mt-1">
                                <ClockIcon className="h-4 w-4 text-muted-foreground" />
                                <SafeDate date={caseDetail.closedAt} />
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Audit Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Created By</label>
                            <p className="text-sm">{caseDetail.createdByName || caseDetail.createdBy || "System"}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Modified By</label>
                            <p className="text-sm">{caseDetail.modifiedByName || caseDetail.modifiedBy || "System"}</p>
                          </div>
                          {caseDetail.tenantName && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Tenant</label>
                              <p className="text-sm">{caseDetail.tenantName}</p>
                            </div>
                          )}
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Version</label>
                            <p className="text-sm">{caseDetail.version}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="alerts" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Related Alerts
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchCaseAlerts(caseDetail.id)}
                        disabled={alertsLoading}
                      >
                        <RefreshCwIcon className={`h-4 w-4 mr-2 ${alertsLoading ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </CardTitle>
                    <CardDescription>Alerts associated with this case</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {alertsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCwIcon className="h-8 w-8 animate-spin" />
                        <p className="ml-2 text-muted-foreground">Loading alerts...</p>
                      </div>
                    ) : alerts.length > 0 ? (
                      <div className="h-[400px] w-full overflow-auto">
                        <div className="min-w-[1200px] pr-4">
                          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                            <p className="text-sm text-green-800">Found {alerts.length} alert(s) for this case</p>
                          </div>
                          <Table className="min-w-full table-auto">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[220px]">Alert Name</TableHead>
                                <TableHead className="min-w-[100px]">Severity</TableHead>
                                <TableHead className="min-w-[100px]">Status</TableHead>
                                <TableHead className="min-w-[150px]">Source IP</TableHead>
                                <TableHead className="min-w-[150px]">Dest IP</TableHead>
                                <TableHead className="min-w-[150px]">Time</TableHead>
                                <TableHead className="min-w-[140px]">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {alerts.map((alert, index) => (
                                <TableRow key={alert._id || index}>
                                  <TableCell className="font-medium">{alert.alert_name || "Unknown Alert"}</TableCell>
                                  <TableCell>
                                    <Badge variant={getSeverityColor(alert.severity)}>
                                      {alert.severity || "Unknown"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{alert.status || "Unknown"}</Badge>
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {alert.source_ip || alert.srcip || "N/A"}
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {alert.dest_ip || alert.dstip || "N/A"}
                                  </TableCell>
                                  <TableCell className="text-sm">{formatAlertTime(alert.alert_time)}</TableCell>
                                  <TableCell>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleViewAlertDetail(alert)}
                                      className="h-8 px-2"
                                    >
                                      <EyeIcon className="h-4 w-4 mr-1" />
                                      View
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <AlertTriangleIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No alerts found for this case</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          {caseDetail.integration?.source === "qradar"
                            ? "Try refreshing or verify the offense has related events in QRadar."
                            : "Try refreshing or check if the case has associated alerts in Stellar Cyber"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquareIcon className="h-5 w-5" />
                        Case Timeline
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          fetchCaseComments(caseDetail.id)
                          fetchCaseTimeline(caseDetail.id)
                        }}
                        disabled={commentsLoading || timelineLoading}
                      >
                        <RefreshCwIcon className={`h-4 w-4 mr-2 ${commentsLoading || timelineLoading ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </CardTitle>
                    <CardDescription>Chronological history of case events and updates</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {commentsLoading || timelineLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCwIcon className="h-8 w-8 animate-spin" />
                        <p className="ml-2 text-muted-foreground">Loading timeline...</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-4">
                          {getTimelineEvents().map((event, index) => (
                            <div key={index} className="flex items-start gap-3">
                              <div className={getEventIcon(event.type)}></div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium">{event.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    <SafeDate date={event.timestamp} />
                                  </p>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                                {event.changedBy && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    by{event.changedByUser?.name ? ` ${event.changedByUser.name}` : ` ${event.changedBy}`}
                                  </p>
                                )}
                                {event.author && (
                                  <p className="text-xs text-muted-foreground mt-1">by {event.author}</p>
                                )}
                              </div>
                            </div>
                          ))}
                          {getTimelineEvents().length === 0 && (
                            <div className="text-center py-8">
                              <MessageSquareIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                              <p className="text-muted-foreground">No timeline events found</p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-8">
              <AlertTriangleIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Case not found</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Show appropriate alert detail dialog based on integration type and alert type */}
      {isWazuhIntegration(caseDetail?.integration) ? (
        <WazuhAlertDetailDialog open={alertDetailOpen} onOpenChange={setAlertDetailOpen} alert={selectedAlert} />
      ) : caseDetail?.integration?.source === "qradar" && selectedAlert?.isEvent ? (
        <EventDetailDialog open={alertDetailOpen} onOpenChange={setAlertDetailOpen} event={selectedAlert} />
      ) : caseDetail?.integration?.source === "qradar" ? (
        <QRadarAlertDetailDialog open={alertDetailOpen} onOpenChange={setAlertDetailOpen} alert={selectedAlert} />
      ) : (
        <AlertDetailDialog open={alertDetailOpen} onOpenChange={setAlertDetailOpen} alert={selectedAlert} />
      )}
    </>
  )
}
