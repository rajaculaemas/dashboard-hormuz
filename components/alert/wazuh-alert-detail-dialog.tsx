"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { AlertTriangleIcon, ShieldIcon, NetworkIcon, ShieldCheck, Clock } from "lucide-react"
import { IpReputationDialog } from "@/components/alert/ip-reputation-dialog"
import { HashReputationDialog } from "@/components/alert/hash-reputation-dialog"
import { AiAnalysis } from "@/components/alert/ai-analysis"

interface WazuhAlertDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
}

export function WazuhAlertDetailDialog({ open, onOpenChange, alert }: WazuhAlertDetailDialogProps) {
  
  if (!alert) return null

  // Log for debugging
  console.log('[WazuhAlertDetailDialog] Alert object:', alert)
  console.log('[WazuhAlertDetailDialog] Alert metadata keys:', Object.keys(alert.metadata || {}))

  // Use metadata which contains all the flat fields we parsed
  const metadata = alert.metadata || {}
  const rule = alert.rule || {}
  const agent = alert.agent || {}
  const manager = alert.manager || {}
  
  // Parse the message field which contains full Wazuh data (for optional extended details)
  let parsedData: any = {}
  if (metadata.message && typeof metadata.message === "string") {
    try {
      parsedData = JSON.parse(metadata.message)
    } catch (e) {
      // Silent fallback
    }
  }
  
  // Extract all the flat metadata fields
  const ruleId = metadata.ruleId || rule.id || ""
  const ruleLevel = metadata.ruleLevel || rule.level || 0
  const ruleDescription = metadata.ruleDescription || rule.description || alert.title || ""
  const ruleGroups = metadata.ruleGroups || rule.groups || []
  const ruleFiredTimes = metadata.ruleFiredTimes || 0
  
  const agentId = metadata.agentId || agent.id || ""
  const agentName = metadata.agentName || agent.name || ""
  const agentIp = metadata.agentIp || agent.ip || ""
  const agentLabels = metadata.agentLabels || agent.labels || {}
  
  const managerId = metadata.managerId || manager.name || ""
  const clusterName = metadata.clusterName || ""
  const clusterNode = metadata.clusterNode || ""
  
  // Extract network info from multiple possible locations in raw data
  // Windows events: data.win.eventdata.{sourceIp, destinationIp, sourcePort, destinationPort, protocol}
  // Linux/generic events: data.{srcip, dstip, srcport, dstport, protocol}
  // Support multiple Wazuh shapes: older/newer messages may store network fields in
  // `data.columns.remote_address` / `data.columns.remote_port` or as top-level `data.srcip`.
  const srcIp =
    parsedData.data?.win?.eventdata?.sourceIp ||
    parsedData.data?.srcip ||
    parsedData.data?.columns?.remote_address ||
    metadata.data_columns_remote_address ||
    metadata.srcIp ||
    alert.srcIp ||
    ""
  const dstIp =
    parsedData.data?.win?.eventdata?.destinationIp ||
    parsedData.data?.dstip ||
    parsedData.data?.columns?.local_address ||
    metadata.data_columns_local_address ||
    metadata.dstIp ||
    alert.dstIp ||
    ""
  const srcPort =
    parsedData.data?.win?.eventdata?.sourcePort ||
    parsedData.data?.srcport ||
    parsedData.data?.columns?.remote_port ||
    metadata.data_columns_remote_port ||
    metadata.srcPort ||
    alert.srcPort
  const dstPort =
    parsedData.data?.win?.eventdata?.destinationPort ||
    parsedData.data?.dstport ||
    parsedData.data?.columns?.local_port ||
    metadata.data_columns_local_port ||
    metadata.dstPort ||
    alert.dstPort
  const protocol =
    parsedData.data?.win?.eventdata?.protocol ||
    parsedData.data?.protocol ||
    parsedData.data?.columns?.protocol ||
    metadata.protocol ||
    alert.protocol ||
    ""
  // Prefer nested data.id (HTTP status/code) over top-level event id to show the correct Data ID field
  const dataId =
    parsedData.data?.win?.eventdata?.id ||
    parsedData.data?.id ||
    parsedData.data?.columns?.id ||
    metadata.dataId ||
    metadata.data_id ||
    ""
  
  // Web request fields (from metadata added by wazuh-client.ts)
  const urlRaw = metadata.url || parsedData.data?.url || ""
  const url = typeof urlRaw === "object" && urlRaw?.full ? urlRaw.full : (typeof urlRaw === "string" ? urlRaw : "")
  const httpMethod = metadata.httpMethod || parsedData.data?.protocol || ""
  const httpStatusCode = metadata.httpStatusCode || metadata.data_id || metadata.dataId || parsedData.data?.id || ""
  const userAgent = metadata.userAgent || parsedData.data?.user_agent || ""
  
  // Only show network info if data comes from raw Wazuh data (parsedData), not from metadata defaults
  const hasRealNetworkData = !!(
    parsedData.data?.win?.eventdata?.sourceIp ||
    parsedData.data?.win?.eventdata?.destinationIp ||
    parsedData.data?.srcip ||
    parsedData.data?.dstip ||
    parsedData.data?.columns?.remote_address ||
    parsedData.data?.columns?.local_address ||
    metadata.data_columns_remote_address ||
    metadata.data_columns_local_address ||
    metadata.srcIp ||
    metadata.dstIp ||
    srcIp ||
    dstIp ||
    url // Also show if we have web request data
  )
  
  const mitreTactic = metadata.mitreTactic || parsedData.rule?.mitre?.tactic?.[0]
  const mitreId = metadata.mitreId || parsedData.rule?.mitre?.id
  const mitreTechnique = metadata.mitreTechnique || parsedData.rule?.mitre?.technique?.[0]
  
  const syscheck = parsedData.syscheck || metadata.syscheck || {}
  const eventData = parsedData.data?.win?.eventdata || metadata.eventData || {}
  const fullLog = parsedData.full_log || metadata.fullLog || alert.description || ""
  
  // Extract domain from HTTP Referer header or DNS queries
  const extractDomain = (log: string, metadata: any): string => {
    // 1. Try to extract from HTTP Referer header: "https://domain.com/"
    const refererMatch = log.match(/"https?:\/\/([^/"]+)\//i)
    if (refererMatch && refererMatch[1]) {
      return `${refererMatch[0].split('"')[1]}`
    }
    
    // 2. Try to extract from DNS full_log JSON (resource or dns.question.name)
    try {
      let parsedLog = log
      // Handle double-escaped JSON
      if (log.includes('\\"')) {
        parsedLog = log.replace(/\\"/g, '"')
      }
      const dnsData = JSON.parse(parsedLog)
      
      // DNS resource field (simsdm.posindonesia.co.id)
      if (dnsData.resource && typeof dnsData.resource === 'string') {
        return dnsData.resource
      }
      
      // DNS question name field
      if (dnsData.dns?.question?.name && typeof dnsData.dns.question.name === 'string') {
        return dnsData.dns.question.name
      }
      
      // Data resource field from metadata
      if (dnsData.data?.resource && typeof dnsData.data.resource === 'string') {
        return dnsData.data.resource
      }
    } catch (e) {
      // Silently continue if JSON parsing fails
    }
    
    // 3. Try direct metadata fields for DNS logs
    if (metadata.resource && typeof metadata.resource === 'string') {
      return metadata.resource
    }
    
    return ""
  }
  
  const domain = extractDomain(fullLog, metadata)
  
  // Extract hashes directly from syscheck (from parsed message field)
  const md5Hash = String(syscheck.md5_after || "").trim()
  const sha1Hash = String(syscheck.sha1_after || "").trim()
  const sha256Hash = String(syscheck.sha256_after || "").trim()
  
  console.log('[WazuhAlertDetailDialog] Syscheck object:', syscheck)
  console.log('[WazuhAlertDetailDialog] Hash values extracted:', { 
    md5Hash: md5Hash ? `"${md5Hash.substring(0, 20)}..."` : "EMPTY", 
    sha1Hash: sha1Hash ? `"${sha1Hash.substring(0, 20)}..."` : "EMPTY",
    sha256Hash: sha256Hash ? `"${sha256Hash.substring(0, 20)}..."` : "EMPTY"
  })
  console.log('[WazuhAlertDetailDialog] Boolean checks:', {
    hasMd5: !!md5Hash,
    hasSha1: !!sha1Hash,
    hasSha256: !!sha256Hash,
    anyHash: !!(md5Hash || sha1Hash || sha256Hash)
  })

  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [ipReputationDialogOpen, setIpReputationDialogOpen] = useState(false)
  const [selectedIp, setSelectedIp] = useState<string>("")
  const [hashReputationDialogOpen, setHashReputationDialogOpen] = useState(false)
  const [selectedHash, setSelectedHash] = useState<string>("")
  const [selectedHashType, setSelectedHashType] = useState<string>("")  

  // Calculate MTTD (Mean Time To Detect)
  const calculateMTTD = (alertTimestamp: string | number | undefined, timelineEvents: any[], alertStatus: string) => {
    console.log('[MTTD Debug] Starting calculation:', {
      alertTimestamp,
      alertStatus,
      timelineEventsCount: timelineEvents?.length || 0,
      timelineEvents: timelineEvents
    })

    // Don't show MTTD for "New" alerts that haven't been assigned or updated yet
    if (alertStatus === "New") {
      console.log('[MTTD Debug] Alert status is New, returning null')
      return null
    }

    if (!alertTimestamp || !timelineEvents || timelineEvents.length === 0) {
      console.log('[MTTD Debug] Missing data, returning null')
      return null
    }

    // Find the first status update or assignment event (case-insensitive)
    const firstActionEvent = timelineEvents.find((event: any) => {
      // Log the full event structure to see what fields are available
      console.log('[MTTD Debug] Full event structure:', JSON.stringify(event, null, 2))
      
      // Check multiple possible field names for the action description
      const action = (event.action || event.description || event.message || event.type || "").toLowerCase()
      const matches = action.includes("status changed") || 
             action.includes("assigned to") ||
             action.includes("severity changed")
      console.log('[MTTD Debug] Checking event:', { event, action, matches })
      return matches
    })

    console.log('[MTTD Debug] First action event found:', firstActionEvent)

    if (!firstActionEvent || !firstActionEvent.timestamp) {
      console.log('[MTTD Debug] No valid first action event, returning null')
      return null
    }

    try {
      const alertTime = new Date(alertTimestamp).getTime()
      const actionTime = new Date(firstActionEvent.timestamp).getTime()
      const diffMs = actionTime - alertTime
      
      console.log('[MTTD Debug] Time calculation:', {
        alertTime,
        actionTime,
        diffMs,
        alertDate: new Date(alertTimestamp),
        actionDate: new Date(firstActionEvent.timestamp)
      })
      
      if (diffMs < 0) {
        console.log('[MTTD Debug] Negative time difference, returning null')
        return null
      }
      
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      console.log('[MTTD Debug] Final MTTD:', diffMinutes, 'minutes')
      return diffMinutes
    } catch (error) {
      console.error('[MTTD Debug] Error calculating MTTD:', error)
      return null
    }
  }

  // Get MTTD threshold based on severity
  const getMTTDThreshold = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL':
        return 15
      case 'HIGH':
        return 30
      case 'MEDIUM':
        return 60
      case 'LOW':
        return 120
      default:
        return 60
    }
  }

  const handleCheckIpReputation = (ip: string) => {
    setSelectedIp(ip)
    setIpReputationDialogOpen(true)
  }

  const handleCheckHashReputation = (hash: string, type: string) => {
    if (!hash) return
    setSelectedHash(hash)
    setSelectedHashType(type)
    setHashReputationDialogOpen(true)
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

    if (open) {
      fetchTimeline()
    }
  }, [open, alert?.id])

  const getSeverityColor = (level: number) => {
    if (level <= 2) return "secondary"
    if (level <= 4) return "secondary"
    if (level <= 7) return "default"
    if (level <= 10) return "destructive"
    return "destructive"
  }

  const formatDate = (dateString: string | number | undefined) => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      return date.toLocaleString()
    } catch {
      return String(dateString)
    }
  }

  // Safe stringify to avoid circular references and keep output tidy
  const safeStringify = (obj: any) => {
    const seen = new WeakSet()
    return JSON.stringify(obj, function (key, value) {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]'
        seen.add(value)
      }
      return value
    }, 2)
  }

  // Prepare compact raw object for display: prefer full ES _source if available
  const rawForDisplay = (() => {
    if (metadata?.raw_es) return metadata.raw_es
    // build a compact representation instead of dumping entire `alert` (avoid duplicating fields)
    return {
      timestamp: alert.timestamp,
      externalId: alert.externalId || alert.id,
      title: alert.title,
      severity: alert.severity,
      status: alert.status,
      integrationId: alert.integrationId,
      // include metadata but prefer smaller subset if present
      metadata: metadata || {},
    }
  })()

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] overflow-hidden p-0 z-[100]">
        <DialogHeader className="px-6 pt-6 pb-2 flex flex-row items-start justify-between">
          <div className="flex-1">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangleIcon className="h-5 w-5" />
              Wazuh Alert Details
            </DialogTitle>
            <DialogDescription className="text-sm mt-1">{alert.title || "Alert Details"}</DialogDescription>
          </div>
          <div className="ml-4">
            <AiAnalysis getPayload={() => {
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
- Agent: [Extract agent name]
- Timestamp: [Extract timestamp]

THREAT ANALYSIS
[Provide a detailed analysis of the threat, potential impact, and attacker's likely objectives. Be thorough.]

INDICATORS OF COMPROMISE (IOCs)
[List relevant IOCs such as IPs, domains, hashes, or other identifiers from the alert data.]

RECOMMENDED ACTIONS
[Provide a comprehensive list of investigation and mitigation steps as a numbered or dashed list.]

YOUR TASK:
Fill in the [...] sections of the template above. IMPORTANT: Your entire response must not exceed 2000 characters.`;
              
              // Extract only essential fields to avoid overwhelming the LLM
              const essentialData = {
                alert_id: alert.externalId || alert.id,
                title: alert.title,
                severity: alert.severity,
                status: alert.status,
                timestamp: alert.timestamp,
                agent: {
                  id: agentId,
                  name: agentName,
                  ip: agentIp,
                  customer: agentLabels?.customer
                },
                rule: {
                  id: ruleId,
                  level: ruleLevel,
                  description: ruleDescription,
                  groups: ruleGroups,
                  mitre_tactic: mitreTactic,
                  mitre_id: mitreId,
                  mitre_technique: mitreTechnique
                },
                network: srcIp || dstIp ? {
                  source_ip: srcIp,
                  source_port: srcPort,
                  destination_ip: dstIp,
                  destination_port: dstPort,
                  protocol: protocol
                } : null,
                manager: {
                  name: managerId,
                  cluster: clusterName,
                  node: clusterNode
                },
                full_log: fullLog?.substring(0, 500) // Limit log to 500 chars
              };
              
              return {
                query_text: `${systemPrompt}\n\nALERT DATA:\n${JSON.stringify(essentialData, null, 2)}`,
                source_type: "general"
              }
            }} />
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(95vh-120px)]">
          <div className="space-y-4 px-6 w-full max-w-4xl mx-auto">
            {/* Basic Alert Information */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-base">Alert Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Alert ID</label>
                    <p className="text-sm font-mono">{alert.externalId || alert.id || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                    <p className="text-sm">{formatDate(alert.timestamp)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Severity</label>
                    <Badge variant={getSeverityColor(rule.level || 1)}>
                      {alert.severity || "Low"}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <Badge variant="outline">{alert.status || "Open"}</Badge>
                  </div>
                  {(() => {
                    const mttd = calculateMTTD(alert.timestamp, timelineEvents, alert.status)
                    if (mttd === null) return null
                    
                    const threshold = getMTTDThreshold(alert.severity)
                    const exceeded = mttd > threshold
                    
                    return (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">MTTD (Mean Time To Detect)</label>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={exceeded ? "destructive" : "secondary"} className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {mttd} min {exceeded && `(>${threshold}m)`}
                          </Badge>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Rule Information */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldIcon className="h-4 w-4" />
                  Rule Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Rule ID</label>
                    <p className="text-sm">{ruleId || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Level</label>
                    <p className="text-sm">{ruleLevel || "N/A"}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <p className="text-sm mt-1">{ruleDescription || "N/A"}</p>
                  </div>
                  {ruleFiredTimes > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Fired Times</label>
                      <p className="text-sm">{ruleFiredTimes}</p>
                    </div>
                  )}
                </div>

                {ruleGroups && ruleGroups.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Groups</label>
                      <div className="flex flex-wrap gap-2">
                        {ruleGroups.map((group: string, idx: number) => (
                          <Badge key={idx} variant="secondary">
                            {group}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {(mitreTactic || mitreId || mitreTechnique) && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">MITRE ATT&CK</label>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {mitreId && (
                          <div>
                            <strong>Techniques:</strong>
                            <p>{Array.isArray(mitreId) ? mitreId.join(", ") : mitreId}</p>
                          </div>
                        )}
                        {rule.mitre?.tactic && (
                          <div>
                            <strong>Tactics:</strong>
                            <p>{Array.isArray(rule.mitre.tactic) ? rule.mitre.tactic.join(", ") : rule.mitre.tactic}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Compliance Frameworks */}
                {(rule.pci_dss || rule.gdpr || rule.hipaa || rule.nist_800_53) && (
                  <>
                    <Separator />
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">Compliance</label>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {rule.pci_dss && (
                          <div>
                            <strong>PCI DSS:</strong>
                            <p>{Array.isArray(rule.pci_dss) ? rule.pci_dss.join(", ") : rule.pci_dss}</p>
                          </div>
                        )}
                        {rule.gdpr && (
                          <div>
                            <strong>GDPR:</strong>
                            <p>{Array.isArray(rule.gdpr) ? rule.gdpr.join(", ") : rule.gdpr}</p>
                          </div>
                        )}
                        {rule.hipaa && (
                          <div>
                            <strong>HIPAA:</strong>
                            <p>{Array.isArray(rule.hipaa) ? rule.hipaa.join(", ") : rule.hipaa}</p>
                          </div>
                        )}
                        {rule.nist_800_53 && (
                          <div>
                            <strong>NIST 800-53:</strong>
                            <p>{Array.isArray(rule.nist_800_53) ? rule.nist_800_53.join(", ") : rule.nist_800_53}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Agent Information */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-base">Agent Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Agent ID</label>
                    <p className="text-sm">{agentId || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Agent Name</label>
                    <p className="text-sm">{agentName || "N/A"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Agent IP</label>
                    <p className="text-sm font-mono">{agentIp || "N/A"}</p>
                  </div>
                  {agentLabels?.customer && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Customer</label>
                      <p className="text-sm">{agentLabels.customer}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Manager & Cluster */}
            {(managerId || clusterName) && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="text-base">Manager & Cluster</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {managerId && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Manager</label>
                        <p className="text-sm">{managerId}</p>
                      </div>
                    )}
                    {clusterName && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cluster</label>
                        <p className="text-sm">{clusterName}</p>
                      </div>
                    )}
                    {clusterNode && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cluster Node</label>
                        <p className="text-sm">{clusterNode}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Network Information */}
            {hasRealNetworkData && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <NetworkIcon className="h-4 w-4" />
                    Network Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {srcIp && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Source IP</label>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono">{srcIp}</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCheckIpReputation(srcIp)}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </div>
                      </div>
                    )}
                    {dstIp && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Destination IP</label>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-mono">{dstIp}</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => handleCheckIpReputation(dstIp)}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </div>
                      </div>
                    )}
                    {srcPort && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Source Port</label>
                        <p className="text-sm">{srcPort}</p>
                      </div>
                    )}
                    {dstPort && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Destination Port</label>
                        <p className="text-sm">{dstPort}</p>
                      </div>
                    )}
                    {protocol && !httpMethod && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Protocol</label>
                        <p className="text-sm">{protocol}</p>
                      </div>
                    )}
                    {dataId && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Response Code</label>
                        <p className="text-sm font-mono">{dataId}</p>
                      </div>
                    )}
                    {url && (
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">URL Payload</label>
                        <p className="text-sm break-all font-mono text-blue-600">{url}</p>
                      </div>
                    )}
                    {httpMethod && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">HTTP Method</label>
                        <Badge variant="outline">{httpMethod}</Badge>
                      </div>
                    )}
                    {userAgent && (
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">User Agent</label>
                        <p className="text-sm break-all text-muted-foreground">{userAgent}</p>
                      </div>
                    )}
                    {domain && (
                      <div className="col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Domain (Referer)</label>
                        <p className="text-sm break-all text-blue-600 hover:underline cursor-pointer" onClick={() => window.open(domain, '_blank')}>
                          {domain}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* File Monitoring (Syscheck) */}
            {Object.keys(syscheck).length > 0 && (
              <Card className="w-full">
                <CardHeader>
                  <CardTitle className="text-base">File Monitoring</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {syscheck.path && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">File Path</label>
                      <p className="text-sm font-mono break-all">{syscheck.path}</p>
                    </div>
                  )}
                  {syscheck.event && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Event</label>
                      <p className="text-sm">{syscheck.event}</p>
                    </div>
                  )}
                  {syscheck.mode && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Mode</label>
                      <p className="text-sm">{syscheck.mode}</p>
                    </div>
                  )}
                  {syscheck.perm_after && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Permissions</label>
                      <p className="text-sm">{syscheck.perm_after}</p>
                    </div>
                  )}
                  {syscheck.uname_after && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Owner</label>
                      <p className="text-sm">{syscheck.uname_after}</p>
                    </div>
                  )}
                  {syscheck.gname_after && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Group</label>
                      <p className="text-sm">{syscheck.gname_after}</p>
                    </div>
                  )}
                  {syscheck.md5_after && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">MD5</label>
                      <div className="mt-1 space-y-1">
                        <p className="font-mono text-sm break-all">{syscheck.md5_after}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => handleCheckHashReputation(syscheck.md5_after, "MD5")}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Check
                        </Button>
                      </div>
                    </div>
                  )}
                  {syscheck.sha1_after && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">SHA1</label>
                      <div className="mt-1 space-y-1">
                        <p className="font-mono text-sm break-all">{syscheck.sha1_after}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => handleCheckHashReputation(syscheck.sha1_after, "SHA1")}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Check
                        </Button>
                      </div>
                    </div>
                  )}
                  {syscheck.sha256_after && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">SHA256</label>
                      <div className="mt-1 space-y-1">
                        <p className="font-mono text-sm break-all">{syscheck.sha256_after}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => handleCheckHashReputation(syscheck.sha256_after, "SHA256")}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Check
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Alert Timeline (Status & Comments) */}
            <Card className="w-full">
              <CardHeader>
                <CardTitle className="text-base">Alert Timeline</CardTitle>
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
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">{event.eventType?.replace(/_/g, " ") || "Event"}</label>
                            <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                            {event.changedBy && (
                              <p className="text-[11px] text-muted-foreground mt-1">By: {event.changedBy}</p>
                            )}
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Timestamp</label>
                            <p className="text-xs">{new Date(event.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Full Log */}
            {fullLog && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Full Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap font-mono bg-muted p-3 rounded">{fullLog}</p>
                </CardContent>
              </Card>
            )}

            {/* Raw JSON Data - Show full alert object with all nested fields */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw Alert Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted p-3 rounded font-mono text-xs whitespace-pre-line break-words overflow-x-auto max-w-full">
                  {safeStringify(rawForDisplay)}
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
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

    {/* Hash Reputation Dialog - Outside main dialog to prevent nesting issues */}
    {open && (
      <HashReputationDialog 
        open={hashReputationDialogOpen}
        onOpenChange={setHashReputationDialogOpen}
        hash={selectedHash}
        type={selectedHashType}
        originalHash={selectedHash}
        originalType={selectedHashType}
      />
    )}
    </>
  )
}

