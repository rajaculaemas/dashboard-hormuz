"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle } from "lucide-react"
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

  if (!open || !alert) return null

  const handleUpdateStatus = async () => {
    setErrorMessage("")

    // Assignee is required for QRadar
    if (!assignee?.trim()) {
      setErrorMessage("Please assign the alert to a user before updating status")
      return
    }

    // For CLOSED status, closing reason is required
    if (status === "Closed" && !selectedClosingReason) {
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
                {QRADAR_ASSIGNEES.map((a) => (
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpdateStatus} disabled={isLoading}>
            {isLoading ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
