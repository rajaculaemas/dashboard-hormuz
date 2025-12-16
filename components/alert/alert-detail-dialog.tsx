"use client"
import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { CalendarIcon, AlertTriangleIcon, NetworkIcon, ShieldIcon, InfoIcon, FileIcon, GlobeIcon, ShieldCheck, Clock, Sparkles } from "lucide-react"
import { IpReputationDialog } from "@/components/alert/ip-reputation-dialog"

interface AlertDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: Alert | null
}

interface Alert {
  _id: string
  alert_name: string
  title?: string
  externalId?: string
  xdr_event?: {
    display_name?: string
  }
  severity: string | number
  alert_time: number
  status: string
  source_ip?: string
  dest_ip?: string
  description: string
  metadata: any
  integration?: {
    id: string
    name: string
  }
  integrationId?: string
  // Additional fields that might be present
  alert_type?: string
  category?: string
  subcategory?: string
  confidence?: number
  risk_score?: number
  source_port?: number
  dest_port?: number
  protocol?: string
  user?: string
  host?: string
  process?: string
  file_path?: string
  hash?: string
  url?: string
  domain?: string
  mitre_tactics?: string[]
  mitre_techniques?: string[]
  srcip?: string
  dstip?: string
  srcport?: number
  dstport?: number
  xdr_desc?: string
}

