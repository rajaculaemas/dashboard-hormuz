"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RefreshCwIcon, AlertCircle, Lock, Unlock, Clock, Upload } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { SOCFORTRESS_USERS, ALERT_TAGS, ALERT_SEVERITIES } from "@/lib/constants/socfortress"
import { EscalationFileUploader } from "./escalation-file-uploader"
import { PendingEscalationFileUploader } from "./pending-escalation-file-uploader"
import { EscalationConversationView } from "./escalation-conversation-view"

interface SocfortressAlertUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  onUpdateSuccess?: () => void
  onAnalysisSaved?: () => void
  currentUser?: any
}

interface L2Analyst {
  id: string
  name: string
  email: string
  telegramChatId?: string
}

export function SocfortressAlertUpdateDialog({
  open,
  onOpenChange,
  alert,
  onUpdateSuccess,
  onAnalysisSaved,
  currentUser,
}: SocfortressAlertUpdateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [l2Analysts, setL2Analysts] = useState<L2Analyst[]>([])
  const [loadingAnalysts, setLoadingAnalysts] = useState(false)
  const [loadingL2Analysts, setLoadingL2Analysts] = useState(false)
  const [socfortressUsers, setSocfortressUsers] = useState<any[]>([])
  const [loadingSocfortressUsers, setLoadingSocfortressUsers] = useState(false)
  
  // Escalation state - Enhanced with Telegram integration
  const [actionMode, setActionMode] = useState<"update" | "escalate">("update")
  const [escalation, setEscalation] = useState<any>(null)
  const [escalateToL2, setEscalateToL2] = useState<string>("")
  const [escalationAnalysis, setEscalationAnalysis] = useState("")
  const [escalationError, setEscalationError] = useState<string>("")
  const [loadingEscalation, setLoadingEscalation] = useState(false)
  const [justEscalated, setJustEscalated] = useState(false)
  const [newEscalationId, setNewEscalationId] = useState("")
  const [pendingEscalationFiles, setPendingEscalationFiles] = useState<File[]>([])
  const [closeError, setCloseError] = useState("")
  const [isClosing, setIsClosing] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const [reopenError, setReopenError] = useState("")

  // Map statuses (DB format to UI format)
  const statusMap: Record<string, string> = {
    "OPEN": "New",
    "IN_PROGRESS": "In Progress",
    "CLOSED": "Closed",
  }

  // Initialize with proper status mapping
  const currentDbStatus = alert?.metadata?.socfortress?.status || alert?.status || "OPEN"
  const currentUiStatus = statusMap[currentDbStatus] || "New"

  const [status, setStatus] = useState(currentUiStatus)
  const [severity, setSeverity] = useState(alert?.metadata?.socfortress?.severity || alert?.severity || "Medium")
  const [assignedTo, setAssignedTo] = useState(alert?.metadata?.socfortress?.assigned_to || "unassigned")
  const [comment, setComment] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>(alert?.metadata?.tags || [])

  // Fetch users and escalation and initialize fields when dialog opens
  useEffect(() => {
    if (open) {
      // Always fetch L2 analysts, Socfortress users, and escalation when dialog opens
      fetchL2Analysts()
      fetchSocfortressUsers()
      if (alert?.id) {
        fetchEscalation()
      }

      // Initialize/Reset fields
      const currentDbStatus = alert?.metadata?.socfortress?.status || alert?.status || "OPEN"
      setStatus(statusMap[currentDbStatus] || "New")
      setSeverity(alert?.metadata?.socfortress?.severity || alert?.severity || "Medium")
      setAssignedTo(alert?.metadata?.socfortress?.assigned_to || "unassigned")
      setComment("")

      // Extract all tags cleanly
      const tags: string[] = []
      const meta = alert?.metadata || {}
      const socfortressData = meta.socfortress || {}
      
      if (meta.tags && Array.isArray(meta.tags)) {
        tags.push(...meta.tags.map((t: any) => typeof t === "string" ? t : t.tag || "").filter(Boolean))
      }
      if (meta.copilot_tags && Array.isArray(meta.copilot_tags)) {
        tags.push(...meta.copilot_tags.map((t: any) => typeof t === "string" ? t : t.tag || "").filter(Boolean))
      }
      if (socfortressData.tags && Array.isArray(socfortressData.tags)) {
        tags.push(...socfortressData.tags.map((t: any) => typeof t === "string" ? t : t.tag || "").filter(Boolean))
      }
      setSelectedTags([...new Set(tags)])
    }
  }, [open, alert])

  const fetchL2Analysts = async () => {
    try {
      setLoadingL2Analysts(true)
      console.log("[Socfortress Dialog] Fetching L2 analysts...")
      const response = await fetch(`/api/users?position=L2`)
      const data = await response.json()
      console.log("[Socfortress Dialog] API Response:", data)
      
      if (data.success && Array.isArray(data.users)) {
        console.log("[Socfortress Dialog] L2 analysts loaded:", data.users.length, "analysts")
        setL2Analysts(data.users)
      } else if (Array.isArray(data)) {
        console.log("[Socfortress Dialog] L2 analysts loaded (array format):", data.length, "analysts")
        setL2Analysts(data)
      } else {
        console.error("[Socfortress Dialog] Unexpected response format:", data)
        setL2Analysts([])
      }
    } catch (error) {
      console.error("[Socfortress Dialog] Error fetching L2 analysts:", error)
      setL2Analysts([])
    } finally {
      setLoadingL2Analysts(false)
    }
  }

  const fetchSocfortressUsers = async () => {
    try {
      setLoadingSocfortressUsers(true)
      console.log("[Socfortress Dialog] Fetching Socfortress users...")
      
      // Get integrationId from alert metadata
      const integrationId = alert?.integrationId
      if (!integrationId) {
        console.warn("[Socfortress Dialog] No integrationId found, using fallback users")
        // Fallback to constants if no integrationId
        setSocfortressUsers([])
        return
      }
      
      const response = await fetch(`/api/socfortress/users?integrationId=${integrationId}`)
      const data = await response.json()
      console.log("[Socfortress Dialog] Socfortress users response:", data)
      
      if (data.success && Array.isArray(data.users)) {
        console.log("[Socfortress Dialog] Socfortress users loaded:", data.users.length, "users")
        setSocfortressUsers(data.users)
      } else {
        console.error("[Socfortress Dialog] Unexpected response format:", data)
        setSocfortressUsers([])
      }
    } catch (error) {
      console.error("[Socfortress Dialog] Error fetching Socfortress users:", error)
      setSocfortressUsers([])
    } finally {
      setLoadingSocfortressUsers(false)
    }
  }

  const fetchEscalation = async () => {
    if (!alert?.id) return
    try {
      setLoadingEscalation(true)
      const response = await fetch(`/api/alerts/${alert.id}/escalation`)
      if (response.ok) {
        const data = await response.json().catch(() => ({ escalation: null }))
        setEscalation(data.escalation || null)
      }
    } catch (error) {
      console.error("[Socfortress Dialog] Error fetching escalation:", error)
    } finally {
      setLoadingEscalation(false)
    }
  }

  // Helper to toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleCloseEscalation = async () => {
    if (!escalation?.id) return
    try {
      setIsClosing(true)
      setCloseError("")
      const response = await fetch(`/api/alerts/${alert.id}/escalation/${escalation.id}/close-reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      })

      if (response.ok) {
        await fetchEscalation()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to close escalation" }))
        setCloseError(errorData.error || "Failed to close escalation")
      }
    } catch (error) {
      console.error("[Socfortress Dialog] Error closing escalation:", error)
      setCloseError("Failed to close escalation")
    } finally {
      setIsClosing(false)
    }
  }

  const handleReopenEscalation = async () => {
    if (!escalation?.id) return
    try {
      setIsReopening(true)
      setReopenError("")
      const response = await fetch(`/api/alerts/${alert.id}/escalation/${escalation.id}/close-reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      })

      if (response.ok) {
        await fetchEscalation()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to reopen escalation" }))
        setReopenError(errorData.error || "Failed to reopen escalation")
      }
    } catch (error) {
      console.error("[Socfortress Dialog] Error reopening escalation:", error)
      setReopenError("Failed to reopen escalation")
    } finally {
      setIsReopening(false)
    }
  }

  const handleEscalate = async () => {
    setEscalationError("")
    if (!escalateToL2) {
      setEscalationError("Please select an L2 analyst")
      return
    }
    if (!escalationAnalysis.trim() || escalationAnalysis.trim().length < 20) {
      setEscalationError("Analysis must be at least 20 characters")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/alerts/${alert.id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escalationLevel: 2,
          assignedToId: escalateToL2,
          notes: escalationAnalysis || "",
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("[Socfortress Dialog] Alert escalated successfully")
        setJustEscalated(true)
        const escalationId = data.escalationId || ""
        setNewEscalationId(escalationId)
        
        // Upload pending files if any exist
        if (pendingEscalationFiles.length > 0 && escalationId) {
          console.log("[Socfortress Dialog] Uploading pending files...", pendingEscalationFiles.length)
          for (const file of pendingEscalationFiles) {
            const formData = new FormData()
            formData.append("file", file)
            formData.append("escalationId", escalationId)
            try {
              await fetch(`/api/alerts/${alert.id}/escalation/upload-attachment`, {
                method: "POST",
                body: formData,
              })
            } catch (fileError) {
              console.error("[Socfortress Dialog] Error uploading file:", fileError)
            }
          }
        }
        
        setEscalateToL2("")
        setEscalationAnalysis("")
        setPendingEscalationFiles([])
        await fetchEscalation()
        onOpenChange(false)
        onUpdateSuccess?.()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to escalate alert" }))
        throw new Error(errorData.error || "Failed to escalate alert")
      }
    } catch (error) {
      console.error("[Socfortress Dialog] Error escalating alert:", error)
      setEscalationError(error instanceof Error ? error.message : "Failed to escalate alert")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (actionMode === "escalate") {
      await handleEscalate()
      return
    }

    // Normal update mode (existing logic)
    if (!alert?.id) {
      console.error("Alert ID missing")
      return
    }

    setIsLoading(true)
    try {
      // Calculate tag changes
      const originalTags = alert?.metadata?.tags || []
      const tagsToAdd = selectedTags.filter((tag: string) => !originalTags.includes(tag))
      const tagsToDelete = originalTags.filter((tag: string) => !selectedTags.includes(tag))

      const payload = {
        status: status, // Send UI format directly (New, In Progress, Closed)
        severity,
        assignedTo: assignedTo === "unassigned" ? null : assignedTo,
        comments: comment || undefined,
        ...(tagsToAdd.length > 0 && { tagsToAdd }),
        ...(tagsToDelete.length > 0 && { tagsToDelete }),
      }

      console.log("[Dialog] Submitting alert update:", payload)

      const response = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update alert")
      }

      console.log("[Dialog] Alert updated successfully")
      onOpenChange(false)
      onUpdateSuccess?.()
    } catch (error) {
      console.error("[Dialog] Error updating alert:", error)
      window.alert("Failed to update alert: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsLoading(false)
    }
  }

  if (!alert) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Alert: {alert.title || alert.alert_name}</DialogTitle>
          <DialogDescription>
            ID: {alert.externalId || alert.id} • Source: {alert.integration?.name || "SOCFortress"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Action Mode Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Action</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={actionMode} onValueChange={(val) => setActionMode(val as "update" | "escalate")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="update" id="update-mode" />
                  <Label htmlFor="update-mode" className="cursor-pointer font-normal">
                    Update Status (as L1 Analyst)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem 
                    value="escalate" 
                    id="escalate-mode"
                    disabled={escalation !== null && !loadingEscalation}
                  />
                  <Label 
                    htmlFor="escalate-mode" 
                    className={`cursor-pointer font-normal ${escalation !== null && !loadingEscalation ? "text-gray-400" : ""}`}
                  >
                    Escalate to L2 {escalation !== null && !loadingEscalation ? "(Already escalated)" : "(requires analysis)"}
                  </Label>
                </div>
              </RadioGroup>

              {actionMode === "escalate" && escalation && !loadingEscalation && (
                <div className="mt-4 flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">This alert is already escalated</p>
                    <p className="text-xs text-blue-800 mt-1">
                      View the escalation details below or check the Attachments tab to continue the escalation conversation with L2 analysts.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Escalation Section */}
          {actionMode === "escalate" && escalation && (
            <Tabs defaultValue="attachments" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="attachments">📎 Attachments</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>

              {/* Escalation Attachments Tab */}
              <TabsContent value="attachments" className="space-y-4">
                <div className="mt-4">
                  <EscalationFileUploader
                    alertId={alert.id}
                    escalationId={escalation.id}
                    disabled={escalation.closedAt ? true : false}
                    onUploadComplete={() => fetchEscalation()}
                  />
                </div>
              </TabsContent>

              {/* Escalation Details Tab */}
              <TabsContent value="details" className="space-y-4">
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium text-gray-600">Escalated By</p>
                    <p className="text-gray-900">{escalation.escalatedBy?.name || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Escalated To</p>
                    <p className="text-gray-900">{escalation.escalatedTo?.name || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Escalation Time</p>
                    <p className="text-gray-900 text-xs">{new Date(escalation.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-600">Status</p>
                    <div className="mt-1">
                      <Badge variant={escalation.closedAt ? "secondary" : "default"}>
                        {escalation.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {!escalation.closedAt && (
                  <div className="border-t pt-4">
                    <Label className="text-sm font-medium mb-2 block">Close Escalation</Label>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleCloseEscalation()}
                      disabled={isClosing}
                      className="w-full"
                    >
                      {isClosing ? "Closing..." : "Close Escalation"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Closing will stop further escalation activity unless reopened later.
                    </p>
                  </div>
                )}

                {escalation.closedAt && (
                  <div className="border-t pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReopenEscalation}
                      disabled={isReopening}
                    >
                      <Unlock className="h-3 w-3 mr-2" />
                      Reopen
                    </Button>
                  </div>
                )}

                {closeError && (
                  <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{closeError}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* Escalation Form - New Escalation */}
          {actionMode === "escalate" && !escalation && !loadingEscalation && (
            <Card className="border-orange-200 bg-orange-50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  Escalate to L2 Analyst
                </CardTitle>
                <CardDescription>
                  This will notify the selected L2 analyst via Telegram with your analysis for investigation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Timeout Information */}
                <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <Clock className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-orange-900">30-Minute Response Timeout</p>
                    <p className="text-xs text-orange-800 mt-1">
                      L2 analyst will have 30 minutes to respond via Telegram. If no response is received, the alert will be auto-escalated to L3.
                    </p>
                  </div>
                </div>

                {/* L2 Analyst Selection */}
                <div className="space-y-2">
                  <Label htmlFor="escalate-to-l2">Escalate to L2 Analyst * {loadingL2Analysts && "(Loading...)"}</Label>
                  <Select value={escalateToL2} onValueChange={setEscalateToL2} disabled={loadingL2Analysts || l2Analysts.length === 0}>
                    <SelectTrigger id="escalate-to-l2">
                      <SelectValue placeholder={loadingL2Analysts ? "Loading L2 analysts..." : l2Analysts.length === 0 ? "No L2 analysts available" : "Select L2 analyst"} />
                    </SelectTrigger>
                    <SelectContent>
                      {l2Analysts.length > 0 ? (
                        l2Analysts.map((analyst) => (
                          <SelectItem key={analyst.id} value={analyst.id}>
                            {analyst.name} {analyst.email ? `(${analyst.email})` : ""}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-muted-foreground">
                          {loadingL2Analysts ? "Loading analysts..." : "No L2 analysts found with Telegram chat ID"}
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">L2 analyst must have Telegram chat ID linked</p>
                  {!loadingL2Analysts && l2Analysts.length > 0 && (
                    <p className="text-xs text-green-600">✓ {l2Analysts.length} L2 analysts available</p>
                  )}
                </div>

                {/* Escalation Analysis */}
                <div className="space-y-2">
                  <Label htmlFor="escalation-analysis">Analysis (min 20 characters) *</Label>
                  <Textarea
                    id="escalation-analysis"
                    placeholder="Describe your analysis and why this alert needs L2 review..."
                    value={escalationAnalysis}
                    onChange={(e) => setEscalationAnalysis(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    {escalationAnalysis.length} / 20 characters minimum
                  </p>
                </div>

                {/* File Attachment Section */}
                <div className="border-t pt-4">
                  <div className="space-y-2 mb-4">
                    <Label className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Attach Evidence Files (Optional)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Add files now - they'll be sent to the L2 analyst when you escalate
                    </p>
                  </div>
                  <PendingEscalationFileUploader
                    pendingFiles={pendingEscalationFiles}
                    onFilesChange={setPendingEscalationFiles}
                  />
                </div>

                {escalationError && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 flex gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    {escalationError}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Standard Update Section */}
          {actionMode === "update" && (
            <>
              {/* Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New (OPEN)</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Severity */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Severity</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALERT_SEVERITIES.map((sev) => (
                        <SelectItem key={sev} value={sev}>
                          {sev}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Assign To */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Assign To</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={assignedTo} onValueChange={setAssignedTo} disabled={loadingSocfortressUsers}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingSocfortressUsers ? "Loading users..." : "Select user..."} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {(socfortressUsers.length > 0 ? socfortressUsers : SOCFORTRESS_USERS).map((user) => (
                        <SelectItem key={user.id} value={user.username}>
                          {user.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Tags */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tags</CardTitle>
                  <CardDescription>Select one or more tags</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ALERT_TAGS.map((tag) => (
                    <div key={tag} className="flex items-center space-x-2">
                      <Checkbox
                        id={`tag-${tag}`}
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={() => toggleTag(tag)}
                      />
                      <label htmlFor={`tag-${tag}`} className="text-sm cursor-pointer">
                        {tag}
                      </label>
                    </div>
                  ))}
                  {selectedTags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedTags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Comment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Add Comment</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add a comment about this alert..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                  />
                </CardContent>
              </Card>

              {/* Current Values Summary */}
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-sm">Current Values</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div>
                    <span className="font-medium">Current Status:</span> {statusMap[alert.status] || alert.status}
                  </div>
                  <div>
                    <span className="font-medium">Current Severity:</span> {alert.severity || "Not Set"}
                  </div>
                  <div>
                    <span className="font-medium">Current Assignee:</span>{" "}
                    {alert.metadata?.socfortress?.assigned_to || "Unassigned"}
                  </div>
                  <div>
                    <span className="font-medium">Current Tags:</span>{" "}
                    {alert.metadata?.tags?.length > 0 ? alert.metadata.tags.join(", ") : "None"}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || (actionMode === "escalate" && !escalateToL2)}>
            {isLoading && <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading
              ? actionMode === "escalate"
                ? "Escalating..."
                : "Updating..."
              : actionMode === "escalate"
                ? "Escalate to L2"
                : "Update Alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
