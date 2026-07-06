"use client"

import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, ShieldCheck, Clock, AlertTriangleIcon, Globe, Send, MessageSquare, RefreshCw, Shield, AlertCircle, CheckCircle2 } from "lucide-react"
import { IpReputationDialog } from "@/components/alert/ip-reputation-dialog"
import { AiAnalysis } from "@/components/alert/ai-analysis"
import { AlertAnalysisSection } from "@/components/alert/alert-analysis-section"
import { EscalateToL3Dialog } from "@/components/alert/escalate-to-l3-dialog"
import { EscalationConversationView } from "@/components/alert/escalation-conversation-view"
import { EscalationReplyDialog } from "@/components/alert/escalation-reply-dialog"
import { formatTimestampWithTimezone } from "@/lib/utils/timestamp"

// Function to remove null/undefined values from object
function removeNullValues(obj: any): any {
  if (obj === null || obj === undefined) {
    return undefined
  }

  if (Array.isArray(obj)) {
    return obj.map(removeNullValues).filter(item => item !== undefined)
  }

  if (typeof obj === 'object') {
    const result: any = {}
    for (const key in obj) {
      const value = removeNullValues(obj[key])
      if (value !== undefined) {
        result[key] = value
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  }

  return obj
}

// Convert epoch milliseconds to datetime string with UTC+7 timezone
function formatEpochWithTZ(epochMs: number): string {
  try {
    const date = new Date(epochMs)
    // Format with UTC+7 (Bangkok time)
    return date.toLocaleString("en-US", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
  } catch {
    return "Invalid date"
  }
}

function formatSoarDate(value: any): string {
  if (value === null || value === undefined || value === "") return "N/A"
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric > 1000000000000 ? numeric : numeric * 1000
    try {
      return new Date(ms).toLocaleString()
    } catch {
      return String(value)
    }
  }
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

interface QRadarAlertDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  onViewRelatedEvents?: () => void
  isLoadingEvents?: boolean
  onNotesSynced?: () => void
}

export function QRadarAlertDetailDialog({
  open,
  onOpenChange,
  alert,
  onViewRelatedEvents,
  isLoadingEvents = false,
  onNotesSynced,
}: QRadarAlertDetailDialogProps) {
  if (!open || !alert) return null

  const qradarData = alert.metadata?.qradar || {}

  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [ipReputationDialogOpen, setIpReputationDialogOpen] = useState(false)
  const [selectedIp, setSelectedIp] = useState<string>("")
  const [escalationData, setEscalationData] = useState<any>(null)
  const [escalationLoading, setEscalationLoading] = useState(false)
  const [escalateToL3DialogOpen, setEscalateToL3DialogOpen] = useState(false)
  const [replyDialogOpen, setReplyDialogOpen] = useState(false)
  const [selectedResponse, setSelectedResponse] = useState<any>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [closeError, setCloseError] = useState("")
  const [isReopening, setIsReopening] = useState(false)
  const [reopenError, setReopenError] = useState("")
  const [qradarLoading, setQradarLoading] = useState(false)
  const [qradarError, setQradarError] = useState<string>("")
  const [qradarNotes, setQradarNotes] = useState<any[]>([])
  const [qradarNotesLoading, setQradarNotesLoading] = useState(false)
  const [qradarNotesSyncing, setQradarNotesSyncing] = useState(false)
  const [qradarNotesSyncError, setQradarNotesSyncError] = useState<string>("")
  const [soarSending, setSoarSending] = useState(false)
  const [soarResultMessage, setSoarResultMessage] = useState("")
  const [soarErrorMessage, setSoarErrorMessage] = useState("")
  const [soarData, setSoarData] = useState<any>(alert.metadata?.soar || {})
  const [soarSyncing, setSoarSyncing] = useState(false)
  const [soarSyncError, setSoarSyncError] = useState("")
  const [soarSearching, setSoarSearching] = useState(false)
  const [soarSearchError, setSoarSearchError] = useState("")
  const [soarCandidates, setSoarCandidates] = useState<any[]>([])
  const [soarManualId, setSoarManualId] = useState("")
  const [soarLinking, setSoarLinking] = useState(false)
  const [showManualLink, setShowManualLink] = useState(false)
  const [qradarEvent, setQradarEvent] = useState<any>(null)
  const autoRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setSoarData(alert?.metadata?.soar || {})
  }, [alert?.id, alert?.metadata?.soar])

  const handleCheckIpReputation = (ip: string) => {
    setSelectedIp(ip)
    setIpReputationDialogOpen(true)
  }

  const pickFirstNonEmpty = (...values: any[]) => {
    for (const value of values) {
      if (value === undefined || value === null) continue
      const s = String(value).trim()
      if (s !== "") return value
    }
    return null
  }

  const handleOpenQRadarConsole = () => {
    try {
      setQradarLoading(true)
      setQradarError("")
      console.log('[QRadar Detail] Opening QRadar auth popup...')

      // Open the auth redirect endpoint in a new popup window
      const popup = window.open("/api/qradar/auth/redirect", "qradar_auth", "width=1200,height=800")
      
      if (!popup) {
        setQradarError("Popup blocked ❌ Please allow popups for this site")
        setQradarLoading(false)
        return
      }

      console.log('[QRadar Detail] Popup opened, listening for auth messages...')
      
      // Listen for success message from popup
      const handleMessage = (event: MessageEvent) => {
        console.log('[QRadar Detail] Received message:', event.data)
        
        if (event.data === 'qradar_auth_success') {
          console.log('[QRadar Detail] ✓ Popup auth success - closing loading state')
          setQradarLoading(false)
          setQradarError("")
          window.removeEventListener('message', handleMessage)
          if (autoRetryTimeoutRef.current) {
            clearTimeout(autoRetryTimeoutRef.current)
          }
        } else if (event.data === 'qradar_auth_error') {
          console.log('[QRadar Detail] ✗ Popup auth error')
          setQradarError("Authentication failed ❌")
          setQradarLoading(false)
          window.removeEventListener('message', handleMessage)
          if (autoRetryTimeoutRef.current) {
            clearTimeout(autoRetryTimeoutRef.current)
          }
        }
      }

      window.addEventListener('message', handleMessage)

      // Fallback: Clear loading after 15 seconds
      if (autoRetryTimeoutRef.current) {
        clearTimeout(autoRetryTimeoutRef.current)
      }
      autoRetryTimeoutRef.current = setTimeout(() => {
        console.log('[QRadar Detail] Timeout waiting for popup auth response')
        setQradarLoading(false)
        window.removeEventListener('message', handleMessage)
      }, 15000)
    } catch (error) {
      console.error("[QRadar Detail] Error:", error)
      setQradarError("Navigation failed ❌")
      setQradarLoading(false)
    }
  }

  const handleSyncQRadarNotes = async () => {
    if (!qradarData?.id || !alert?.integrationId) return
    try {
      setQradarNotesSyncing(true)
      setQradarNotesSyncError("")
      console.log('[QRadar Detail] Syncing notes from QRadar for offense', qradarData.id)
      
      const res = await fetch(`/api/qradar/offenses/${qradarData.id}/notes?integrationId=${alert.integrationId}&forceRefresh=true`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.notes) {
        console.log('[QRadar Detail] Notes synced successfully:', data.notes?.length, 'notes')
        setQradarNotes(data.notes || [])
        // Notify parent to refresh table data so the synced notes show in the table
        onNotesSynced?.()
      } else {
        const errMsg = data?.details || data?.error || res.statusText || 'Failed to sync'
        console.error('[QRadar Detail] Failed to sync notes:', errMsg)
        setQradarNotesSyncError(errMsg)
      }
    } catch (err: any) {
      console.error('[QRadar Detail] Error syncing notes:', err)
      setQradarNotesSyncError(err?.message || 'Network error')
    } finally {
      setQradarNotesSyncing(false)
    }
  }

  const handleSendToSoar = async () => {
    try {
      setSoarSending(true)
      setSoarResultMessage("")
      setSoarErrorMessage("")

      const response = await fetch("/api/qradar/soar/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: alert.id,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to send to SOAR")
      }

      const incidentId = result?.data?.incidentId
      const orgId = result?.data?.orgId
      const incident = result?.data?.incident || null
      setSoarData((prev: any) => ({
        ...(prev || {}),
        sent: true,
        org_id: orgId || prev?.org_id || null,
        incident_id: incidentId || prev?.incident_id || null,
        sent_at: new Date().toISOString(),
        incident_details: incident || prev?.incident_details || null,
      }))
      setSoarResultMessage(
        incidentId && orgId
          ? `Successfully sent to SOAR (Org ${orgId}, Incident ${incidentId})`
          : "Successfully sent to SOAR",
      )
    } catch (error) {
      console.error("Failed to send offense to SOAR", error)
      setSoarErrorMessage(error instanceof Error ? error.message : "Failed to send to SOAR")
    } finally {
      setSoarSending(false)
    }
  }

  const handleSoarSync = async () => {
    setSoarSyncing(true)
    setSoarSyncError("")
    try {
      const res = await fetch(`/api/qradar/soar/sync?alertId=${encodeURIComponent(alert.id)}`)
      const result = await res.json()
      if (!res.ok || !result.success) {
        throw new Error(result?.error || "Failed to sync with SOAR")
      }
      setSoarData((prev: any) => ({
        ...prev,
        incident_details: result.data.incident,
        artifacts: result.data.artifacts,
        last_synced_at: result.data.synced_at,
      }))
    } catch (err) {
      setSoarSyncError(err instanceof Error ? err.message : "Sync failed")
    } finally {
      setSoarSyncing(false)
    }
  }

  const handleSoarSearch = async () => {
    setSoarSearching(true)
    setSoarSearchError("")
    setSoarCandidates([])
    try {
      const res = await fetch("/api/qradar/soar/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: alert.id, mode: "search" }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result?.error || "Search failed")
      if (result.candidates?.length === 0) {
        setSoarSearchError(`No incidents found matching "${result.keyword}" in SOAR`)
      } else {
        setSoarCandidates(result.candidates)
      }
    } catch (err) {
      setSoarSearchError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setSoarSearching(false)
    }
  }

  const handleSoarLink = async (incidentId: number | string) => {
    setSoarLinking(true)
    setSoarSearchError("")
    try {
      const res = await fetch("/api/qradar/soar/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: alert.id, mode: "link", incidentId: Number(incidentId) }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result?.error || "Link failed")
      setSoarData((prev: any) => ({
        ...prev,
        sent: true,
        incident_id: result.data.incidentId,
        org_id: result.data.orgId,
        incident_details: result.data.incident,
        linked_manually: true,
      }))
      setSoarCandidates([])
      setSoarManualId("")
      setShowManualLink(false)
    } catch (err) {
      setSoarSearchError(err instanceof Error ? err.message : "Link failed")
    } finally {
      setSoarLinking(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoRetryTimeoutRef.current) {
        clearTimeout(autoRetryTimeoutRef.current)
      }
    }
  }, [])

  // Handle opening L3 escalation dialog
  const handleOpenEscalateToL3Dialog = () => {
    setEscalateToL3DialogOpen(true)
  }

  // Handle opening reply dialog
  const handleOpenReplyDialog = (response: any) => {
    setSelectedResponse(response)
    setReplyDialogOpen(true)
  }

  // Handle close escalation
  const handleCloseEscalation = async () => {
    if (!escalationData?.active?.id) return
    try {
      setIsClosing(true)
      setCloseError("")
      const response = await fetch(`/api/alerts/${alert.id}/escalation/${escalationData.active.id}/close-reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      })

      if (response.ok) {
        await fetchEscalationData()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to close escalation" }))
        setCloseError(errorData.error || "Failed to close escalation")
      }
    } catch (error) {
      console.error("[QRadar Detail] Error closing escalation:", error)
      setCloseError("Failed to close escalation")
    } finally {
      setIsClosing(false)
    }
  }

  // Handle reopen escalation
  const handleReopenEscalation = async () => {
    if (!escalationData?.active?.id) return
    try {
      setIsReopening(true)
      setReopenError("")
      const response = await fetch(`/api/alerts/${alert.id}/escalation/${escalationData.active.id}/close-reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      })

      if (response.ok) {
        await fetchEscalationData()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to reopen escalation" }))
        setReopenError(errorData.error || "Failed to reopen escalation")
      }
    } catch (error) {
      console.error("[QRadar Detail] Error reopening escalation:", error)
      setReopenError("Failed to reopen escalation")
    } finally {
      setIsReopening(false)
    }
  }

  // Fetch escalation history for the alert
  const fetchEscalationData = async () => {
    if (!alert?.id) return
    try {
      setEscalationLoading(true)
      const response = await fetch(`/api/alerts/${alert.id}/escalation`)
      if (response.ok) {
        const data = await response.json()
        setEscalationData(data)
      } else {
        setEscalationData({ active: null, history: [] })
      }
    } catch (error) {
      console.error("Error fetching escalation data:", error)
      setEscalationData({ active: null, history: [] })
    } finally {
      setEscalationLoading(false)
    }
  }

  const calculateMTTD = (qradarMetadata: any, offenseTimestamp: string | undefined, alertStatus?: string) => {
    if (!offenseTimestamp || !qradarMetadata) return null
    
    // Jangan hitung MTTD jika alert masih status New
    if (alertStatus?.toLowerCase() === "new") return null

    try {
      const offenseTime = new Date(offenseTimestamp)
      if (isNaN(offenseTime.getTime())) return null

      const offenseTsMs = offenseTime.getTime()

      // Priority 1: Use last_assigned_user_time (when user was assigned)
      const lastAssignedTime = qradarMetadata.last_assigned_user_time
      if (lastAssignedTime !== undefined && lastAssignedTime !== null) {
        let assignedTimeMs: number
        if (typeof lastAssignedTime === "number") {
          assignedTimeMs = lastAssignedTime > 1000000000000 ? lastAssignedTime : lastAssignedTime * 1000
        } else {
          assignedTimeMs = new Date(lastAssignedTime).getTime()
        }

        if (Number.isFinite(assignedTimeMs) && assignedTimeMs >= offenseTsMs) {
          const diffMs = assignedTimeMs - offenseTsMs
          const diffMinutes = Math.round(diffMs / (1000 * 60))
          return diffMinutes >= 0 ? diffMinutes : null
        }
      }

      // Priority 2: Use first note/comment time
      const notes = qradarMetadata.notes as any[] | undefined
      if (notes && Array.isArray(notes) && notes.length > 0) {
        const sortedNotes = [...notes].sort((a, b) => {
          const aTime = typeof a.create_time === "number" ? a.create_time : new Date(a.create_time).getTime()
          const bTime = typeof b.create_time === "number" ? b.create_time : new Date(b.create_time).getTime()
          return aTime - bTime
        })
        
        const firstNote = sortedNotes[0]
        if (firstNote?.create_time) {
          let noteTimeMs: number
          if (typeof firstNote.create_time === "number") {
            noteTimeMs = firstNote.create_time > 1000000000000 ? firstNote.create_time : firstNote.create_time * 1000
          } else {
            noteTimeMs = new Date(firstNote.create_time).getTime()
          }

          if (Number.isFinite(noteTimeMs) && noteTimeMs >= offenseTsMs) {
            const diffMs = noteTimeMs - offenseTsMs
            const diffMinutes = Math.round(diffMs / (1000 * 60))
            return diffMinutes >= 0 ? diffMinutes : null
          }
        }
      }

      return null
    } catch (error) {
      console.error("Error calculating MTTD:", error)
      return null
    }
  }

  // Get MTTD threshold based on severity
  const getMTTDThreshold = (severity?: string) => {
    const sev = (severity || "Low").toLowerCase()
    if (sev === "critical") return 15 // 15 menit
    if (sev === "high") return 30 // 30 menit
    if (sev === "medium") return 60 // 1 jam
    return 120 // 2 jam untuk Low
  }

  useEffect(() => {
    const fetchTimeline = async () => {
      if (!alert?.id) return
      setTimelineLoading(true)
      try {
        const res = await fetch(`/api/alerts/${alert.id}/timeline`)
        const data = await res.json()
        if (data.success && data.data) {
          setTimelineEvents(data.data)
        } else {
          setTimelineEvents([])
        }
      } catch (err) {
        console.error("Failed to fetch alert timeline", err)
        setTimelineEvents([])
      } finally {
        setTimelineLoading(false)
      }
    }

    const fetchQRadarNotes = async () => {
      if (!qradarData?.id || !alert?.integrationId) return
      setQradarNotesLoading(true)
      try {
        const res = await fetch(`/api/qradar/offenses/${qradarData.id}/notes?integrationId=${alert.integrationId}`)
        if (res.ok) {
          const data = await res.json()
          const notes = data.notes || []
          // Fallback to alert.metadata.qradar.notes if endpoint returned nothing
          if (notes.length === 0) {
            const metaNotes = (alert.metadata as any)?.qradar?.notes
            setQradarNotes(Array.isArray(metaNotes) ? metaNotes : [])
          } else {
            setQradarNotes(notes)
            // Notify parent to refresh table if the table's current alert doesn't have these notes yet
            // (handles both fresh QRadar fetch and local-cache cases where table data may be stale)
            const tableAlreadyHasNotes = Array.isArray((alert.metadata as any)?.qradar?.notes) &&
              (alert.metadata as any)?.qradar?.notes.length > 0
            if (!tableAlreadyHasNotes) onNotesSynced?.()
          }
        } else {
          // Fallback to alert.metadata.qradar.notes on error
          const metaNotes = (alert.metadata as any)?.qradar?.notes
          setQradarNotes(Array.isArray(metaNotes) ? metaNotes : [])
        }
      } catch (err) {
        console.error("Failed to fetch QRadar notes", err)
        // Fallback to alert.metadata.qradar.notes on network error
        const metaNotes = (alert.metadata as any)?.qradar?.notes
        setQradarNotes(Array.isArray(metaNotes) ? metaNotes : [])
      } finally {
        setQradarNotesLoading(false)
      }
    }

    const fetchQRadarEvent = async () => {
      const offenseId = qradarData?.id
      const integrationId = alert?.integrationId
      if (!offenseId || !integrationId) return
      try {
        // Use the same endpoint as event-detail-dialog which correctly extracts IPs
        const res = await fetch(`/api/qradar/events?offenseId=${encodeURIComponent(String(offenseId))}&integrationId=${encodeURIComponent(String(integrationId))}`)
        if (res.ok) {
          const data = await res.json()
          const events = Array.isArray(data?.events) ? data.events : []
          // Scan all events to find best IPs (CRE events may lack IPs, sibling AnyConnect events have them)
          const batchPublicRemoteIp = events.find((e: any) => e.public_remote_ip || e.metadata?.public_remote_ip)
          const batchAssignedLocalIp = events.find((e: any) => e.assigned_local_ip || e.metadata?.assigned_local_ip)
          // Use first event as base, inject IPs from batch scan
          const baseEvent = events[0]
          if (baseEvent) {
            const merged = {
              ...baseEvent,
              public_remote_ip: baseEvent.public_remote_ip || baseEvent.metadata?.public_remote_ip
                || batchPublicRemoteIp?.public_remote_ip || batchPublicRemoteIp?.metadata?.public_remote_ip || null,
              assigned_local_ip: baseEvent.assigned_local_ip || baseEvent.metadata?.assigned_local_ip
                || batchAssignedLocalIp?.assigned_local_ip || batchAssignedLocalIp?.metadata?.assigned_local_ip || null,
            }
            setQradarEvent(merged)
          }
        }
      } catch (err) {
        console.error("Failed to fetch QRadar events for dialog", err)
      }
    }

    if (open) {
      fetchTimeline()
      fetchEscalationData()
      fetchQRadarNotes()
      fetchQRadarEvent()
    }
  }, [open, alert?.id, alert?.integrationId, qradarData?.id])

  const formatLogSources = (logSources: any) => {
    if (!logSources) return "N/A"
    if (Array.isArray(logSources)) {
      return logSources.map((ls: any) => ls.name || ls).join(", ")
    }
    if (typeof logSources === "object" && logSources.name) {
      return logSources.name
    }
    if (typeof logSources === "string") return logSources
    return JSON.stringify(logSources)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="flex-shrink-0 border-b pb-4 px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <span>Event Details</span>
          </DialogTitle>
          <DialogDescription>
            QID {qradarData.id} - {alert.title || "Unknown"} - {qradarData.severity ? `Severity ${qradarData.severity}` : "Unknown Severity"}
          </DialogDescription>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => {
                const ctx = [
                  `Tolong analisis alert QRadar berikut dari integrasi ${alert.integration?.name || "QRadar"}:`,
                  `- Alert: ${alert.title || "Unknown"}`,
                  `- Offense ID: ${qradarData.id || alert.externalId || "N/A"}`,
                  `- Severity: ${qradarData.severity ?? alert.severity ?? "Unknown"}`,
                  alert.source_ip ? `- Source IP: ${alert.source_ip}` : null,
                  alert.alert_time ? `- Time: ${new Date(alert.alert_time).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}` : null,
                  alert.description ? `- Description: ${String(alert.description).substring(0, 200)}` : null,
                ].filter(Boolean).join("\n")
                localStorage.setItem("soc_alert_context", ctx)
                window.open("/dashboard/chat", "_blank")
              }}
            >
              <MessageSquare className="h-4 w-4" />
              Ask SOC GPT
            </Button>
            <AiAnalysis
              getPayload={() => {
                const systemPrompt = `You are a senior cybersecurity analyst. Your task is to complete an incident report template.

CRITICAL INSTRUCTIONS:
1. Do NOT use Markdown (*, #). Use plain text only.
2. Use ALL CAPS for headers.
3. Complete the report by filling in the bracketed sections [...]. Do not deviate from the template format.

--- INCIDENT REPORT ---

INCIDENT DETAILS
- Alert ID: [Extract from alert data]
- Title: [Extract from alert data]
- Severity: [Extract severity level]
- Source IP: [Extract source IP]
- Destination IP: [Extract destination IP]
- Timestamp: [Extract timestamp]

THREAT ANALYSIS
[Provide a detailed analysis of the threat, potential impact, and attacker's likely objectives. Be thorough.]

INDICATORS OF COMPROMISE (IOCs)
[List relevant IOCs such as IPs, domains, hashes, or other identifiers from the alert data.]

RECOMMENDED ACTIONS
[Provide a comprehensive list of investigation and mitigation steps as a numbered or dashed list.]

YOUR TASK:
Fill in the [...] sections of the template above. IMPORTANT: Your entire response must not exceed 2000 characters.`;
                return {
                  query_text: `${systemPrompt}\n\nALERT DATA:\n${JSON.stringify(alert, null, 2)}`,
                  source_type: "general"
                }
              }}
            />
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full flex flex-col flex-1 min-h-0 px-6 pb-6">
          <TabsList className="grid w-full grid-cols-4 mb-4 mt-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="escalation">Escalation</TabsTrigger>
            <TabsTrigger value="raw-data">Raw Data</TabsTrigger>
            <TabsTrigger value="soar">SOAR</TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-4 pr-4">
            {/* Summary Box - Like Gambar 2 */}
            {alert.title && (
              <Card className="bg-blue-50 dark:bg-blue-950">
                <CardContent className="pt-4">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200 break-words">
                    [{alert.title}] {qradarData.sourceip} • {qradarData.destinationip}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* 1. Basic Info - Like Gambar 1/2 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Basic Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Event Name:</span>
                    <span className="font-mono col-span-2 break-all text-right">{alert.title || qradarData.offense_type || "N/A"}</span>
                  </div>
                </div>
                <Separator className="my-2" />
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Summary:</span>
                    <span className="font-mono col-span-2 break-all text-right">{alert.summary || "N/A"}</span>
                  </div>
                </div>
                <Separator className="my-2" />
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">QID:</span>
                    <span className="font-mono col-span-2 break-all text-right">{qradarData.id || "N/A"}</span>
                  </div>
                </div>
                <Separator className="my-2" />
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Category:</span>
                    <span className="font-mono col-span-2 break-all text-right">{alert.metadata?.category || qradarData.category || "N/A"}</span>
                  </div>
                </div>
                <Separator className="my-2" />
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Severity:</span>
                    <span className="font-mono col-span-2 break-all text-right">{qradarData.severity || "N/A"}</span>
                  </div>
                </div>
                {(() => {
                  const mttdMinutes = calculateMTTD(
                    qradarData,
                    alert.timestamp,
                    alert.status
                  )
                  const severity = alert.severity || alert.severityBasedOnAnalysis || "Low"
                  
                  if (mttdMinutes !== null) {
                    const threshold = getMTTDThreshold(severity)
                    const isExceeded = mttdMinutes > threshold
                    
                    return (
                      <>
                        <Separator className="my-2" />
                        <div>
                          <div className="grid grid-cols-3 gap-2 text-xs items-center">
                            <span className="font-medium text-muted-foreground col-span-1 truncate">MTTD (Detection):</span>
                            <div className="col-span-2 flex items-center justify-end gap-2">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <Badge variant={isExceeded ? "destructive" : "secondary"} className="text-xs">
                                {mttdMinutes} min {isExceeded && `(>${threshold}m)`}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  }
                  return null
                })()}
              </CardContent>
            </Card>

            {/* 2. Network Information - From related event FIRST, then fallback to offense */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Network</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(() => {
                  const relatedEvent = qradarEvent
                  const sourceIp = pickFirstNonEmpty(
                    relatedEvent?.sourceip,
                    relatedEvent?.sourceIp,
                    relatedEvent?.sourceaddress,
                    relatedEvent?.sourceAddress,
                    qradarData?.sourceip,
                  )
                  // Validate it's actually an IP (not a username)
                  const isValidIp = sourceIp && /^[\d\.]+$|^[0-9a-fA-F:]+$/.test(String(sourceIp))
                  return isValidIp ? (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-muted-foreground text-xs truncate">Source IP:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs break-all">{sourceIp}</span>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCheckIpReputation(String(sourceIp))}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </div>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const relatedEvent = qradarEvent
                  const sourcePort = pickFirstNonEmpty(
                    relatedEvent?.sourceport,
                    relatedEvent?.sourcePort,
                    qradarData?.sourceport,
                  )
                  return sourcePort || sourcePort === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Source Port:</span>
                        <span className="font-mono col-span-2 break-all text-right">{sourcePort}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const relatedEvent = qradarEvent
                  const destIp = pickFirstNonEmpty(
                    relatedEvent?.destinationip,
                    relatedEvent?.destinationIp,
                    relatedEvent?.destinationaddress,
                    relatedEvent?.destinationAddress,
                    qradarData?.destinationip,
                  )
                  // Validate it's actually an IP
                  const isValidIp = destIp && /^[\d\.]+$|^[0-9a-fA-F:]+$/.test(String(destIp))
                  return isValidIp ? (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-muted-foreground text-xs truncate">Destination IP:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs break-all">{destIp}</span>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCheckIpReputation(String(destIp))}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </div>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const relatedEvent = qradarEvent
                  const destPort = pickFirstNonEmpty(
                    relatedEvent?.destinationport,
                    relatedEvent?.destinationPort,
                    qradarData?.destinationport,
                  )
                  return destPort || destPort === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Destination Port:</span>
                        <span className="font-mono col-span-2 break-all text-right">{destPort}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const relatedEvent = qradarEvent
                  const publicRemoteIp = pickFirstNonEmpty(
                    relatedEvent?.public_remote_ip,
                    relatedEvent?.publicRemoteIp,
                    relatedEvent?.metadata?.public_remote_ip,
                    relatedEvent?.metadata?.publicRemoteIp,
                    qradarData?.public_remote_ip,
                    qradarData?.publicRemoteIp,
                  )
                  // Validate it's actually an IP
                  const isValidIp = publicRemoteIp && /^[\d\.]+$|^[0-9a-fA-F:]+$/.test(String(publicRemoteIp))
                  return isValidIp ? (
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-muted-foreground text-xs truncate">Public Remote IP:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs break-all">{publicRemoteIp}</span>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCheckIpReputation(String(publicRemoteIp))}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </div>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const relatedEvent = qradarEvent
                  const assignedLocalIp = pickFirstNonEmpty(
                    relatedEvent?.assigned_local_ip,
                    relatedEvent?.assignedLocalIp,
                    relatedEvent?.metadata?.assigned_local_ip,
                    relatedEvent?.metadata?.assignedLocalIp,
                    qradarData?.assigned_local_ip,
                    qradarData?.assignedLocalIp,
                  )
                  // Validate it's actually an IP
                  const isValidIp = assignedLocalIp && /^[\d\.]+$|^[0-9a-fA-F:]+$/.test(String(assignedLocalIp))
                  return isValidIp ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Assigned Local IP:</span>
                        <span className="font-mono col-span-2 break-all text-right">{assignedLocalIp}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {qradarData?.source_network && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Source Network:</span>
                      <span className="font-mono col-span-2 break-all text-right">{qradarData.source_network}</span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                
                {(() => {
                  const severity = qradarData?.severity ?? alert.severity
                  return severity || severity === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Severity:</span>
                        <span className="font-mono col-span-2 break-all text-right">{severity}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const magnitude = qradarData?.magnitude ?? alert.metadata?.magnitude
                  return magnitude || magnitude === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Magnitude:</span>
                        <span className="font-mono col-span-2 break-all text-right">{magnitude}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const relevance = qradarData?.relevance ?? alert.metadata?.relevance
                  return relevance || relevance === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Relevance:</span>
                        <span className="font-mono col-span-2 break-all text-right">{relevance}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const sourceCount = qradarData?.source_count ?? alert.metadata?.source_count
                  return sourceCount || sourceCount === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Source Count:</span>
                        <span className="font-mono col-span-2 break-all text-right">{sourceCount}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const remoteDestCount = qradarData?.remote_destination_count
                  return remoteDestCount || remoteDestCount === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Remote Destination Count:</span>
                        <span className="font-mono col-span-2 break-all text-right">{remoteDestCount}</span>
                      </div>
                      <Separator className="my-2" />
                    </div>
                  ) : null
                })()}
                
                {(() => {
                  const deviceCount = qradarData?.device_count
                  return deviceCount || deviceCount === 0 ? (
                    <div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <span className="font-medium text-muted-foreground col-span-1 truncate">Device Count:</span>
                        <span className="font-mono col-span-2 break-all text-right">{deviceCount}</span>
                      </div>
                    </div>
                  ) : null
                })()}
              </CardContent>
            </Card>

            {/* 3. Account & User - From Gambar 1 (Added to Gambar 2) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Account & User</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Username:</span>
                    <span className="font-mono col-span-2 break-all text-right">{alert.metadata?.username || "N/A"}</span>
                  </div>
                  <Separator className="my-2" />
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Account Name:</span>
                    <span className="font-mono col-span-2 break-all text-right">{alert.metadata?.account_name || "N/A"}</span>
                  </div>
                  <Separator className="my-2" />
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Source Username:</span>
                    <span className="font-mono col-span-2 break-all text-right">{alert.metadata?.srcip_username || "N/A"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 4. Log Source - From Gambar 1 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Log Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Log Source Name(s):</span>
                    <span className="font-mono col-span-2 break-all text-right">{formatLogSources(qradarData.log_sources || alert.metadata?.log_sources)}</span>
                  </div>
                  <Separator className="my-2" />
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Log Source ID:</span>
                    <span className="font-mono col-span-2 break-all text-right">
                      {(() => {
                        const logSources = qradarData.log_sources || alert.metadata?.log_sources
                        if (Array.isArray(logSources) && logSources.length > 0) {
                          return logSources.map((ls: any) => ls.id).join(", ")
                        }
                        return alert.metadata?.logsourceid || "N/A"
                      })()}
                    </span>
                  </div>
                  <Separator className="my-2" />
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Log Source Type:</span>
                    <span className="font-mono col-span-2 break-all text-right">
                      {(() => {
                        const logSources = qradarData.log_sources || alert.metadata?.log_sources
                        if (Array.isArray(logSources) && logSources.length > 0) {
                          return logSources.map((ls: any) => ls.type_name || ls.type_id).join(", ")
                        }
                        return alert.metadata?.logsourceidentifier || "N/A"
                      })()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 5. Alert Status & Assignee */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Alert Status & Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Status:</span>
                    <span className="font-mono col-span-2 break-all text-right">
                      <Badge variant="outline" className="text-xs">
                        {alert.status || "Unknown"}
                      </Badge>
                    </span>
                  </div>
                  <Separator className="my-2" />
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Assigned To:</span>
                    <span className="font-mono col-span-2 break-all text-right">
                      {alert.metadata?.qradar?.assigned_to || alert.metadata?.assignee || "N/A"}
                    </span>
                  </div>
                  <Separator className="my-2" />
                </div>
                <div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">Closed By:</span>
                    <span className="font-mono col-span-2 break-all text-right">
                      {alert.metadata?.qradar?.closing_user || "N/A"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 6. QRadar Domain/Tenant */}
            {alert.metadata?.domain && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">QRadar Domain</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Domain/Tenant:</span>
                      <span className="font-mono col-span-2 break-all text-right">{alert.metadata.domain}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 7. SOAR Incident */}
            {/* 8. QRadar Notes/Comments */}
            {qradarData?.id && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      QRadar Notes
                      {(qradarNotesLoading || qradarNotesSyncing) && <Loader2 className="w-3 h-3 animate-spin" />}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSyncQRadarNotes}
                      disabled={qradarNotesLoading || qradarNotesSyncing}
                      className="gap-2"
                    >
                      {qradarNotesSyncing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5" />
                          Sync Notes
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Local comments added via dashboard */}
                  {(() => {
                    const localComments = Array.isArray(alert.metadata?.comment) ? alert.metadata.comment : []
                    if (localComments.length === 0) return null
                    return (
                      <div className="space-y-2">
                        {localComments.map((c: any, idx: number) => (
                          <div key={`local-${idx}`} className="border-l-2 border-green-500 pl-3 py-1">
                            <div className="text-xs font-medium text-muted-foreground">
                              {c.comment_user || 'Dashboard'}
                              <span className="ml-2 text-muted-foreground/60">
                                {c.comment_time ? new Date(c.comment_time).toLocaleString() : ''}
                              </span>
                            </div>
                            <div className="mt-1 text-xs bg-muted p-2 rounded break-words">
                              {c.comment}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* QRadar API notes */}
                  {qradarNotes.length > 0 ? (
                    <div className="space-y-3">
                      {qradarNotes.map((note: any, index: number) => (
                        <div key={`note-${note.id || index}`} className="border-l-2 border-blue-500 pl-3 py-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-muted-foreground">
                                {note.username}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {note.create_time 
                                  ? new Date(note.create_time).toLocaleString()
                                  : "Unknown time"}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 text-xs bg-muted p-2 rounded break-words">
                            {note.note_text}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : qradarNotesLoading ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading notes...
                    </div>
                  ) : (
                    !Array.isArray(alert.metadata?.comment) || alert.metadata.comment.length === 0
                      ? <div className="text-xs text-muted-foreground">No notes available</div>
                      : null
                  )}

                  {/* Sync error message */}
                  {qradarNotesSyncError && (
                    <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded break-words">
                      Sync failed: {qradarNotesSyncError}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* 9. Alert Timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Alert Timeline (UTC+7)</CardTitle>
                <CardDescription className="text-xs">QRadar offense event timeline</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Timeline events in chronological order */}
                {qradarData.start_time && (
                  <div className="border-l-2 border-green-500 pl-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-green-700">Offense Created</span>
                      <span className="text-[11px] text-muted-foreground">{formatEpochWithTZ(qradarData.start_time)}</span>
                    </div>
                  </div>
                )}

                {qradarData.first_persisted_time && (
                  <div className="border-l-2 border-blue-500 pl-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-blue-700">First Persisted</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatEpochWithTZ(qradarData.first_persisted_time)}
                      </span>
                    </div>
                  </div>
                )}

                {qradarData.last_assigned_user_time && (
                  <div className="border-l-2 border-purple-500 pl-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-purple-700">Last Assigned</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatEpochWithTZ(qradarData.last_assigned_user_time)}
                      </span>
                    </div>
                  </div>
                )}

                {qradarData.last_persisted_time && (
                  <div className="border-l-2 border-yellow-500 pl-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-yellow-700">Last Persisted</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatEpochWithTZ(qradarData.last_persisted_time)}
                      </span>
                    </div>
                  </div>
                )}

                {qradarData.close_time && (
                  <div className="border-l-2 border-red-500 pl-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-red-700">Closed</span>
                      <span className="text-[11px] text-muted-foreground">{formatEpochWithTZ(qradarData.close_time)}</span>
                    </div>
                  </div>
                )}

                {/* Event Count and Status */}
                <div className="border-t pt-2 mt-2 space-y-1">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1">Event Count:</span>
                    <span className="font-mono col-span-2 break-all text-right">{qradarData.event_count || 0}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="font-medium text-muted-foreground col-span-1">Flow Count:</span>
                    <span className="font-mono col-span-2 break-all text-right">{qradarData.flow_count || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>



            {/* Investigation Section - QRadar Console */}
            <Separator />
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Investigation</label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenQRadarConsole}
                  disabled={qradarLoading}
                  className="gap-2"
                  title="Open QRadar Console (auto-login)"
                >
                  {qradarLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Globe className="h-3.5 w-3.5" />
                      Log Explorer
                    </>
                  )}
                </Button>
              </div>
              {qradarError && (
                <div className="mt-2 p-3 rounded border border-yellow-200 bg-yellow-50">
                  <p className="text-xs font-medium text-yellow-800">
                    {qradarError}
                  </p>
                </div>
              )}
            </div>
            </div>
          </TabsContent>

          {/* Escalation Tab */}
          <TabsContent value="escalation" className="space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-4 pr-4">
              {/* Refresh Button */}
              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchEscalationData}
                  disabled={escalationLoading}
                  className="gap-2"
                >
                  {escalationLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      ↻ Refresh
                    </>
                  )}
                </Button>
              </div>

              {/* Escalation Section */}
              {escalationData?.active || escalationData?.history?.length > 0 ? (
                <>
                  {/* Active Escalation - Using Modern Conversation View */}
                  {escalationData?.active && (
                    <>
                      <EscalationConversationView 
                        escalation={escalationData.active} 
                        alert={alert}
                      />

                      {/* Reply and Close/Reopen Actions */}
                      <div className="flex gap-2 flex-wrap">
                        {/* Reply Button - Only show for L2 responses if alert holder can reply */}
                        {escalationData.active.status === "replied" && escalationData.active.l2Analysis && !escalationData.active.closedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenReplyDialog(escalationData.active)}
                          >
                            💬 Reply to L2
                          </Button>
                        )}

                        {/* Escalate to L3 Button */}
                        {(escalationData.active.status === "replied" || escalationData.active.status === "escalated") && escalationData.active.escalationLevel === 1 && !escalationData.active.closedAt && (
                          <Button
                            size="sm"
                            className="gap-2"
                            onClick={handleOpenEscalateToL3Dialog}
                          >
                            🚀 Escalate to L3
                          </Button>
                        )}

                        {/* Close Button */}
                        {!escalationData.active.closedAt && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleCloseEscalation}
                            disabled={isClosing}
                          >
                            {isClosing ? "Closing..." : "🔒 Close"}
                          </Button>
                        )}

                        {/* Reopen Button */}
                        {escalationData.active.closedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleReopenEscalation}
                            disabled={isReopening}
                          >
                            🔓 Reopen
                          </Button>
                        )}
                      </div>

                      {/* Error messages */}
                      {closeError && (
                        <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <AlertTriangleIcon className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-destructive">{closeError}</p>
                        </div>
                      )}
                      {reopenError && (
                        <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <AlertTriangleIcon className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-destructive">{reopenError}</p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Escalation History */}
                  {escalationData?.history && escalationData.history.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Escalation History</CardTitle>
                        <CardDescription>{escalationData.history.length} escalation(s) on record</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {escalationData.history.map((escalation: any, idx: number) => (
                          <EscalationConversationView 
                            key={escalation.id}
                            escalation={escalation} 
                            alert={alert}
                          />
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card className="text-center py-8">
                  <CardContent>
                    <p className="text-sm text-muted-foreground">No escalation history available</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Raw Data Tab */}
          <TabsContent value="raw-data" className="space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-4 pr-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Raw Payload</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-md p-3 overflow-auto max-h-[400px] border">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground leading-relaxed">
                    {JSON.stringify(removeNullValues(alert), null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>

            {/* Analysis & Findings */}
            <AlertAnalysisSection alertId={alert.id} integrationId={alert.integrationId} />
            </div>
          </TabsContent>

            {/* SOAR Tab */}
            <TabsContent value="soar" className="space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-4 pr-4">
                {/* Send to SOAR Action */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Send to SOAR</CardTitle>
                    <CardDescription className="text-xs">Create a new incident in IBM Security QRadar SOAR</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSendToSoar}
                        disabled={soarSending}
                        className="gap-2"
                        title="Create incident in SOAR"
                      >
                        {soarSending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            Sent to SOAR
                          </>
                        )}
                      </Button>
                      {soarData?.sent ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSoarSync}
                          disabled={soarSyncing}
                          className="gap-2"
                        >
                          {soarSyncing ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Syncing...</>
                          ) : (
                            <><RefreshCw className="h-3.5 w-3.5" />Refresh from SOAR</>
                          )}
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSoarSearch}
                            disabled={soarSearching}
                            className="gap-2"
                            title="Search SOAR for an incident matching this QRadar offense ID"
                          >
                            {soarSearching ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching...</>
                            ) : (
                              <><RefreshCw className="h-3.5 w-3.5" />Find in SOAR</>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowManualLink((v) => !v)}
                            className="gap-2 text-muted-foreground"
                          >
                            Link Manually
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Manual link input */}
                    {showManualLink && !soarData?.sent && (
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          placeholder="SOAR Incident ID"
                          value={soarManualId}
                          onChange={(e) => setSoarManualId(e.target.value)}
                          className="flex h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-40"
                        />
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => soarManualId && handleSoarLink(soarManualId)}
                          disabled={!soarManualId || soarLinking}
                          className="gap-2"
                        >
                          {soarLinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Link
                        </Button>
                      </div>
                    )}

                    {/* Search candidates */}
                    {soarCandidates.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Found {soarCandidates.length} incident(s) — click to link:
                        </p>
                        {soarCandidates.map((c: any) => (
                          <button
                            key={c.id}
                            onClick={() => handleSoarLink(c.id)}
                            disabled={soarLinking}
                            className="w-full text-left rounded border px-3 py-2 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">#{c.id}</span>
                              <Badge variant={c.plan_status === "C" ? "secondary" : "default"} className="text-[10px]">
                                {c.plan_status === "A" ? "Active" : c.plan_status === "C" ? "Closed" : c.plan_status}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground mt-0.5 break-words">{c.name}</p>
                          </button>
                        ))}
                        {soarLinking && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />Linking...
                          </p>
                        )}
                      </div>
                    )}

                    {soarData?.last_synced_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Last synced: {new Date(soarData.last_synced_at).toLocaleString()}
                      </p>
                    )}
                    {soarResultMessage && (
                      <div className="p-3 rounded border border-green-200 bg-green-50">
                        <p className="text-xs font-medium text-green-800">{soarResultMessage}</p>
                      </div>
                    )}
                    {soarErrorMessage && (
                      <div className="p-3 rounded border border-red-200 bg-red-50">
                        <p className="text-xs font-medium text-red-800">{soarErrorMessage}</p>
                      </div>
                    )}
                    {(soarSyncError || soarSearchError) && (
                      <div className="p-3 rounded border border-red-200 bg-red-50">
                        <p className="text-xs font-medium text-red-800">{soarSyncError || soarSearchError}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* SOAR Incident Details */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">Incident Details</CardTitle>
                        <CardDescription className="text-xs">Linked incident in QRadar SOAR</CardDescription>
                      </div>
                      {soarData?.sent && (
                        <Badge variant={soarData?.incident_details?.plan_status === "C" ? "secondary" : "default"} className="text-[10px]">
                          {soarData?.incident_details?.plan_status === "A" ? "Active" : soarData?.incident_details?.plan_status === "C" ? "Closed" : soarData?.sent ? "Sent" : "Not Sent"}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-0">
                    {[
                      { label: "Send Status", value: soarData?.sent ? "Sent" : "Not Sent" },
                      { label: "Organization ID", value: soarData?.org_id },
                      { label: "Incident ID", value: soarData?.incident_id },
                      { label: "Incident Name", value: soarData?.incident_details?.name },
                      { label: "Severity", value: soarData?.incident_details?.severity_name ?? (soarData?.incident_details?.severity_code ? `Code ${soarData.incident_details.severity_code}` : null) },
                      { label: "Phase", value: soarData?.incident_details?.phase_id ? `Phase ${soarData.incident_details.phase_id}` : null },
                      { label: "Plan Status", value: soarData?.incident_details?.plan_status === "A" ? "Active" : soarData?.incident_details?.plan_status === "C" ? "Closed" : soarData?.incident_details?.plan_status },
                      { label: "Created By", value: soarData?.incident_details?.creator_principal },
                      { label: "Incident Created", value: formatSoarDate(soarData?.incident_details?.create_date) },
                      { label: "Discovered Date", value: formatSoarDate(soarData?.incident_details?.discovered_date) },
                      { label: "Resolution", value: soarData?.incident_details?.resolution_summary },
                      { label: "Sent At", value: formatSoarDate(soarData?.sent_at) },
                    ]
                      .filter((row) => row.value != null && row.value !== "" && row.value !== "N/A")
                      .map((row, i, arr) => (
                        <div key={row.label}>
                          <div className="grid grid-cols-3 gap-2 text-xs py-2">
                            <span className="font-medium text-muted-foreground col-span-1">{row.label}:</span>
                            <span className="font-mono col-span-2 break-all text-right">{String(row.value)}</span>
                          </div>
                          {i < arr.length - 1 && <Separator />}
                        </div>
                      ))}
                    {!soarData?.sent && (
                      <p className="text-xs text-muted-foreground py-2">No incident linked yet. Use "Sent to SOAR" to create one.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Artifacts */}
                {soarData?.sent && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Shield className="h-3.5 w-3.5" />
                            Artifacts
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {soarData?.artifacts?.length
                              ? `${soarData.artifacts.length} artifact(s) — click Refresh to update`
                              : "Click Refresh from SOAR to load artifacts"}
                          </CardDescription>
                        </div>
                        {soarData?.artifacts?.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">{soarData.artifacts.length}</Badge>
                        )}
                      </div>
                    </CardHeader>
                    {soarData?.artifacts?.length > 0 && (
                      <CardContent className="space-y-3">
                        {soarData.artifacts.map((artifact: any, idx: number) => (
                          <div key={artifact.id ?? idx} className="border rounded-md p-3 space-y-2">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="secondary" className="text-[10px] shrink-0">{artifact.type_name}</Badge>
                                  {artifact.ip_source && <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">Source</Badge>}
                                  {artifact.ip_destination && <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">Destination</Badge>}
                                </div>
                                <span className="text-xs font-mono font-semibold break-all">{artifact.value}</span>
                              </div>
                              {artifact.hits?.length > 0 && (
                                <Badge variant="destructive" className="text-[10px] shrink-0 gap-1">
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  {artifact.hits.length} hit{artifact.hits.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>

                            {/* Location */}
                            {artifact.location?.country && (
                              <p className="text-[11px] text-muted-foreground">
                                {[artifact.location.city, artifact.location.state, artifact.location.country]
                                  .filter(Boolean)
                                  .join(", ")}
                                {artifact.location.continent ? ` (${artifact.location.continent})` : ""}
                              </p>
                            )}

                            {/* Threat intel hits */}
                            {artifact.hits?.length > 0 && (
                              <div className="space-y-1.5 pt-1 border-t">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Threat Intel</p>
                                {artifact.hits.map((hit: any, hi: number) => (
                                  <div key={hit.id ?? hi} className="bg-muted/60 rounded p-2 text-[11px] space-y-0.5">
                                    {hit.properties?.country && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Country</span>
                                        <span className="font-medium">{hit.properties.country}</span>
                                      </div>
                                    )}
                                    {hit.properties?.name && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">ASN Name</span>
                                        <span className="font-medium">{hit.properties.name}</span>
                                      </div>
                                    )}
                                    {hit.properties?.asnum && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">ASN</span>
                                        <span className="font-mono">{hit.properties.asnum}</span>
                                      </div>
                                    )}
                                    {hit.properties?.network && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Network</span>
                                        <span className="font-mono">{hit.properties.network}</span>
                                      </div>
                                    )}
                                    {hit.properties?.attacks && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Attacks</span>
                                        <span className="font-medium text-red-600">{hit.properties.attacks}</span>
                                      </div>
                                    )}
                                    {hit.properties?.count && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Reports</span>
                                        <span className="font-medium">{hit.properties.count}</span>
                                      </div>
                                    )}
                                    {hit.properties?.maxdate && (
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Last Seen</span>
                                        <span>{hit.properties.maxdate}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Playbooks */}
                            {artifact.playbooks?.length > 0 && (
                              <div className="pt-1 border-t">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Playbooks</p>
                                <div className="flex flex-wrap gap-1">
                                  {artifact.playbooks.map((pb: any) => (
                                    <Badge key={pb.handle} variant="outline" className="text-[10px]">{pb.name}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                )}
              </div>
            </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-4 pb-6 px-6 border-t">
          {onViewRelatedEvents && (
            <Button 
              variant="default" 
              onClick={onViewRelatedEvents}
              disabled={isLoadingEvents}
            >
              {isLoadingEvents ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading Events...
                </>
              ) : (
                "View Related Events"
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* IP Reputation Dialog - Outside main dialog to prevent nesting issues */}
    {open && (
      <IpReputationDialog 
        open={ipReputationDialogOpen}
        onOpenChange={setIpReputationDialogOpen}
        ip={selectedIp}
      />
    )}

    {/* Escalate to L3 Dialog */}
    {open && escalationData?.active && (
      <EscalateToL3Dialog
        open={escalateToL3DialogOpen}
        onOpenChange={setEscalateToL3DialogOpen}
        escalationId={escalationData.active.id}
        alertId={(alert as any).id || (alert as any)._id || (alert as any).externalId}
        onSuccess={fetchEscalationData}
      />
    )}

    {/* Reply to Escalation Dialog */}
    {open && selectedResponse && (
      <EscalationReplyDialog
        open={replyDialogOpen}
        onOpenChange={setReplyDialogOpen}
        alertId={(alert as any).id || (alert as any)._id || (alert as any).externalId}
        escalationId={escalationData?.active?.id || ""}
        respondentName={selectedResponse.responder?.name || "L2 Analyst"}
        originalAnalysis={selectedResponse.analysis || ""}
        onReplySuccess={fetchEscalationData}
      />
    )}
    </>
  )
}
