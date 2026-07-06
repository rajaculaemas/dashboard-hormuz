"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Clock, AlertTriangle } from "lucide-react"
import { QRADAR_ASSIGNEES } from "@/components/case/case-action-dialog"

interface QRadarAlertUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  onUpdateSuccess?: () => void
  onLoadAlerts?: () => void
  onShowClosingReasonDialog?: () => void
  selectedClosingReason?: string | null
  showClosingReasonDialog?: boolean
}

interface L2Analyst {
  id: string
  name: string
  email: string
  telegramChatId?: string
}

export function QRadarAlertUpdateDialog({
  open,
  onOpenChange,
  alert,
  onUpdateSuccess,
  onLoadAlerts,
  onShowClosingReasonDialog,
  selectedClosingReason,
  showClosingReasonDialog = false,
}: QRadarAlertUpdateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState("New")
  const [assignee, setAssignee] = useState("")
  const [comments, setComments] = useState("")
  const [severityBasedOnAnalysis, setSeverityBasedOnAnalysis] = useState<string | null>(null)
  const [analysisNotes, setAnalysisNotes] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [appUsers, setAppUsers] = useState<Array<{ id: string; name: string }>>([])
  
  // Escalation state
  const [actionMode, setActionMode] = useState<"update" | "escalate">("update")
  const [l2Analysts, setL2Analysts] = useState<L2Analyst[]>([])
  const [loadingAnalysts, setLoadingAnalysts] = useState(false)
  const [escalateToL2, setEscalateToL2] = useState<string>("")
  const [escalationAnalysis, setEscalationAnalysis] = useState("")
  const [escalationError, setEscalationError] = useState<string>("")

  useEffect(() => {
    if (open) {
      // Fetch QRadar users from QRadar API
      ;(async () => {
        try {
          const integrationId = alert.integrationId || alert.integration?.id
          if (!integrationId) {
            console.warn("[QRadarAlertUpdateDialog] No integrationId found in alert, using fallback QRADAR_ASSIGNEES")
            setAppUsers(QRADAR_ASSIGNEES)
            return
          }

          const resp = await fetch(`/api/qradar/users?integrationId=${integrationId}`)
          const data = await resp.json()
          
          if (data.success && Array.isArray(data.users)) {
            // Map QRadar users to { id, name } format
            const mappedUsers = data.users.map((u: any) => ({
              id: u.id || u.username,
              name: u.username
            }))
            console.log(`[QRadarAlertUpdateDialog] Fetched ${mappedUsers.length} QRadar users`)
            setAppUsers(mappedUsers)
          } else {
            console.warn("[QRadarAlertUpdateDialog] Failed to fetch QRadar users, using fallback QRADAR_ASSIGNEES")
            setAppUsers(QRADAR_ASSIGNEES)
          }
        } catch (err) {
          console.error("[QRadarAlertUpdateDialog] Failed to fetch QRadar users:", err)
          setAppUsers(QRADAR_ASSIGNEES)
        }
      })()

      // Fetch L2 analysts for escalation
      fetchL2Analysts()
    }
  }, [open, alert])

  if (!open || !alert) return null

  const fetchL2Analysts = async () => {
    try {
      setLoadingAnalysts(true)
      console.log("[QRadarAlertUpdateDialog] Fetching L2 analysts...")
      const response = await fetch("/api/users?position=L2")
      const data = await response.json()
      console.log("[QRadarAlertUpdateDialog] API Response:", data)
      
      if (data.success && Array.isArray(data.users)) {
        console.log("[QRadarAlertUpdateDialog] L2 analysts loaded:", data.users.length, "analysts")
        setL2Analysts(data.users)
      } else if (Array.isArray(data)) {
        console.log("[QRadarAlertUpdateDialog] L2 analysts loaded (array format):", data.length, "analysts")
        setL2Analysts(data)
      } else {
        console.error("[QRadarAlertUpdateDialog] Unexpected response format:", data)
        setL2Analysts([])
      }
    } catch (error) {
      console.error("[QRadarAlertUpdateDialog] Error fetching L2 analysts:", error)
      setL2Analysts([])
    } finally {
      setLoadingAnalysts(false)
    }
  }

  const handleEscalate = async () => {
    setEscalationError("")
    if (!escalateToL2?.trim()) {
      setEscalationError("Please select an L2 analyst")
      return
    }
    if (!escalationAnalysis?.trim() || escalationAnalysis.trim().length < 20) {
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
          notes: escalationAnalysis,
        }),
      })

      if (response.ok) {
        console.log("[QRadar Dialog] Alert escalated successfully")
        setEscalateToL2("")
        setEscalationAnalysis("")
        
        // Refresh alerts
        await onLoadAlerts?.()
        
        // Reset form and close dialog
        setActionMode("update")
        onOpenChange(false)
        onUpdateSuccess?.()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to escalate alert" }))
        setEscalationError(errorData.error || "Failed to escalate alert")
      }
    } catch (error) {
      console.error("[QRadar Dialog] Error escalating alert:", error)
      setEscalationError(error instanceof Error ? error.message : "Failed to escalate alert")
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateStatus = async () => {
    setErrorMessage("")

    // Only check assignee for update mode
    if (actionMode === "update" && !assignee?.trim()) {
      setErrorMessage("Please assign the alert to a user before updating status")
      return
    }

    // For CLOSED status, closing reason is required
    if (actionMode === "update" && status === "Closed" && !selectedClosingReason) {
      onShowClosingReasonDialog?.()
      return
    }

    try {
      setIsLoading(true)

      const body: any = {
        status,
        comments,
        isQRadar: true,
        assignedTo: assignee,
      }

      // Add custom analysis fields
      if (severityBasedOnAnalysis) {
        body.severityBasedOnAnalysis = severityBasedOnAnalysis
      }
      if (analysisNotes?.trim()) {
        body.analysisNotes = analysisNotes
      }

      // For CLOSED status, include closing reason
      if (status === "Closed" && selectedClosingReason) {
        body.closingReasonId = selectedClosingReason
      }

      // For FOLLOW_UP status, create ticket
      if (status === "In Progress") {
        body.shouldCreateTicket = true
      }

      const response = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        console.log("[QRadar Dialog] Alert status updated successfully")

        // Save analysis if provided
        if (analysisNotes?.trim()) {
          try {
            await fetch(`/api/alerts/${alert.id}/analyses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: analysisNotes,
                integrationId: alert.integrationId || alert.metadata?.integrationId,
              }),
            })
          } catch (error) {
            console.error("Failed to save analysis:", error)
          }
        }

        // Refresh alerts
        await onLoadAlerts?.()

        // Reset form
        setStatus("New")
        setAssignee("")
        setComments("")
        setSeverityBasedOnAnalysis(null)
        setAnalysisNotes("")
        onOpenChange(false)
        onUpdateSuccess?.()
      } else {
        throw new Error("Failed to update alert")
      }
    } catch (error) {
      console.error("[QRadar Dialog] Error updating alert:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to update alert")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update QRadar Alert</DialogTitle>
          <DialogDescription>Update the status, assignment, and analysis for this QRadar alert</DialogDescription>
        </DialogHeader>

        {/* Action Mode Selection */}
        <div className="border-b pb-4">
          <Label className="text-base font-semibold mb-3 block">Action Mode</Label>
          <RadioGroup value={actionMode} onValueChange={(value) => {
            setActionMode(value as "update" | "escalate")
            setErrorMessage("")
            setEscalationError("")
          }}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="update" id="mode-update" />
              <Label htmlFor="mode-update" className="cursor-pointer font-normal">Update Status</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="escalate" id="mode-escalate" />
              <Label htmlFor="mode-escalate" className="cursor-pointer font-normal">Escalate to L2</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Update Mode */}
        {actionMode === "update" && (
          <>
            {errorMessage && (
              <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
            )}

            <div className="space-y-4 py-4">
              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New">Open</SelectItem>
                    <SelectItem value="In Progress">Follow Up (Create Ticket)</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Assign To - REQUIRED for QRadar */}
              <div className="space-y-2">
                <Label htmlFor="assignee">
                  Assign To <span className="text-red-500">*</span>
                </Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger id="assignee">
                    <SelectValue placeholder="Select user (required)" />
                  </SelectTrigger>
                  <SelectContent>
                    {(appUsers.length > 0 ? appUsers : QRADAR_ASSIGNEES).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Comments */}
              <div className="space-y-2">
                <Label htmlFor="comments">Comments</Label>
                <Textarea
                  id="comments"
                  placeholder="Add comments about this status change..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              {/* Analysis Section */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Analysis & Findings</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="severity-analysis">Severity Based on Analysis</Label>
                    <div className="flex gap-2">
                      <Select value={severityBasedOnAnalysis || "low"} onValueChange={(v) => setSeverityBasedOnAnalysis(v)}>
                        <SelectTrigger id="severity-analysis" className="flex-1">
                          <SelectValue placeholder="Select severity (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      {severityBasedOnAnalysis && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSeverityBasedOnAnalysis(null)}
                          className="px-3"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="analysis-notes">Analysis & Findings</Label>
                    <Textarea
                      id="analysis-notes"
                      placeholder="Document your analysis, observations, or findings about this alert..."
                      value={analysisNotes}
                      onChange={(e) => setAnalysisNotes(e.target.value)}
                      className="h-[120px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Escalation Mode */}
        {actionMode === "escalate" && (
          <>
            {escalationError && (
              <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{escalationError}</p>
              </div>
            )}

            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-2">
                  <Clock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <CardTitle className="text-sm">Escalation Timeout</CardTitle>
                    <CardDescription className="text-xs mt-1">L2 analyst has 30 minutes to respond</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="space-y-4 py-4">
              {/* Select L2 Analyst */}
              <div className="space-y-2">
                <Label htmlFor="escalate-to">
                  Escalate To L2 Analyst <span className="text-red-500">*</span>
                </Label>
                <Select value={escalateToL2} onValueChange={setEscalateToL2} disabled={loadingAnalysts}>
                  <SelectTrigger id="escalate-to">
                    <SelectValue placeholder={loadingAnalysts ? "Loading analysts..." : "Select L2 analyst"} />
                  </SelectTrigger>
                  <SelectContent>
                    {l2Analysts.map((analyst) => (
                      <SelectItem key={analyst.id} value={analyst.id}>
                        {analyst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Escalation Analysis */}
              <div className="space-y-2">
                <Label htmlFor="escalation-analysis">
                  Analysis <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="escalation-analysis"
                  placeholder="Provide analysis for L2 escalation (minimum 20 characters)..."
                  value={escalationAnalysis}
                  onChange={(e) => setEscalationAnalysis(e.target.value)}
                  className="h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  {escalationAnalysis.length}/20 characters minimum
                </p>
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={actionMode === "update" ? handleUpdateStatus : handleEscalate} 
            disabled={isLoading || (actionMode === "escalate" && loadingAnalysts)}
          >
            {isLoading ? (
              actionMode === "update" ? "Updating..." : "Escalating..."
            ) : (
              actionMode === "update" ? "Update Status" : "Escalate to L2"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