export function AlertDetailDialog({ open, onOpenChange, alert }: AlertDetailDialogProps) {
  const [ipReputationDialogOpen, setIpReputationDialogOpen] = useState(false)
  const [selectedIp, setSelectedIp] = useState<string>("")

  // Debug: Log alert object when dialog opens
  useEffect(() => {
    if (open && alert) {
      console.log('[AlertDetailDialog] Alert opened:', {
        alertId: alert._id || alert.externalId,
        hasMetadata: !!alert.metadata,
        metadataKeys: Object.keys(alert.metadata || {}),
        user_action_alert_to_first: (alert.metadata as any)?.user_action_alert_to_first,
        user_action_history_count: (alert.metadata as any)?.user_action_history_count,
        user_action: (alert.metadata as any)?.user_action,
      })
    }
  }, [open, alert])

  const handleCheckIpReputation = (ip: string) => {
    setSelectedIp(ip)
    setIpReputationDialogOpen(true)
  }

  // AI Analysis state
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<any>(null)
  const [aiController, setAiController] = useState<AbortController | null>(null)
  const aiTimeoutRef = useRef<number | null>(null)
  const aiManualAbortRef = useRef<boolean>(false)
  const [aiChars, setAiChars] = useState(0)
  const [aiTokens, setAiTokens] = useState(0)

  const handleAiAnalysis = async () => {
    if (!alert) return
    setAiLoading(true)
    setAiResult(null)
    setAiOpen(true)
    try {
      // Create abort controller and timeout for slow local LLMs
      aiManualAbortRef.current = false
      const controller = new AbortController()
      setAiController(controller)
      // 180s timeout for slow local LLMs
      aiTimeoutRef.current = window.setTimeout(() => controller.abort(), 180000)
      const systemPrompt = `You are a senior cybersecurity analyst. Your task is to complete an incident report template.

CRITICAL INSTRUCTIONS:
1. Do NOT use Markdown (*, #). Use plain text only.
2. Use ALL CAPS for headers.
3. Complete the report by filling in the bracketed sections [...]. Do not deviate from the template format.

--- INCIDENT REPORT ---

INCIDENT DETAILS
- Alert ID: [Extract from alert data]
- Name: [Extract from alert data]
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
      const payload = {
        query_text: `${systemPrompt}\n\nALERT DATA:\n${JSON.stringify(alert, null, 2)}`,
        source_type: "general",
      }
      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        const contentType = res.headers.get("content-type") || ""
        // If proxy returned JSON (structured), parse normally
        if (contentType.includes("application/json")) {
          const data = await res.json()
          if (data && data.success) setAiResult(data.data)
          else setAiResult({ error: data?.error || "LLM returned error" })
        } else if (res.body) {
          // Stream raw text from upstream and append to result progressively
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let done = false
          let accumulated = ""
          while (!done) {
            const { value, done: d } = await reader.read()
            if (value) {
              accumulated += decoder.decode(value, { stream: true })
              setAiResult(accumulated)
              setAiChars(accumulated.length)
              setAiTokens(Math.ceil(accumulated.length / 4))
            }
            done = !!d
          }
          // Try to parse final accumulated text as JSON
          try {
            const parsed = JSON.parse(accumulated)
            setAiResult(parsed)
          } catch {
            // leave as raw text
          }
        } else {
          const text = await res.text()
          try {
            const parsed = JSON.parse(text)
            setAiResult(parsed)
          } catch {
            setAiResult(text)
          }
        }
    } catch (e) {
      // Distinguish aborts for better UX
      if ((e as any)?.name === "AbortError") {
        if (aiManualAbortRef.current) {
          setAiResult({ error: "Cancelled by user" })
          setAiOpen(false)
        } else {
          setAiResult({ error: "Timed out after 180s — the LLM may still be processing. You can Retry or Close." })
          // keep modal open so user can retry
        }
      } else {
        setAiResult({ error: String(e) })
      }
    } finally {
      setAiLoading(false)
      // clear timeout and controller
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current)
        aiTimeoutRef.current = null
      }
      setAiController(null)
      aiManualAbortRef.current = false
    }
  }

  const handleAiCancel = () => {
    // mark as manual abort so catch branch can behave accordingly
    aiManualAbortRef.current = true
    if (aiController) aiController.abort()
    setAiLoading(false)
    setAiController(null)
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current)
      aiTimeoutRef.current = null
    }
    // close modal
    setAiOpen(false)
  }

  const handleAiRetry = () => {
    setAiResult(null)
    // restart analysis
    handleAiAnalysis()
  }

  const getSeverityColor = (severity: unknown) => {
    const severityStr = String(severity).toLowerCase()

    // Handle numeric severity (Stellar Cyber uses 0-100 scale)
    const numericSeverity = Number(severity)
    if (!isNaN(numericSeverity)) {
      if (numericSeverity >= 80) return "destructive" // Critical/High
      if (numericSeverity >= 60) return "destructive" // High
      if (numericSeverity >= 40) return "default" // Medium
      if (numericSeverity >= 20) return "secondary" // Low
      return "outline" // Very Low
    }

    // Handle string severity
    switch (severityStr) {
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
        return "outline"
      default:
        return "outline"
    }
  }

  // MTTD: Mean Time To Detect - dari alert time ke assignee time (pertama kali)
  const calculateMTTD = (alertTimestamp: number | string | undefined, userAction?: any) => {
    if (!alertTimestamp) {
      console.log('[MTTD] No alertTimestamp provided')
      return null
    }

    try {
      // Parse alert timestamp
      let alertTime: Date
      if (typeof alertTimestamp === "string") {
        alertTime = new Date(alertTimestamp)
        if (isNaN(alertTime.getTime())) {
          const numTime = Number(alertTimestamp)
          alertTime = new Date(numTime > 1000000000000 ? numTime : numTime * 1000)
        }
      } else {
        alertTime = new Date(alertTimestamp > 1000000000000 ? alertTimestamp : alertTimestamp * 1000)
      }

      if (isNaN(alertTime.getTime())) {
        console.log('[MTTD] Could not parse alertTime from:', alertTimestamp)
        return null
      }

      console.log('[MTTD] Alert time parsed:', alertTime.toISOString())
      console.log('[MTTD] User action history:', userAction?.history)

      // Get assignee time dari user_action.history
      // Cari action dengan text "Event assignee changed to" atau "status changed"
      let assigneeTime: Date | null = null
      if (userAction?.history && Array.isArray(userAction.history)) {
        const assigneeAction = userAction.history.find((h: any) => {
          const actionStr = (h.action || "").toString().toLowerCase()
          return actionStr.includes("event assignee changed to") || 
                 actionStr.includes("assignee changed") ||
                 actionStr.includes("status changed")
        })
        console.log('[MTTD] Found action:', assigneeAction)
        
        if (assigneeAction && assigneeAction.action_time) {
          const actionTime = assigneeAction.action_time
          if (typeof actionTime === "string") {
            assigneeTime = new Date(actionTime)
            if (isNaN(assigneeTime.getTime())) {
              const numTime = Number(actionTime)
              assigneeTime = new Date(numTime > 1000000000000 ? numTime : numTime * 1000)
            }
          } else {
            assigneeTime = new Date(actionTime > 1000000000000 ? actionTime : actionTime * 1000)
          }
        }
      }

      // Jika tidak ada assignee action, return null (jangan hitung MTTD)
      if (!assigneeTime) {
        console.log('[MTTD] No assignee time found, returning null')
        return null
      }

      if (isNaN(assigneeTime.getTime())) return null

      // Calculate difference in minutes
      const diffMs = assigneeTime.getTime() - alertTime.getTime()
      const diffMinutes = Math.round(diffMs / (1000 * 60))

      return diffMinutes >= 0 ? diffMinutes : null
    } catch (error) {
      console.error("Error calculating MTTD:", error)
      return null
    }
  }

  // Get MTTD threshold based on severity
  const getMTTDThreshold = (severity?: string | number) => {
    const sev = (typeof severity === "string" ? severity : String(severity || "Low")).toLowerCase()
    if (sev === "critical") return 15 // 15 menit
    if (sev === "high") return 30 // 30 menit
    if (sev === "medium") return 60 // 1 jam
    return 120 // 2 jam untuk Low
  }

  // Get color untuk MTTD badge
  const getMTTDColor = (mttdMinutes: number, severity?: string) => {
    const threshold = getMTTDThreshold(severity)
    return mttdMinutes > threshold ? "destructive" : "secondary"
  }

  const formatAlertTime = (timestamp: number | string) => {
    try {
      let date: Date

      if (typeof timestamp === "string") {
        // Try parsing as ISO string first
        date = new Date(timestamp)
        if (isNaN(date.getTime())) {
          // If that fails, try parsing as number
          const numTimestamp = Number(timestamp)
          if (!isNaN(numTimestamp)) {
            date = new Date(numTimestamp > 1000000000000 ? numTimestamp : numTimestamp * 1000)
          } else {
            return "Invalid Date"
          }
        }
      } else {
        // Handle numeric timestamp
        date = new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000)
      }

      if (isNaN(date.getTime())) {
        return "Invalid Date"
      }

      // Force display in UTC+7 (Asia/Jakarta) regardless of browser locale
      try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Jakarta',
        }).format(date)
        return `${formatted} (UTC+7)`
      } catch {
        // Fallback to local string if Intl/timeZone isn't available
        return date.toLocaleString()
      }
    } catch (error) {
      console.error("Error formatting alert time:", error, "timestamp:", timestamp)
      return "Invalid Date"
    }
  }

  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  useEffect(() => {
    const fetchTimeline = async () => {
      const alertId = (alert as any)?.id || (alert as any)?.externalId || (alert as any)?._id
      if (!alertId) return
      setTimelineLoading(true)
      try {
        const res = await fetch(`/api/alerts/${alertId}/timeline`)
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

    if (open && alert) {
      fetchTimeline()
    }
  }, [open, alert])

  const formatMetadata = (metadata: any) => {
    if (!metadata || typeof metadata !== "object") return {}

    // Filter out null, undefined, and empty values
    const filtered = Object.entries(metadata).filter(
      ([key, value]) => value !== null && value !== undefined && value !== "" && value !== 0,
    )

    return Object.fromEntries(filtered)
  }

  // Render AI result in a human-friendly way
  const renderAiResult = (res: any) => {
    if (aiLoading) return <p>Analyzing...</p>
    if (!res) return <p className="text-muted-foreground">No result</p>

    let parsed: any = res
    if (typeof res === "string") {
      try {
        parsed = JSON.parse(res)
      } catch {
        parsed = res
      }
    }

    // If it's still a plain string, show as preformatted text
    if (typeof parsed === "string") {
      return <pre className="whitespace-pre-wrap text-sm">{parsed}</pre>
    }

    // Prefer common answer fields
    const answer = parsed.answer || parsed.answer_text || parsed.summary || (parsed.data && (parsed.data.answer || parsed.data.text))

    return (
      <div>
        {parsed.mock && parsed.message && (
          <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 text-sm rounded">{parsed.message}</div>
        )}

        {/* Render metadata keys except large text fields */}
        <div className="mb-2 text-xs text-muted-foreground space-y-1">
          {Object.entries(parsed)
            .filter(([k]) => !["answer", "answer_text", "summary", "data"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <strong className="mr-1">{k}:</strong>
                <span>{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
        </div>

        {answer ? (
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded">{answer}</pre>
        ) : (
          <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(parsed, null, 2)}</pre>
        )}
      </div>
    )
  }

  const getSeverityLabel = (severity: unknown) => {
    const numericSeverity = Number(severity)
    if (!isNaN(numericSeverity)) {
      if (numericSeverity >= 80) return `Critical (${severity})`
      if (numericSeverity >= 60) return `High (${severity})`
      if (numericSeverity >= 40) return `Medium (${severity})`
      if (numericSeverity >= 20) return `Low (${severity})`
      return `Very Low (${severity})`
    }
    return String(severity)
  }

  // Extract alert name from various sources
  const getAlertName = (alert: Alert, metadata?: any) => {
    const meta = metadata || alert.metadata || {}
    return (
      alert.alert_name ||
      alert.title ||
      alert.xdr_event?.display_name ||
      meta.alert_name ||
      meta.xdr_event?.display_name ||
      meta.event_name ||
      meta.rule?.description ||
      meta.ruleDescription ||
      "Unknown Alert"
    )
  }

  // Extract alert ID from various sources
  const getAlertId = (alert: Alert) => {
    return (
      alert._id ||
      alert.metadata?.alert_id ||
      alert.metadata?._id ||
      alert.metadata?.id ||
      alert.externalId ||
      "N/A"
    )
  }

  if (!open || !alert) return null

  // Check if this is a Wazuh integration
  const isWazuhIntegration =
    alert.integration?.name?.toLowerCase().includes("wazuh") ||
    (alert as any).integration?.source === "wazuh" ||
    alert.metadata?.agent?.id !== undefined ||
    (typeof alert.description === "string" && alert.description.includes("EventChannel"))

  // --- STELLAR CYBER ALERT DETAIL ---
  if (!isWazuhIntegration) {
    const formattedMetadata = formatMetadata(alert.metadata)
    const alertName = (
      alert.alert_name ||
      alert.xdr_event?.display_name ||
      alert.metadata?.alert_name ||
      alert.metadata?.xdr_event?.display_name ||
      alert.metadata?.event_name ||
      "Unknown Alert"
    )
    const alertId = alert._id || alert.metadata?.alert_id || alert.metadata?._id || "N/A"

    const technicalInfo = {
      srcip: alert.metadata?.srcip || alert.source_ip || alert.srcip,
      dstip: alert.metadata?.dstip || alert.dest_ip || alert.dstip,
      srcport: alert.metadata?.srcport || alert.source_port || alert.srcport,
      dstport: alert.metadata?.dstport || alert.dest_port || alert.dstport,
      protocol: alert.metadata?.protocol || alert.protocol,
      srcmac: alert.metadata?.srcmac,
      appid_name: alert.metadata?.appid_name,
      appid_family: alert.metadata?.appid_family,
      appid_stdport: alert.metadata?.appid_stdport,
      srcip_reputation: alert.metadata?.srcip_reputation,
      dstip_reputation: alert.metadata?.dstip_reputation,
      event_score: alert.metadata?.event_score || alert.metadata?.score,
      event_type: alert.metadata?.event_type || alert.alert_type,
      event_name: alert.metadata?.event_name,
      repeat_count: alert.metadata?.repeat_count,
      srcip_username: alert.metadata?.srcip_username,
      tenant_name: alert.metadata?.tenant_name,
      alert_time: alert.metadata?.alert_time,
      timestamp: alert.metadata?.timestamp,
      closed_time: alert.metadata?.closed_time,
      assignee: alert.metadata?.assignee,
      comment: alert.metadata?.comment,
    }

    return (
      <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5" />
              Alert Details
            </DialogTitle>
            <DialogDescription>{alertName}</DialogDescription>
            <div className="ml-auto">
              <Button size="sm" variant="default" onClick={handleAiAnalysis} disabled={aiLoading} className="gap-2">
                <Sparkles className="h-4 w-4" />
                AI Analysis
              </Button>
            </div>
          </DialogHeader>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="technical">Technical Details</TabsTrigger>
              <TabsTrigger value="metadata">Raw Data</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {/* Basic Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <InfoIcon className="h-5 w-5" />
                        Basic Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Alert Name</label>
                          <p className="text-sm font-medium">{alertName}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Alert ID</label>
                          <p className="text-sm font-mono">{alertId}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Severity</label>
                          <Badge variant={getSeverityColor(alert.severity)}>{getSeverityLabel(alert.severity)}</Badge>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Status</label>
                          <Badge variant={getStatusColor(alert.status)}>{alert.status || "Unknown"}</Badge>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Alert Time</label>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm">
                              {formatAlertTime(
                                alert.metadata?.alert_time || alert.metadata?.timestamp || alert.alert_time,
                              )}
                            </p>
                          </div>
                        </div>
                        {technicalInfo.event_type && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Event Type</label>
                            <p className="text-sm">{technicalInfo.event_type}</p>
                          </div>
                        )}
                        {alert.severityBasedOnAnalysis && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Severity (Analysis)</label>
                            <Badge variant="secondary">{alert.severityBasedOnAnalysis}</Badge>
                          </div>
                        )}
                        {(() => {
                          // Stellar Cyber stores user_action data either as:
                          // 1. Flat field: user_action_alert_to_first (for newly synced alerts)
                          // 2. Nested: user_action.alert_to_first (for alerts synced before fix)
                          let mttdMs = (alert.metadata as any)?.user_action_alert_to_first
                          
                          // Fallback to nested structure if flat field not available
                          if (mttdMs === null || mttdMs === undefined) {
                            mttdMs = (alert.metadata as any)?.user_action?.alert_to_first
                          }
                          
                          const hasUserAction = mttdMs !== null && mttdMs !== undefined
                          
                          if (!hasUserAction) {
                            const historyLength = (alert.metadata as any)?.user_action_history_count || 
                                                (alert.metadata as any)?.user_action?.history?.length || 0
                            console.log('[MTTD Detail] No MTTD data. Has metadata:', !!alert.metadata, 'History count:', historyLength)
                            
                            return (
                              <div className="text-xs text-muted-foreground italic">
                                MTTD data not available (history count: {historyLength})
                              </div>
                            )
                          }
                          
                          // Convert milliseconds to minutes or seconds
                          const mttdSeconds = Math.round(mttdMs / 1000)
                          const mttdMinutes = Math.round(mttdMs / (60 * 1000))
                          
                          // Format MTTD: show seconds if less than 1 minute, otherwise minutes
                          let mttdDisplay = ""
                          if (mttdMinutes >= 1) {
                            mttdDisplay = `${mttdMinutes} min`
                          } else if (mttdSeconds >= 0) {
                            mttdDisplay = `${mttdSeconds} sec`
                          } else {
                            return null
                          }
                          
                          const severity = alert.severityBasedOnAnalysis || alert.metadata?.severity || "Low"
                          const threshold = getMTTDThreshold(severity)
                          const isExceeded = mttdMinutes > threshold
                          
                          return (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">MTTD (Detection)</label>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <Badge variant={isExceeded ? "destructive" : "secondary"}>
                                  {mttdDisplay} {isExceeded && mttdMinutes > 0 && `(>${threshold}m)`}
                                </Badge>
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      <Separator />

                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Description</label>
                        <p className="text-sm mt-1">
                          {alert.metadata?.xdr_desc || alert.description || "No description available"}
                        </p>
                      </div>

                      {technicalInfo.assignee && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Assigned To</label>
                          <p className="text-sm">{technicalInfo.assignee}</p>
                        </div>
                      )}

                      {technicalInfo.tenant_name && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Tenant</label>
                          <p className="text-sm">{technicalInfo.tenant_name}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Network Information */}
                  {(technicalInfo.srcip || technicalInfo.dstip) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <NetworkIcon className="h-5 w-5" />
                          Network Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          {technicalInfo.srcip && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Source IP</label>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-mono">{technicalInfo.srcip}</p>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-6 px-2 text-xs"
                                  onClick={() => handleCheckIpReputation(technicalInfo.srcip)}
                                >
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Check
                                </Button>
                              </div>
                              {technicalInfo.srcip_reputation && (
                                <p className="text-xs text-muted-foreground">
                                  Reputation: {technicalInfo.srcip_reputation}
                                </p>
                              )}
                            </div>
                          )}
                          {technicalInfo.dstip && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Destination IP</label>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-mono">{technicalInfo.dstip}</p>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-6 px-2 text-xs"
                                  onClick={() => handleCheckIpReputation(technicalInfo.dstip)}
                                >
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  Check
                                </Button>
                              </div>
                              {technicalInfo.dstip_reputation && (
                                <p className="text-xs text-muted-foreground">
                                  Reputation: {technicalInfo.dstip_reputation}
                                </p>
                              )}
                            </div>
                          )}
                          {technicalInfo.srcport && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Source Port</label>
                              <p className="text-sm font-mono">{technicalInfo.srcport}</p>
                            </div>
                          )}
                          {technicalInfo.dstport && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Destination Port</label>
                              <p className="text-sm font-mono">{technicalInfo.dstport}</p>
                            </div>
                          )}
                          {technicalInfo.protocol && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Protocol</label>
                              <p className="text-sm">{technicalInfo.protocol}</p>
                            </div>
                          )}
                          {technicalInfo.srcmac && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Source MAC</label>
                              <p className="text-sm font-mono">{technicalInfo.srcmac}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Alert Timeline (Status & Comments) */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5" />
                        Alert Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {timelineLoading ? (
                        <div className="text-xs text-muted-foreground">Loading timeline...</div>
                      ) : timelineEvents.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No timeline entries yet.</div>
                      ) : (
                        <div className="space-y-3">
                          {timelineEvents.map((event: any) => (
                            <div key={event.id} className="border-l-2 border-primary/40 pl-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{event.eventType?.replace(/_/g, " ") || "event"}</span>
                                <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                              {event.changedBy && (
                                <p className="text-[11px] text-muted-foreground">By: {event.changedBy}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="technical" className="space-y-4">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {/* Application Information */}
                  {(technicalInfo.appid_name || technicalInfo.appid_family) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <GlobeIcon className="h-5 w-5" />
                          Application Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          {technicalInfo.appid_name && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Application</label>
                              <p className="text-sm">{technicalInfo.appid_name}</p>
                            </div>
                          )}
                          {technicalInfo.appid_family && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Application Family</label>
                              <p className="text-sm">{technicalInfo.appid_family}</p>
                            </div>
                          )}
                          {technicalInfo.appid_stdport && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Standard Port</label>
                              <p className="text-sm">{technicalInfo.appid_stdport}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Event Analysis */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ShieldIcon className="h-5 w-5" />
                        Event Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        {technicalInfo.event_name && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Event Name</label>
                            <p className="text-sm">{technicalInfo.event_name}</p>
                          </div>
                        )}
                        {technicalInfo.event_score && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Event Score</label>
                            <p className="text-sm font-medium">{technicalInfo.event_score}</p>
                          </div>
                        )}
                        {technicalInfo.repeat_count && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Repeat Count</label>
                            <p className="text-sm">{technicalInfo.repeat_count}</p>
                          </div>
                        )}
                        {technicalInfo.srcip_username && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Source Username</label>
                            <p className="text-sm">{technicalInfo.srcip_username}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Timeline Information */}
                  {(technicalInfo.alert_time || technicalInfo.closed_time) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <CalendarIcon className="h-5 w-5" />
                          Timeline
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          {technicalInfo.alert_time && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Alert Time</label>
                              <p className="text-sm">{formatAlertTime(technicalInfo.alert_time)}</p>
                            </div>
                          )}
                          {technicalInfo.timestamp && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Event Timestamp</label>
                              <p className="text-sm">{formatAlertTime(technicalInfo.timestamp)}</p>
                            </div>
                          )}
                          {technicalInfo.closed_time && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Closed Time</label>
                              <p className="text-sm">{formatAlertTime(technicalInfo.closed_time)}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Comments/Analysis */}
                  {technicalInfo.comment && Array.isArray(technicalInfo.comment) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileIcon className="h-5 w-5" />
                          Analysis Comments
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {technicalInfo.comment.map((comment: any, index: number) => (
                            <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium">{comment.comment_user}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatAlertTime(comment.comment_time)}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{comment.comment}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="metadata" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Raw Metadata</CardTitle>
                  <CardDescription>Complete alert data from the source system</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {Object.keys(formattedMetadata).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(formattedMetadata).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-3 gap-4 py-2 border-b border-border/50">
                            <div className="font-medium text-sm text-muted-foreground">{key}</div>
                            <div className="col-span-2 text-sm font-mono break-all">
                              {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <InfoIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No additional metadata available</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* AI Analysis Modal (simple inline modal) */}
          {aiOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="bg-white p-4 rounded shadow-lg max-w-3xl w-full max-h-[70vh] overflow-auto">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">AI Analysis Result</h3>
                  <div className="flex items-center gap-2">
                    {aiLoading && (
                      <Button size="sm" variant="ghost" onClick={handleAiCancel}>Cancel</Button>
                    )}
                    {!aiLoading && aiResult?.error && (
                      <Button size="sm" variant="ghost" onClick={handleAiRetry}>Retry</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setAiOpen(false)}>Close</Button>
                  </div>
                </div>
                <div className="text-sm">{renderAiResult(aiResult)}</div>
              </div>
            </div>
          )}

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
      </>
    )
  }

  // --- WAZUH ALERT DETAIL (existing logic) ---
  // ...existing code...
}
