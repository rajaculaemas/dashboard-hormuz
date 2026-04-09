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
import { RefreshCwIcon, AlertCircle } from "lucide-react"
import { SOCFORTRESS_USERS, ALERT_TAGS, ALERT_SEVERITIES } from "@/lib/constants/socfortress"

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
  
  // Escalation state
  const [actionMode, setActionMode] = useState<"update" | "escalate">("update") // update or escalate
  const [escalateToL2, setEscalateToL2] = useState<string>("") // L2 user ID
  const [escalationAnalysis, setEscalationAnalysis] = useState("")
  const [escalationError, setEscalationError] = useState<string>("")
  const [escalationChangeStatus, setEscalationChangeStatus] = useState(false) // Should change status during escalation?
  const [escalationNewStatus, setEscalationNewStatus] = useState("") // New status if changing

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
  const [analysis, setAnalysis] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>(alert?.metadata?.tags || [])

  // Fetch L2 analysts when dialog opens
  useEffect(() => {
    if (open && actionMode === "escalate") {
      fetchL2Analysts()
    }
  }, [open, actionMode])

  const fetchL2Analysts = async () => {
    try {
      setLoadingAnalysts(true)
      const response = await fetch("/api/users?position=Analyst+L2")
      if (response.ok) {
        const data = await response.json()
        setL2Analysts(data.users || [])
      } else {
        setEscalationError("Failed to load L2 analysts")
      }
    } catch (error) {
      console.error("Error fetching L2 analysts:", error)
      setEscalationError("Error loading L2 analysts")
    } finally {
      setLoadingAnalysts(false)
    }
  }

  // Helper to toggle tag selection
  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  // Validate escalation form
  const validateEscalation = (): boolean => {
    setEscalationError("")

    if (!escalationAnalysis.trim()) {
      setEscalationError("Analysis is required for escalation")
      return false
    }

    if (escalationAnalysis.trim().length < 20) {
      setEscalationError("Analysis must be at least 20 characters")
      return false
    }

    if (!escalateToL2) {
      setEscalationError("Please select an L2 analyst")
      return false
    }

    // If user wants to change status, validate that status is selected
    if (escalationChangeStatus && !escalationNewStatus) {
      setEscalationError("Please select a status")
      return false
    }

    return true
  }

  const handleEscalate = async () => {
    if (!validateEscalation()) {
      return
    }

    setIsLoading(true)
    try {
      // Call escalation endpoint
      const payload: any = {
        alertId: alert.id,
        escalateToUserId: escalateToL2,
        analysis: escalationAnalysis,
      }

      // Add status change only if user selected it
      if (escalationChangeStatus && escalationNewStatus) {
        payload.status = escalationNewStatus
      }

      const response = await fetch("/api/alerts/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to escalate alert")
      }

      console.log("[Dialog] Alert escalated successfully:", data.escalationId)
      onOpenChange(false)
      onUpdateSuccess?.()
    } catch (error) {
      console.error("[Dialog] Error escalating alert:", error)
      setEscalationError(
        "Failed to escalate: " + (error instanceof Error ? error.message : "Unknown error")
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (actionMode === "escalate") {
      await handleEscalate()
      return
    }

    // Normal update mode
    if (!alert?.id) {
      console.error("Alert ID missing")
      return
    }

    setIsLoading(true)
    try {
      const payload = {
        status: status, // Send UI format directly (New, In Progress, Closed)
        severity,
        assignedTo: assignedTo === "unassigned" ? null : assignedTo,
        comments: comment || undefined,
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

      // Save analysis if provided
      if (analysis.trim()) {
        try {
          const analysisResponse = await fetch(`/api/alerts/${alert.id}/analyses`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: analysis,
              integrationId: alert.integrationId || alert.metadata?.integrationId,
            }),
          })

          if (!analysisResponse.ok) {
            console.error("Failed to save analysis, but alert was updated")
          } else {
            // Trigger refresh callback if analysis saved successfully
            onAnalysisSaved?.()
          }
        } catch (error) {
          console.error("Failed to save analysis:", error)
        }
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
                  <RadioGroupItem value="escalate" id="escalate-mode" />
                  <Label htmlFor="escalate-mode" className="cursor-pointer font-normal">
                    Escalate to L2 (requires analysis)
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Escalation Section */}
          {actionMode === "escalate" && (
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
                {/* L2 Analyst Selection */}
                <div>
                  <Label htmlFor="l2-select" className="mb-2 block">
                    Select L2 Analyst *
                  </Label>
                  <Select value={escalateToL2} onValueChange={setEscalateToL2} disabled={loadingAnalysts}>
                    <SelectTrigger id="l2-select">
                      <SelectValue placeholder={loadingAnalysts ? "Loading L2 analysts..." : "Select analyst..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {l2Analysts.map((analyst) => (
                        <SelectItem key={analyst.id} value={analyst.id}>
                          {analyst.name} ({analyst.email})
                          {!analyst.telegramChatId && " ⚠️ No Telegram"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {l2Analysts.length === 0 && !loadingAnalysts && (
                    <p className="text-xs text-red-600 mt-1">No L2 analysts available</p>
                  )}
                </div>

                {/* Escalation Analysis - REQUIRED */}
                <div>
                  <Label htmlFor="escalation-analysis">Analysis (Required) *</Label>
                  <Textarea
                    id="escalation-analysis"
                    placeholder="Provide detailed analysis of this alert that you're escalating to L2. Include context, findings, and why you think L2 input is needed..."
                    value={escalationAnalysis}
                    onChange={(e) => {
                      setEscalationAnalysis(e.target.value)
                      setEscalationError("")
                    }}
                    rows={4}
                    className={escalationError ? "border-red-500" : ""}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {escalationAnalysis.length} characters (minimum 20)
                  </p>
                </div>

                {/* Optional Status Change */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="change-status-escalate"
                      checked={escalationChangeStatus}
                      onCheckedChange={(checked) => {
                        setEscalationChangeStatus(checked as boolean)
                        setEscalationNewStatus("")
                        setEscalationError("")
                      }}
                    />
                    <Label htmlFor="change-status-escalate" className="font-normal cursor-pointer">
                      Also change alert status during escalation
                    </Label>
                  </div>

                  {/* Status Selector - Only show if checkbox is enabled */}
                  {escalationChangeStatus && (
                    <div className="mt-3">
                      <Label htmlFor="escalation-status" className="mb-2 block">
                        New Alert Status *
                      </Label>
                      <Select value={escalationNewStatus} onValueChange={setEscalationNewStatus}>
                        <SelectTrigger id="escalation-status">
                          <SelectValue placeholder="Select status..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New (OPEN)</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {SOCFORTRESS_USERS.map((user) => (
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

              {/* Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Analysis & Findings</CardTitle>
                  <CardDescription>Document your analysis, observations, or findings about this alert</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Enter your analysis and findings here. This will be saved to the analysis history for this alert..."
                    value={analysis}
                    onChange={(e) => setAnalysis(e.target.value)}
                    rows={4}
                  />
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
