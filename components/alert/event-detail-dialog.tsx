"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { IpReputationDialog } from "@/components/alert/ip-reputation-dialog"
import { HashReputationDialog } from "@/components/alert/hash-reputation-dialog"
import { AlertTriangleIcon, ShieldCheck } from "lucide-react"
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

interface EventDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: any
}

export interface QRadarEvent {
  id?: number | string
  qid: number
  starttime: number
  endtime: number
  sourceip: string
  destinationip: string
  sourceport: number
  destinationport: number
  protocol: number
  eventcount: number
  category: number
  severity: number
  username?: string | null
  payload?: string
}

export function EventDetailDialog({ open, onOpenChange, event }: EventDetailDialogProps) {
  if (!event) return null

  const [ipReputationDialogOpen, setIpReputationDialogOpen] = useState(false)
  const [selectedIp, setSelectedIp] = useState<string>("")
  const [hashReputationDialogOpen, setHashReputationDialogOpen] = useState(false)
  const [selectedHash, setSelectedHash] = useState<string>("")
  const [selectedHashType, setSelectedHashType] = useState<string>("")
  const [originalHash, setOriginalHash] = useState<string>("")
  const [originalType, setOriginalType] = useState<string>("")

  const handleCheckIpReputation = (ip: string) => {
    if (!ip) return
    setSelectedIp(ip)
    setIpReputationDialogOpen(true)
  }

  const handleCheckHashReputation = (hash: string, type: string) => {
    if (!hash) return
    console.log(`[EventDetail] Opening hash dialog: originalHash=${hash}, originalType=${type}`)
    
    setOriginalHash(hash)
    setOriginalType(type)
    
    // If checking IMPHASH, use SHA256 instead (VirusTotal doesn't support IMPHASH lookup)
    let hashToCheck = hash
    if (type === "IMPHASH") {
      // Find SHA256 from collected hashes
      const sha256Hash = hashes.find(h => h.type === "SHA256")
      if (sha256Hash) {
        hashToCheck = sha256Hash.value
        console.log(`[EventDetail] IMPHASH not supported, converting to SHA256: ${hashToCheck}`)
      }
    }
    
    console.log(`[EventDetail] Setting selected: hash=${hashToCheck}, type=${type}`)
    setSelectedHash(hashToCheck)
    setSelectedHashType(type)
    setHashReputationDialogOpen(true)
  }

  // Debug: Log event to see what data we have
  console.log("EventDetailDialog - event data:", event)
  console.log("EventDetailDialog - log_sources:", event.log_sources, event.metadata?.log_sources)

  const getSeverityColor = (severity: number) => {
    if (severity >= 9) return "destructive"
    if (severity >= 7) return "default"
    if (severity >= 3) return "secondary"
    return "outline"
  }

  const getSeverityLabel = (severity: number) => {
    if (severity >= 9) return "Critical"
    if (severity >= 7) return "High"
    if (severity >= 3) return "Medium"
    return "Low"
  }

  const formatTimestamp = (timestamp: any) => {
    try {
      if (!timestamp) return "N/A"
      const ts = String(timestamp).length > 11 ? timestamp : timestamp * 1000
      return new Date(ts).toLocaleString()
    } catch {
      return "Invalid date"
    }
  }

  const formatValue = (value: any) => {
    if (value === null || value === undefined || value === "") return "N/A"
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
  }

  const formatLogSources = (logSources: any) => {
    if (!logSources) return "N/A"
    if (Array.isArray(logSources)) {
      return logSources.map((ls: any) => ls.name || ls).join(", ")
    }
    if (typeof logSources === "object" && logSources.name) {
      return logSources.name
    }
    return formatValue(logSources)
  }

  interface HashRecord {
    type: string
    value: string
  }

  // Collect file hashes from common fields and payload
  const collectHashes = (): HashRecord[] => {
    const hashes = new Map<string, HashRecord>()

    const isValidHash = (value: string): boolean => {
      // Check if value is valid hex (16-64 chars) and doesn't contain spaces or text
      return /^[A-Fa-f0-9]{16,64}$/.test(value.trim())
    }

    const extractCleanHash = (value: string): string => {
      // If value contains extra text, try to extract just the hex part
      const match = value.match(/[A-Fa-f0-9]{16,64}/)
      return match ? match[0] : value
    }

    const addHash = (type: string, value: string) => {
      if (!value || !type) return
      const cleanType = type.replace(/\s+/g, " ").trim().toUpperCase()
      let cleanValue = value.trim()
      
      // Extract clean hash if it contains extra text
      if (!isValidHash(cleanValue)) {
        cleanValue = extractCleanHash(cleanValue)
      }
      
      // Only add if it's a valid hash
      if (!isValidHash(cleanValue)) return
      
      // Deduplicate by value hash
      if (!hashes.has(cleanValue)) {
        hashes.set(cleanValue, { type: cleanType, value: cleanValue })
      }
    }

    const addHashFromStringPairs = (text: string) => {
      // Parse "MD5=VALUE,SHA256=VALUE,IMPHASH=VALUE"
      text.split(",").forEach((part) => {
        const trimmed = part.trim()
        const [t, val] = trimmed.split("=")
        if (t && val) addHash(t.trim(), val.trim())
      })
    }

    const scanObject = (obj: Record<string, any>) => {
      Object.entries(obj).forEach(([k, v]) => {
        if (!v) return
        if (typeof v === "string") {
          const kLower = k.toLowerCase()
          // Detect hash-type field names like "EC MD5 Hash", "SHA256 Hash"
          if (kLower.includes("md5")) addHash("MD5", v)
          else if (kLower.includes("sha256")) addHash("SHA256", v)
          else if (kLower.includes("sha1")) addHash("SHA1", v)
          else if (kLower.includes("imphash")) addHash("IMPHASH", v)
          // Also handle raw field names with "hash" keyword
          else if (kLower.endsWith("hash") || kLower.startsWith("hash")) {
            addHash(k, v)
          }
          // Parse combined "Hashes" field
          if (kLower === "hashes") {
            addHashFromStringPairs(v)
          }
        }
      })
    }

    // Direct fields on event
    scanObject(event as Record<string, any>)

    // Metadata fields including keys with spaces like "SHA256 Hash"
    const metadata = (event.metadata || {}) as Record<string, any>
    scanObject(metadata)

    // Parse from payload text
    const payloadText: string | undefined = metadata.payload || (event as any).payload
    if (payloadText) {
      // Pattern: "Hashes: MD5=...,SHA256=...,IMPHASH=..."
      const match = payloadText.match(/Hashes:\s*([^\n]+)/i)
      if (match && match[1]) {
        addHashFromStringPairs(match[1])
      }
      // Regex for hash values: TYPE=HEXVALUE
      const hashRegex = /(MD5|SHA1|SHA256|IMPHASH)\s*=\s*([A-Fa-f0-9]{16,64})/gi
      let m
      while ((m = hashRegex.exec(payloadText)) !== null) {
        addHash(m[1], m[2])
      }
    }

    return Array.from(hashes.values())
  }

  // Get log_sources from various possible locations
  const getLogSources = () => {
    return event.log_sources || event.metadata?.log_sources || null
  }

  // Categorize fields for better display - ordered sections like Tickets/Dashboard view
  const fieldGroups: Record<string, any[]> = {
    "Basic Info": [
      { key: "event_name", label: "Event Name", format: formatValue },
      { key: "summary", label: "Summary", format: formatValue },
      { key: "qid", label: "QID", format: formatValue },
      { key: "category", label: "Category", format: formatValue },
      { key: "severity", label: "Severity", format: (v: any) => `${v}` },
    ],
    "Network": [
      { key: "sourceip", label: "Source IP", format: formatValue },
      { key: "sourceport", label: "Source Port", format: formatValue },
      { key: "sourcemac", label: "Source MAC", format: formatValue },
      { key: "sourceaddress", label: "Source Address", format: formatValue },
      { key: "destinationip", label: "Destination IP", format: formatValue },
      { key: "destinationport", label: "Destination Port", format: formatValue },
      { key: "destinationmac", label: "Destination MAC", format: formatValue },
      { key: "destinationaddress", label: "Destination Address", format: formatValue },
      { key: "eventdirection", label: "Direction", format: formatValue },
      { key: "protocol", label: "Protocol", format: formatValue },
      { key: "bytes", label: "Bytes", format: formatValue },
      { key: "packets", label: "Packets", format: formatValue },
    ],
    "Account & User": [
      { key: "username", label: "Username", format: formatValue },
      { key: "account_name", label: "Account Name", format: formatValue },
      { key: "logon_account_name", label: "Logon Account Name", format: formatValue },
      { key: "logon_account_domain", label: "Logon Account Domain", format: formatValue },
      { key: "logon_type", label: "Logon Type", format: formatValue },
      { key: "User", label: "User", format: formatValue },
      { key: "user", label: "User (lowercase)", format: formatValue },
      { key: "suser", label: "Source User", format: formatValue },
    ],
    "Log Source": [
      { key: "log_sources", label: "Log Source Name(s)", format: formatLogSources },
      { key: "logsourceid", label: "Log Source ID", format: formatValue },
      { key: "logsourceidentifier", label: "Log Source Identifier", format: formatValue },
    ],
    "Timeline": [
      { key: "starttime", label: "Start Time", format: formatTimestamp },
      { key: "endtime", label: "End Time", format: formatTimestamp },
      { key: "eventcount", label: "Event Count", format: formatValue },
    ],
    "Process": [
      { key: "process_name", label: "Process Name", format: formatValue },
      { key: "process_path", label: "Process Path", format: formatValue },
      { key: "process_id", label: "Process ID", format: formatValue },
      { key: "parent_process_name", label: "Parent Process Name", format: formatValue },
      { key: "parent_process_path", label: "Parent Process Path", format: formatValue },
      { key: "parent_process_id", label: "Parent Process ID", format: formatValue },
      { key: "command", label: "Command", format: formatValue },
    ],
    "File": [
      { key: "file_path", label: "File Path", format: formatValue },
      { key: "filename", label: "Filename", format: formatValue },
      { key: "file_directory", label: "File Directory", format: formatValue },
      { key: "ec_image", label: "Image", format: formatValue },
      { key: "md5_hash", label: "MD5 Hash", format: formatValue },
      { key: "sha1_hash", label: "SHA1 Hash", format: formatValue },
      { key: "sha256_hash", label: "SHA256 Hash", format: formatValue },
    ],
    "Web": [
      { key: "url", label: "URL", format: formatValue },
      { key: "url_category", label: "URL Category", format: formatValue },
      { key: "application", label: "Application", format: formatValue },
    ],
    "Threat": [
      { key: "threat_family", label: "Threat Family", format: formatValue },
      { key: "malware_family", label: "Malware Family", format: formatValue },
    ],
  }

  const renderFieldGroup = (groupName: string, fields: any[]) => {
    const visibleFields = fields.filter((f) => {
      if (f.key === "log_sources") {
        const logSources = getLogSources()
        return logSources !== null && logSources !== undefined
      }
      return event[f.key] !== null && event[f.key] !== undefined && event[f.key] !== ""
    })

    if (visibleFields.length === 0 && groupName !== "Account & User" && groupName !== "Log Source") return null

    return (
      <Card key={groupName}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{groupName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleFields.length > 0 ? (
            visibleFields.map((field, idx) => {
              const fieldValue = field.key === "log_sources" ? getLogSources() : event[field.key]
              const isSourceIp = field.key === "sourceip"
              const isDestinationIp = field.key === "destinationip"

              return (
                <div key={idx}>
                  {idx > 0 && <Separator className="my-2" />}
                  <div className="grid grid-cols-3 gap-2 text-xs items-center">
                    <span className="font-medium text-muted-foreground col-span-1 truncate">{field.label}:</span>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <span className="font-mono break-all text-right">{field.format(fieldValue)}</span>
                      {(isSourceIp || isDestinationIp) && fieldValue && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => handleCheckIpReputation(String(fieldValue))}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Check
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <div className="text-xs text-muted-foreground italic">
              {groupName === "Account & User" ? "No account/user information available" : "No log source information available"}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Collect and log hashes for debugging
  const hashes = collectHashes()
  if (hashes.length > 0) {
    console.log("[EventDetail] Collected hashes:", hashes)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col gap-0">
        <DialogHeader className="flex-shrink-0 border-b pb-4 flex flex-row items-start justify-between">
          <div className="flex-1">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5" />
              Event Details
            </DialogTitle>
            <DialogDescription>
              QID {event.qid} - {event.event_name ? event.event_name : "Unknown"} - {getSeverityLabel(event.severity)} Severity
            </DialogDescription>
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
- Event ID: [Extract from event data]
- Name: [Extract from event data]
- Severity: [Extract severity level]
- Source IP: [Extract source IP]
- Destination IP: [Extract destination IP]
- Timestamp: [Extract timestamp]

THREAT ANALYSIS
[Provide a detailed analysis of the threat, potential impact, and attacker's likely objectives. Be thorough.]

INDICATORS OF COMPROMISE (IOCs)
[List relevant IOCs such as IPs, domains, hashes, or other identifiers from the event data.]

RECOMMENDED ACTIONS
[Provide a comprehensive list of investigation and mitigation steps as a numbered or dashed list.]

YOUR TASK:
Fill in the [...] sections of the template above. IMPORTANT: Your entire response must not exceed 2000 characters.`;
              return {
                query_text: `${systemPrompt}\n\nEVENT DATA:\n${JSON.stringify(event, null, 2)}`,
                source_type: "general"
              }
            }} />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="space-y-4 p-6">
            {/* Summary Card - Like Gambar 2 */}
            {event.summary && (
              <Card className="bg-blue-50 dark:bg-blue-950">
                <CardContent className="pt-4">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200 break-words">{event.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Ordered Field Groups - Match Tickets/Dashboard order */}
            {renderFieldGroup("Basic Info", fieldGroups["Basic Info"])}
            {renderFieldGroup("Network", fieldGroups["Network"])}
            {renderFieldGroup("Account & User", fieldGroups["Account & User"])}
            {renderFieldGroup("Log Source", fieldGroups["Log Source"])}
            {renderFieldGroup("Timeline", fieldGroups["Timeline"])}
            {renderFieldGroup("Process", fieldGroups["Process"])}
            {renderFieldGroup("File", fieldGroups["File"])}
            {renderFieldGroup("Web", fieldGroups["Web"])}
            {renderFieldGroup("Threat", fieldGroups["Threat"])}

            {hashes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Hashes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {hashes.map((h, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-2 text-xs items-center">
                      <span className="font-medium text-muted-foreground col-span-1 truncate">{h.type}:</span>
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        <span className="font-mono break-all text-right">{h.value}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => handleCheckHashReputation(h.value, h.type)}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Check
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Raw Payload Card - Show entire event object like Alert Panel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Raw Payload</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-md p-3 overflow-auto max-h-[400px] border">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground leading-relaxed">
                    {(() => {
                      // Build clean payload object from extracted fields (don't include raw payload/payloadSnippet)
                      const cleanEvent = { ...event }
                      
                      // Remove the raw payload fields to avoid double-escaping mess
                      delete cleanEvent.payload
                      delete cleanEvent.payloadSnippet
                      
                      // If there's a payload field that's a JSON string, try to parse and extract key fields
                      let payloadObj: any = {}
                      if (typeof event.payload === "string") {
                        try {
                          const parsed = JSON.parse(event.payload)
                          // Extract useful fields from nested payload
                          if (parsed && typeof parsed === "object") {
                            // Only include non-null fields
                            Object.keys(parsed).forEach(key => {
                              if (parsed[key] !== null && parsed[key] !== undefined && parsed[key] !== "") {
                                payloadObj[key] = parsed[key]
                              }
                            })
                          }
                        } catch {
                          // If parse fails, ignore
                        }
                      }
                      
                      // Merge clean event with payload object
                      const fullEvent = { ...cleanEvent }
                      if (Object.keys(payloadObj).length > 0) {
                        fullEvent.metadata = {
                          ...fullEvent.metadata,
                          ...payloadObj
                        }
                      }
                      
                      // Remove nulls and undefined
                      const filtered = removeNullValues(fullEvent)
                      return JSON.stringify(filtered, null, 2)
                    })()}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* IP Reputation Dialog - outside to avoid nesting conflicts */}
    {open && (
      <IpReputationDialog 
        open={ipReputationDialogOpen}
        onOpenChange={setIpReputationDialogOpen}
        ip={selectedIp}
      />
    )}
    {/* Hash Reputation Dialog - outside to avoid nesting conflicts */}
    {open && (
      <HashReputationDialog
        open={hashReputationDialogOpen}
        onOpenChange={setHashReputationDialogOpen}
        hash={selectedHash}
        type={selectedHashType}
        originalHash={originalHash}
        originalType={originalType}
      />
    )}
    </>
  )
}
