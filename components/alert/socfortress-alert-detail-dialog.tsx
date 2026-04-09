"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { AlertTriangleIcon, ShieldCheck, Clock, Copy, CheckCircle, Database, Settings2, FileJson, Shield, Network, HardDrive, Tag, Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IpReputationDialog } from "@/components/alert/ip-reputation-dialog"
import { HashReputationDialog } from "@/components/alert/hash-reputation-dialog"
import { AlertAnalysisSection } from "@/components/alert/alert-analysis-section"
import { formatTimestampWithTimezone } from "@/lib/utils/timestamp"

interface SocfortressAlertDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  refreshTrigger?: number
}

function CopyableField({ label, value, id }: { label: string; value: string; id: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 text-sm bg-muted p-2 rounded break-all">{value || "—"}</code>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

function InfoRow({ label, value, isMono = false }: { label: string; value: any; isMono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={`text-sm text-right ${isMono ? "font-mono" : ""}`}>
        {value || <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  )
}

export function SocfortressAlertDetailDialog({
  open,
  onOpenChange,
  alert,
  refreshTrigger,
}: SocfortressAlertDetailDialogProps) {
  const [selectedIp, setSelectedIp] = useState<string | null>(null)
  const [selectedHash, setSelectedHash] = useState<{ value: string; type: string } | null>(null)
  const [ipDialogOpen, setIpDialogOpen] = useState(false)
  const [hashDialogOpen, setHashDialogOpen] = useState(false)
  
  // Escalation state
  const [escalationData, setEscalationData] = useState<any>(null)
  const [escalationLoading, setEscalationLoading] = useState(false)

  // Fetch escalation data when alert or dialog opens
  useEffect(() => {
    if (alert?.id) {
      fetchEscalationData()
    }
  }, [alert?.id, open])

  const fetchEscalationData = async () => {
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

  if (!alert) return null

  const metadata = alert.metadata || {}
  const socfortressData = metadata.socfortress || {}
  const alertHistory = metadata.alert_history || []
  const incidentEvent = metadata.incident_event || {}
  
  // Parse source_data - it might be a string that needs JSON parsing
  let eventSourceData: any = {}
  if (incidentEvent.source_data) {
    if (typeof incidentEvent.source_data === "string") {
      try {
        const cleanedData = incidentEvent.source_data.trim()
        eventSourceData = JSON.parse(cleanedData)
      } catch (e) {
        console.error("Failed to parse incident_event.source_data:", e)
        eventSourceData = {}
      }
    } else {
      eventSourceData = incidentEvent.source_data
    }
  }

  // If we have a message field in source_data, parse it too (it's nested JSON)
  let messageData: any = {}
  if (eventSourceData && eventSourceData.message) {
    const messageField = eventSourceData.message
    
    // If it's already an object (not a string), use it directly
    if (typeof messageField === "object") {
      messageData = messageField
    } else if (typeof messageField === "string") {
      // Only try to parse if it looks like JSON (starts with { or [)
      const trimmedMsg = messageField.trim()
      if ((trimmedMsg.startsWith("{") || trimmedMsg.startsWith("[")) && (trimmedMsg.endsWith("}") || trimmedMsg.endsWith("]"))) {
        try {
          messageData = JSON.parse(trimmedMsg)
        } catch (e) {
          console.error("Failed to parse message data:", e, "First 100 chars:", trimmedMsg.substring(0, 100))
          messageData = {}
        }
      } else {
        // Not JSON format, just skip parsing
        console.warn("Message field does not look like JSON, skipping parse")
        messageData = {}
      }
    }
  }
  
  // If messageData is empty but we have eventSourceData with Wazuh fields, use that
  if (Object.keys(messageData).length === 0 && eventSourceData && eventSourceData.rule) {
    messageData = eventSourceData
  }

  // Get latest status from alert history
  const getLatestStatus = () => {
    if (alertHistory.length === 0) return alert.status || "Unknown"
    // Find latest status change
    const statusChange = alertHistory.find((h: any) => h.field_name === "status" || h.change_type === "STATUS_CHANGE")
    return statusChange?.new_value || alert.status || "Unknown"
  }

  // Extract Wazuh rule data from event source data
  const getRuleInfo = () => {
    // Try message data first (nested Wazuh event)
    if (messageData && messageData.rule) {
      return {
        ruleId: messageData.rule.id || "",
        ruleLevel: messageData.rule.level || 0,
        ruleDescription: messageData.rule.description || "",
        ruleGroups: messageData.rule.groups || [],
        ruleMitre: {
          id: Array.isArray(messageData.rule.mitre?.id) ? messageData.rule.mitre.id[0] : messageData.rule.mitre?.id || "",
          tactic: Array.isArray(messageData.rule.mitre?.tactic) ? messageData.rule.mitre.tactic[0] : messageData.rule.mitre?.tactic || "",
          technique: Array.isArray(messageData.rule.mitre?.technique) ? messageData.rule.mitre.technique[0] : messageData.rule.mitre?.technique || "",
        },
      }
    }
    
    // Try event source data
    if (eventSourceData && eventSourceData.rule) {
      return {
        ruleId: eventSourceData.rule.id || "",
        ruleLevel: eventSourceData.rule.level || 0,
        ruleDescription: eventSourceData.rule.description || "",
        ruleGroups: eventSourceData.rule.groups || [],
        ruleMitre: eventSourceData.rule.mitre || {},
      }
    }
    
    // Try to get from metadata fields as fallback
    if (metadata.rule_id || metadata.ruleId) {
      return {
        ruleId: metadata.rule_id || metadata.ruleId || "",
        ruleLevel: metadata.rule_level || metadata.ruleLevel || 0,
        ruleDescription: metadata.rule_description || metadata.ruleDescription || metadata.rule || alert.title || "",
        ruleGroups: metadata.rule_groups || metadata.ruleGroups || [],
        ruleMitre: metadata.rule_mitre || metadata.ruleMitre || {},
      }
    }
    return {}
  }

  // Extract agent data from event source data
  const getAgentInfo = () => {
    // Try message data first (nested Wazuh event)
    if (messageData && messageData.agent) {
      return {
        agentId: messageData.agent.id || "",
        agentName: messageData.agent.name || "",
        agentIp: messageData.agent.ip || "",
        agentLabels: messageData.agent.labels || {},
      }
    }
    
    // Try event source data
    if (eventSourceData && eventSourceData.agent) {
      return {
        agentId: eventSourceData.agent.id || "",
        agentName: eventSourceData.agent.name || "",
        agentIp: eventSourceData.agent.ip || "",
        agentLabels: eventSourceData.agent.labels || {},
      }
    }
    
    // Try to get from metadata fields as fallback
    if (metadata.agent_id || metadata.agentId) {
      return {
        agentId: metadata.agent_id || metadata.agentId || "",
        agentName: metadata.agent_name || metadata.agentName || "",
        agentIp: metadata.agent_ip || metadata.agentIp || "",
        agentLabels: metadata.agent_labels || metadata.agentLabels || {},
      }
    }
    return {}
  }

  // Extract network data from event source data
  const getNetworkInfo = () => {
    const data = messageData.data || eventSourceData.data || {}
    const srcIp = data.srcip || data.win?.eventdata?.sourceIp || data.columns?.remote_address || metadata.srcip || metadata.srcIp || ""
    const dstIp = data.dstip || data.win?.eventdata?.destinationIp || data.columns?.local_address || metadata.dstip || metadata.dstIp || ""
    const srcPort = data.srcport || data.win?.eventdata?.sourcePort || metadata.srcport || metadata.srcPort || ""
    const dstPort = data.dstport || data.win?.eventdata?.destinationPort || metadata.dstport || metadata.dstPort || ""
    
    return { srcIp, dstIp, srcPort, dstPort }
  }

  // Extract tags from alert
  const getTagsInfo = () => {
    // Tags dapat berasal dari multiple sources:
    // 1. metadata.tags (array dari tag strings)
    // 2. metadata.copilot_tags (khusus Copilot format)
    // 3. metadata.socfortress.tags (dari Socfortress data)
    const tags: string[] = []

    console.log("[Tags Debug] getTagsInfo called, metadata keys:", Object.keys(metadata || {}))
    console.log("[Tags Debug] metadata.tags:", metadata.tags)
    console.log("[Tags Debug] socfortressData.tags:", socfortressData.tags)

    // Try metadata.tags first
    if (metadata.tags && Array.isArray(metadata.tags)) {
      const extracted = metadata.tags.map((t: any) => typeof t === "string" ? t : t.tag || "").filter(Boolean)
      console.log("[Tags Debug] Extracted from metadata.tags:", extracted)
      tags.push(...extracted)
    }

    // Try metadata.copilot_tags (Copilot-specific)
    if (metadata.copilot_tags && Array.isArray(metadata.copilot_tags)) {
      const extracted = metadata.copilot_tags.map((t: any) => typeof t === "string" ? t : t.tag || "").filter(Boolean)
      console.log("[Tags Debug] Extracted from metadata.copilot_tags:", extracted)
      tags.push(...extracted)
    }

    // Try metadata.socfortress.tags
    if (socfortressData.tags && Array.isArray(socfortressData.tags)) {
      const extracted = socfortressData.tags.map((t: any) => typeof t === "string" ? t : t.tag || "").filter(Boolean)
      console.log("[Tags Debug] Extracted from socfortressData.tags:", extracted)
      tags.push(...extracted)
    }

    // Deduplicate
    const deduplicated = [...new Set(tags)]
    console.log("[Tags Debug] Final tags after dedup:", deduplicated)
    return deduplicated
  }

  // Extract file/process data from event source data
  const getFileInfo = () => {
    const data = messageData.data || eventSourceData.data || {}
    const filePath = data.path || data.win?.eventdata?.image || data.win?.eventdata?.imageLoaded || metadata.path || metadata.file_path || ""
    const cmdLine = data.columns?.cmdline || data.win?.eventdata?.commandLine || metadata.cmdline || metadata.command_line || ""
    const md5 = data.md5 || data.win?.eventdata?.hashes?.md5 || metadata.md5 || ""
    const sha1 = data.sha1 || data.win?.eventdata?.hashes?.sha1 || metadata.sha1 || ""
    const sha256 = data.sha256 || data.win?.eventdata?.hashes?.sha256 || metadata.sha256 || ""
    const processName = data.name || data.win?.eventdata?.image?.split("\\").pop() || metadata.process_name || ""
    const processId = data.columns?.pid || data.win?.eventdata?.processId || metadata.process_id || metadata.pid || ""
    const parentProcessId = data.columns?.parent || data.win?.eventdata?.parentProcessId || metadata.parent_process_id || metadata.parent_pid || ""
    
    return { filePath, cmdLine, md5, sha1, sha256, processName, processId, parentProcessId }
  }

  const ruleInfo = getRuleInfo()
  const agentInfo = getAgentInfo()
  const networkInfo = getNetworkInfo()
  const fileInfo = getFileInfo()
  const tags = getTagsInfo()

  const handleCheckIpReputation = (ip: string) => {
    setSelectedIp(ip)
    setIpDialogOpen(true)
  }

  const handleCheckHashReputation = (hash: string, type: string) => {
    setSelectedHash({ value: hash, type })
    setHashDialogOpen(true)
  }

  const alertId = alert.externalId || alert.id || ""
  const dbId = alert.id || ""
  const integrationId = alert.integrationId || ""
  const alertName = alert.title || alert.name || ""
  const description = alert.description || ""
  const status = getLatestStatus()
  const severity = alert.severity || "Unknown"
  const timestamp = alert.timestamp ? new Date(alert.timestamp).toISOString() : ""
  const createdAt = alert.createdAt ? new Date(alert.createdAt).toISOString() : timestamp
  const updatedAt = alert.updatedAt ? new Date(alert.updatedAt).toISOString() : null

  const source = socfortressData.source || "Unknown"
  const assignedTo = socfortressData.assigned_to || "Unassigned"
  const timeClosed = socfortressData.time_closed
    ? new Date(socfortressData.time_closed).toISOString()
    : null
  const customerCode = socfortressData.customer_code || "Unknown"

  const getAllFields = () => {
    const fields: Record<string, { value: any; type: string }> = {}

    Object.entries(alert).forEach(([key, value]) => {
      if (key !== "metadata") {
        fields[key] = { value, type: typeof value }
      }
    })

    Object.entries(socfortressData).forEach(([key, value]) => {
      fields[`metadata.socfortress.${key}`] = { value, type: typeof value }
    })

    Object.entries(metadata).forEach(([key, value]) => {
      if (key !== "socfortress") {
        fields[`metadata.${key}`] = { value, type: typeof value }
      }
    })

    return fields
  }

  const getSeverityColor = (sev: string) => {
    const lower = (sev || "").toLowerCase()
    if (lower.includes("critical")) return "bg-red-700 text-white"
    if (lower.includes("high")) return "bg-red-600 text-white"
    if (lower.includes("medium")) return "bg-orange-500 text-white"
    if (lower.includes("low")) return "bg-yellow-500 text-white"
    return "bg-gray-500 text-white"
  }

  const getStatusColor = (st: string) => {
    const lower = (st || "").toLowerCase()
    if (lower.includes("open") || lower.includes("new")) return "bg-blue-100 text-blue-800 border-blue-200"
    if (lower.includes("progress")) return "bg-yellow-100 text-yellow-800 border-yellow-200"
    if (lower.includes("closed") || lower.includes("resolved"))
      return "bg-green-100 text-green-800 border-green-200"
    return "bg-gray-100 text-gray-800 border-gray-200"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-4 pr-4">
            <div className="flex-1">
              <div className="text-sm font-normal text-muted-foreground mb-2">
                Alert #{alertId} · Copilot/SOCFortress
              </div>
              <div className="text-lg font-semibold break-words">{alertName}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 items-center">
          <Badge className={getSeverityColor(severity)}>
            <AlertTriangleIcon className="h-3 w-3 mr-1" />
            {severity}
          </Badge>
          <Badge className={`border ${getStatusColor(status)}`}>
            <ShieldCheck className="h-3 w-3 mr-1" />
            {status}
          </Badge>
          {tags.length > 0 && tags.map((tag: string, idx: number) => (
            <Badge key={idx} variant="secondary" className="text-xs">
              <Tag className="h-3 w-3 mr-1" />
              {tag}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {formatTimestampWithTimezone(timestamp)}
          </Badge>
        </div>

        <Separator />

        <Tabs defaultValue="details" className="w-full flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="escalation">Escalation</TabsTrigger>
            <TabsTrigger value="raw">Raw Data</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 overflow-y-auto flex-1">
            {/* Alert Information */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-base">Alert Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Alert ID</label>
                    <p className="text-sm font-mono">{alertId || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                    <p className="text-sm">{formatTimestampWithTimezone(timestamp)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Severity</label>
                    <Badge className={getSeverityColor(severity)}>
                      {severity}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <Badge variant="outline" className={getStatusColor(status)}>
                      {status}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">MTTD</label>
                    {alert.metadata?.socfortress_alert_to_first ? (
                      (() => {
                        const mttdMs = alert.metadata.socfortress_alert_to_first
                        const mttdMinutes = Math.round(mttdMs / 60000)
                        const severityThresholds: Record<string, number> = {
                          Critical: 15,
                          High: 30,
                          Medium: 60,
                          Low: 120,
                        }
                        const threshold = severityThresholds[severity] || 120
                        const exceeded = mttdMinutes > threshold
                        
                        return (
                          <Badge variant={exceeded ? "destructive" : "secondary"} className="gap-1">
                            <Clock className="h-3 w-3" />
                            {mttdMinutes}m {exceeded && `(>${threshold}m)`}
                          </Badge>
                        )
                      })()
                    ) : (
                      <p className="text-sm text-muted-foreground">N/A</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Source System</label>
                    <p className="text-sm">{source}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Customer Code</label>
                    <p className="text-sm font-mono">{customerCode}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rule Information - Only show if from Wazuh event */}
            {(ruleInfo.ruleId || ruleInfo.ruleDescription || Object.keys(ruleInfo).length > 0) && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Rule Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {ruleInfo.ruleId && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Rule ID</label>
                        <p className="text-sm">{ruleInfo.ruleId}</p>
                      </div>
                    )}
                    {ruleInfo.ruleLevel && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Level</label>
                        <p className="text-sm">{ruleInfo.ruleLevel}</p>
                      </div>
                    )}
                    {ruleInfo.ruleDescription && (
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Description</label>
                        <p className="text-sm mt-1">{ruleInfo.ruleDescription}</p>
                      </div>
                    )}
                  </div>

                  {ruleInfo.ruleGroups && ruleInfo.ruleGroups.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Groups</label>
                        <div className="flex flex-wrap gap-2">
                          {ruleInfo.ruleGroups.map((group: string, idx: number) => (
                            <Badge key={idx} variant="secondary">
                              {group}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {(ruleInfo.ruleMitre?.id || ruleInfo.ruleMitre?.tactic || ruleInfo.ruleMitre?.technique) && (
                    <>
                      <Separator />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">MITRE ATT&CK</label>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          {ruleInfo.ruleMitre?.id && (
                            <div>
                              <span className="font-medium">ID:</span> {ruleInfo.ruleMitre.id}
                            </div>
                          )}
                          {ruleInfo.ruleMitre?.tactic && (
                            <div>
                              <span className="font-medium">Tactic:</span> {ruleInfo.ruleMitre.tactic}
                            </div>
                          )}
                          {ruleInfo.ruleMitre?.technique && (
                            <div className="col-span-2">
                              <span className="font-medium">Technique:</span> {ruleInfo.ruleMitre.technique}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Agent Information - Only show if from Wazuh event */}
            {(agentInfo.agentId || agentInfo.agentName || Object.keys(agentInfo).length > 0) && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Agent Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {agentInfo.agentId && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Agent ID</label>
                        <p className="text-sm font-mono">{agentInfo.agentId}</p>
                      </div>
                    )}
                    {agentInfo.agentName && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Agent Name</label>
                        <p className="text-sm">{agentInfo.agentName}</p>
                      </div>
                    )}
                    {agentInfo.agentIp && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Agent IP</label>
                        <p className="text-sm font-mono">{agentInfo.agentIp}</p>
                      </div>
                    )}
                  </div>
                  
                  {agentInfo.agentLabels && Object.keys(agentInfo.agentLabels).length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Labels</label>
                        <div className="space-y-1">
                          {Object.entries(agentInfo.agentLabels).map(([key, value]) => (
                            <div key={key} className="text-sm">
                              <span className="font-medium">{key}:</span> {String(value)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Network Information - Only show if network data exists */}
            {(networkInfo.srcIp || networkInfo.dstIp) && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    Network Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {networkInfo.srcIp && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Source IP</label>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm font-mono flex-1">{networkInfo.srcIp}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCheckIpReputation(networkInfo.srcIp)}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </div>
                      </div>
                    )}
                    {networkInfo.dstIp && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Destination IP</label>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm font-mono flex-1">{networkInfo.dstIp}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCheckIpReputation(networkInfo.dstIp)}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </div>
                      </div>
                    )}
                    {networkInfo.srcPort && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Source Port</label>
                        <p className="text-sm font-mono">{networkInfo.srcPort}</p>
                      </div>
                    )}
                    {networkInfo.dstPort && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Destination Port</label>
                        <p className="text-sm font-mono">{networkInfo.dstPort}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* File Monitoring - Only show if file/process data exists */}
            {(fileInfo.filePath || fileInfo.cmdLine || fileInfo.md5 || fileInfo.sha1 || fileInfo.sha256) && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    File Monitoring
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fileInfo.filePath && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">File Path</label>
                      <p className="text-sm font-mono break-all">{fileInfo.filePath}</p>
                    </div>
                  )}

                  {fileInfo.cmdLine && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Command Line</label>
                      <p className="text-sm font-mono break-all bg-muted/30 p-2 rounded mt-1">{fileInfo.cmdLine}</p>
                    </div>
                  )}

                  {fileInfo.processName && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Process Name</label>
                      <p className="text-sm">{fileInfo.processName}</p>
                    </div>
                  )}

                  {(fileInfo.processId || fileInfo.parentProcessId) && (
                    <div className="grid grid-cols-2 gap-4">
                      {fileInfo.processId && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Process ID</label>
                          <p className="text-sm font-mono">{fileInfo.processId}</p>
                        </div>
                      )}
                      {fileInfo.parentProcessId && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Parent Process ID</label>
                          <p className="text-sm font-mono">{fileInfo.parentProcessId}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {(fileInfo.md5 || fileInfo.sha1 || fileInfo.sha256) && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        {fileInfo.md5 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">MD5</label>
                            <div className="mt-1 space-y-1">
                              <p className="font-mono text-sm break-all">{fileInfo.md5}</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleCheckHashReputation(fileInfo.md5, "MD5")}
                              >
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Check MD5
                              </Button>
                            </div>
                          </div>
                        )}
                        {fileInfo.sha1 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">SHA1</label>
                            <div className="mt-1 space-y-1">
                              <p className="font-mono text-sm break-all">{fileInfo.sha1}</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleCheckHashReputation(fileInfo.sha1, "SHA1")}
                              >
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Check SHA1
                              </Button>
                            </div>
                          </div>
                        )}
                        {fileInfo.sha256 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">SHA256</label>
                            <div className="mt-1 space-y-1">
                              <p className="font-mono text-sm break-all">{fileInfo.sha256}</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => handleCheckHashReputation(fileInfo.sha256, "SHA256")}
                              >
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Check SHA256
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Organization Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Organization & Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Assigned To</label>
                    <p className="text-sm">{assignedTo}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Customer Code</label>
                    <p className="text-sm font-mono">{customerCode}</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Created</label>
                    <p className="text-sm">{new Date(createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Updated</label>
                    <p className="text-sm">{updatedAt ? new Date(updatedAt).toLocaleString() : "—"}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Closed</label>
                    <p className="text-sm">{timeClosed ? new Date(timeClosed).toLocaleString() : "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Description */}
            {description && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alert Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-32 w-full rounded border p-3 bg-muted/30">
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                      {description}
                    </p>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Tags */}
            {tags && tags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Alert Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="px-3 py-1 text-sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Analyses */}
            <AlertAnalysisSection alertId={dbId} integrationId={integrationId} refreshTrigger={refreshTrigger} />
          </TabsContent>

          <TabsContent value="timeline" className="space-y-4 overflow-y-auto flex-1">
            {alertHistory && alertHistory.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Alert Change History</CardTitle>
                  <CardDescription>Timeline of all changes to this alert</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {alertHistory.map((entry: any, index: number) => (
                      <div key={index} className="flex gap-4 pb-4 border-b last:border-0">
                        {/* Timeline indicator */}
                        <div className="flex flex-col items-center gap-2">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            entry.change_type === "STATUS_CHANGE" ? "bg-blue-500 border-blue-500" :
                            entry.change_type === "ASSIGNMENT_CHANGE" ? "bg-purple-500 border-purple-500" :
                            entry.change_type === "COMMENT_ADDED" ? "bg-green-500 border-green-500" :
                            "bg-gray-500 border-gray-500"
                          }`} />
                          {index !== alertHistory.length - 1 && (
                            <div className="w-0.5 h-8 bg-gray-300" />
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="font-semibold text-sm">{entry.change_type}</div>
                              <div className="text-xs text-muted-foreground">
                                {entry.changed_at ? formatTimestampWithTimezone(new Date(entry.changed_at)) : "No date"}
                              </div>
                            </div>
                            {entry.changed_by && (
                              <Badge variant="outline" className="text-xs">
                                {entry.changed_by}
                              </Badge>
                            )}
                          </div>
                          
                          {entry.description && (
                            <p className="text-sm text-foreground mb-2">{entry.description}</p>
                          )}
                          
                          {entry.field_name && (
                            <div className="text-xs space-y-1 bg-muted/50 p-2 rounded">
                              <div><span className="font-medium">Field:</span> {entry.field_name}</div>
                              {entry.old_value !== undefined && entry.old_value !== null && (
                                <div><span className="font-medium">From:</span> <code className="bg-background px-1 rounded">{String(entry.old_value).substring(0, 100)}</code></div>
                              )}
                              {entry.new_value !== undefined && entry.new_value !== null && (
                                <div><span className="font-medium">To:</span> <code className="bg-background px-1 rounded">{String(entry.new_value).substring(0, 100)}</code></div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">No history available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="escalation" className="space-y-4 overflow-y-auto flex-1">
            {/* Refresh Button */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchEscalationData}
                disabled={escalationLoading}
                className="gap-2"
              >
                <Loader2 className={`h-4 w-4 ${escalationLoading ? "animate-spin" : ""}`} />
                {escalationLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            {escalationLoading ? (
              <Card>
                <CardContent className="pt-6 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading escalation history...</span>
                </CardContent>
              </Card>
            ) : escalationData?.active || escalationData?.history?.length > 0 ? (
              <>
                {/* Active Escalation */}
                {escalationData?.active && (
                  <Card className="border-orange-200 bg-orange-50">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangleIcon className="h-4 w-4 text-orange-600" />
                        Active Escalation
                      </CardTitle>
                      <CardDescription>
                        Status: <Badge className="ml-2">{escalationData.active.status}</Badge>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Escalated By</label>
                          <p className="text-sm">{escalationData.active.escalatedBy?.name || "Unknown"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Escalation Level</label>
                          <p className="text-sm font-mono">
                            {escalationData.active.escalationLevel === 1 ? "L1 → L2" : "L2 → L3"}
                          </p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Escalated To</label>
                          <p className="text-sm">{escalationData.active.escalatedTo?.name || "Unknown"}</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Time Escalated</label>
                          <p className="text-sm">{formatTimestampWithTimezone(escalationData.active.createdAt)}</p>
                        </div>
                      </div>

                      {/* L1 Analysis */}
                      {escalationData.active.l1Analysis && (
                        <div className="mt-4">
                          <label className="text-xs font-medium text-muted-foreground">L1 Analysis</label>
                          <div className="mt-2 text-sm bg-muted p-3 rounded">
                            {escalationData.active.l1Analysis}
                          </div>
                        </div>
                      )}

                      {/* Timeout Information */}
                      {escalationData.active.timeoutAt && (
                        <div className="mt-4 flex items-start gap-2">
                          <Clock className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Response Timeout</p>
                            <p className="text-sm">{formatTimestampWithTimezone(escalationData.active.timeoutAt)}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Escalation History */}
                {escalationData?.history && escalationData.history.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Escalation Timeline</CardTitle>
                      <CardDescription>{escalationData.history.length} escalation(s) on record</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {escalationData.history.map((escalation: any, idx: number) => (
                        <div key={escalation.id} className="border-l-2 border-muted pl-4 pb-4">
                          {/* Event Title */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full bg-blue-600" />
                              <span className="font-medium text-sm">
                                {escalation.escalationLevel === 1 ? "L1 escalated to L2" : "L2 escalated to L3"}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {escalation.status}
                            </Badge>
                          </div>

                          {/* Escalation Details */}
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">From:</span> {escalation.escalatedBy?.name || "Unknown"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">To:</span> {escalation.escalatedTo?.name || "Unknown"}
                            </div>
                            <div>
                              <span className="text-muted-foreground">Time:</span> {formatTimestampWithTimezone(escalation.createdAt)}
                            </div>
                          </div>

                          {/* Analysis */}
                          {escalation.l1Analysis && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground font-medium">L1 Analysis:</p>
                              <p className="text-sm bg-muted/50 p-2 rounded mt-1 text-gray-700">
                                {escalation.l1Analysis}
                              </p>
                            </div>
                          )}
                          {escalation.l2Analysis && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground font-medium">L2 Analysis:</p>
                              <p className="text-sm bg-muted/50 p-2 rounded mt-1 text-gray-700">
                                {escalation.l2Analysis}
                              </p>
                            </div>
                          )}
                          {escalation.l3Analysis && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground font-medium">L3 Analysis:</p>
                              <p className="text-sm bg-muted/50 p-2 rounded mt-1 text-gray-700">
                                {escalation.l3Analysis}
                              </p>
                            </div>
                          )}

                          {/* Responses */}
                          {escalation.responses && escalation.responses.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">Responses:</p>
                              {escalation.responses.map((response: any, ridx: number) => (
                                <div key={response.id} className="text-sm bg-blue-50 p-2 rounded border border-blue-200">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <div className="font-medium text-blue-900">{response.responder?.name || "Unknown"}</div>
                                      <div className="text-blue-800">{response.analysis}</div>
                                    </div>
                                    <Badge className="text-xs">{response.conclusion || response.action}</Badge>
                                  </div>
                                  <div className="text-xs text-blue-700 mt-1">
                                    {formatTimestampWithTimezone(response.createdAt)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center">No escalations for this alert</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="raw" className="space-y-4 overflow-y-auto flex-1">
            {/* Incident Event Source Data */}
            {metadata.incident_event?.source_data && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    Incident Event Data (Wazuh)
                  </CardTitle>
                  <CardDescription>Raw event data from incident management system</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] w-full rounded border border-border">
                    <pre className="text-xs bg-muted p-4 font-mono whitespace-pre-wrap break-words word-break">
                      {JSON.stringify(metadata.incident_event.source_data, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  Complete Alert Data
                </CardTitle>
                <CardDescription>Full alert object from PostgreSQL database</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] w-full rounded border border-border">
                  <pre className="text-xs bg-muted p-4 font-mono whitespace-pre-wrap break-words word-break">
                    {JSON.stringify(alert, null, 2)}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Field Summary</CardTitle>
                <CardDescription>All available fields with their types</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] w-full rounded border border-border p-3 bg-muted/30">
                  <div className="space-y-2 font-mono text-xs">
                    {Object.entries(getAllFields())
                      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                      .map(([key, { value, type }]) => (
                        <div
                          key={key}
                          className="flex justify-between items-start gap-4 py-1 border-b border-muted last:border-0"
                        >
                          <span className="font-semibold text-foreground">{key}</span>
                          <div className="text-right">
                            <div className="text-muted-foreground text-xs">({type})</div>
                            <div className="text-foreground break-words whitespace-pre-wrap max-w-sm">
                              {typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator />

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>

      {/* IP Reputation Dialog */}
      {selectedIp && (
        <IpReputationDialog
          open={ipDialogOpen}
          onOpenChange={setIpDialogOpen}
          ip={selectedIp}
        />
      )}

      {/* Hash Reputation Dialog */}
      {selectedHash && (
        <HashReputationDialog
          open={hashDialogOpen}
          onOpenChange={setHashDialogOpen}
          hash={selectedHash.value}
          type={selectedHash.type}
        />
      )}
    </Dialog>
  )
}
