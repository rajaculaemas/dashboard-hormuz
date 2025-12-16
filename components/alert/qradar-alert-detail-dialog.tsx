"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Loader2, ShieldCheck, Clock } from "lucide-react"
import { IpReputationDialog } from "@/components/alert/ip-reputation-dialog"
import { AiAnalysis } from "@/components/alert/ai-analysis"

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

interface QRadarAlertDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  onViewRelatedEvents?: () => void
  isLoadingEvents?: boolean
}

export function QRadarAlertDetailDialog({
  open,
  onOpenChange,
  alert,
  onViewRelatedEvents,
  isLoadingEvents = false,
}: QRadarAlertDetailDialogProps) {
  if (!open || !alert) return null

  const qradarData = alert.metadata?.qradar || {}

  const [timelineEvents, setTimelineEvents] = useState<any[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [ipReputationDialogOpen, setIpReputationDialogOpen] = useState(false)
  const [selectedIp, setSelectedIp] = useState<string>("")  

  const handleCheckIpReputation = (ip: string) => {
    setSelectedIp(ip)
    setIpReputationDialogOpen(true)
  }

  // MTTD: Mean Time To Detect - dari offense timestamp ke assignee/update status time
  const calculateMTTD = (offenseTimestamp: string | undefined, updateTimestamp?: string | undefined, alertStatus?: string) => {
    if (!offenseTimestamp) return null
    
    // Jangan hitung MTTD jika alert masih status New
    if (alertStatus?.toLowerCase() === "new") return null

    try {
      const offenseTime = new Date(offenseTimestamp)
      if (isNaN(offenseTime.getTime())) return null

      // Jika tidak ada update timestamp, return null (belum ada action)
      if (!updateTimestamp) return null
      
      const assigneeTime = new Date(updateTimestamp)
      if (isNaN(assigneeTime.getTime())) return null

      // Calculate difference in minutes
      const diffMs = assigneeTime.getTime() - offenseTime.getTime()
      const diffMinutes = Math.round(diffMs / (1000 * 60))

      return diffMinutes >= 0 ? diffMinutes : null
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

    if (open) {
      fetchTimeline()
    }
  }, [open, alert?.id])

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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col gap-0">
        <DialogHeader className="flex-shrink-0 border-b pb-4">
          <DialogTitle className="flex items-center gap-2">
            <span>Event Details</span>
          </DialogTitle>
          <DialogDescription>
            QID {qradarData.id} - {alert.title || "Unknown"} - {qradarData.severity ? `Severity ${qradarData.severity}` : "Unknown Severity"}
          </DialogDescription>
          <div className="ml-auto">
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

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-4 p-6">
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
                    alert.timestamp,
                    alert.updatedAt || timelineEvents?.[0]?.timestamp,
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

            {/* 2. Network Information - Like Gambar 1 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Network</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {qradarData.sourceip && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-muted-foreground text-xs truncate">Source IP:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs break-all">{qradarData.sourceip}</span>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-6 px-2 text-xs"
                          onClick={() => handleCheckIpReputation(qradarData.sourceip)}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Check
                        </Button>
                      </div>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {alert.metadata?.sourceport && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Source Port:</span>
                      <span className="font-mono col-span-2 break-all text-right">{alert.metadata.sourceport}</span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {alert.metadata?.sourcemac && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Source MAC:</span>
                      <span className="font-mono col-span-2 break-all text-right">{alert.metadata.sourcemac}</span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {qradarData.sourceip && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Source Address:</span>
                      <span className="font-mono col-span-2 break-all text-right">{qradarData.sourceip}</span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {qradarData.destinationip && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-muted-foreground text-xs truncate">Destination IP:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs break-all">{qradarData.destinationip}</span>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-6 px-2 text-xs"
                          onClick={() => handleCheckIpReputation(qradarData.destinationip)}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Check
                        </Button>
                      </div>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {alert.metadata?.destinationport && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Destination Port:</span>
                      <span className="font-mono col-span-2 break-all text-right">{alert.metadata.destinationport}</span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {alert.metadata?.destinationmac && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Destination MAC:</span>
                      <span className="font-mono col-span-2 break-all text-right">{alert.metadata.destinationmac}</span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {qradarData.destinationip && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Destination Address:</span>
                      <span className="font-mono col-span-2 break-all text-right">{qradarData.destinationip}</span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {alert.metadata?.direction && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Direction:</span>
                      <span className="font-mono col-span-2 break-all text-right">{alert.metadata.direction}</span>
                    </div>
                  </div>
                )}
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

            {/* 5. Timeline - From Gambar 1 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {qradarData.start_time && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">Start Time:</span>
                      <span className="font-mono col-span-2 break-all text-right">
                        {new Date(qradarData.start_time).toLocaleString()}
                      </span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                {alert.metadata?.end_time && (
                  <div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">End Time:</span>
                      <span className="font-mono col-span-2 break-all text-right">
                        {new Date(alert.metadata.end_time).toLocaleString()}
                      </span>
                    </div>
                    <Separator className="my-2" />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span className="font-medium text-muted-foreground col-span-1 truncate">Event Count:</span>
                  <span className="font-mono col-span-2 break-all text-right">{qradarData.event_count || 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Alert Timeline (Status & Comments) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Alert Timeline</CardTitle>
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

            {/* 6. Payload - Raw data from Gambar 1 */}
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
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
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
    </>
  )
}
