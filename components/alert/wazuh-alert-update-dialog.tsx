"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle } from "lucide-react"

interface WazuhAlertUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  appUsers?: any[]
  onUpdateSuccess?: () => void
  onLoadAlerts?: () => void
}

export function WazuhAlertUpdateDialog({
  open,
  onOpenChange,
  alert,
  appUsers = [],
  onUpdateSuccess,
  onLoadAlerts,
}: WazuhAlertUpdateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState("New")
  const [severity, setSeverity] = useState("")
  const [assignee, setAssignee] = useState("")
  const [comments, setComments] = useState("")
  const [severityBasedOnAnalysis, setSeverityBasedOnAnalysis] = useState<string | null>(null)
  const [analysisNotes, setAnalysisNotes] = useState("")
  const [errorMessage, setErrorMessage] = useState("")

  if (!open || !alert) return null

  const handleUpdateStatus = async () => {
    setErrorMessage("")

    try {
      setIsLoading(true)

      const body: any = {
        status,
        comments,
      }

      // Include severity if selected
      if (severity?.trim()) {
        body.severity = severity
      }

      // Include assignee if selected
      if (assignee?.trim()) {
        body.assignedTo = assignee
      }

      // Add custom analysis fields
      if (severityBasedOnAnalysis) {
        body.severityBasedOnAnalysis = severityBasedOnAnalysis
      }
      if (analysisNotes?.trim()) {
        body.analysisNotes = analysisNotes
      }

      const response = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        console.log("[Wazuh Dialog] Alert status updated successfully")

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
        setSeverity("")
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
      console.error("[Wazuh Dialog] Error updating alert:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to update alert")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Wazuh Alert</DialogTitle>
          <DialogDescription>Update the status and analysis for this Wazuh alert</DialogDescription>
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
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Ignored">Ignored</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <div className="flex gap-2">
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger id="severity" className="flex-1">
                  <SelectValue placeholder="Select severity (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              {severity && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSeverity("")}
                  className="px-3"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Assign To */}
          <div className="space-y-2">
            <Label htmlFor="assignee">Assign To</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="assignee">
                <SelectValue placeholder="Select user (optional)" />
              </SelectTrigger>
              <SelectContent>
                {appUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
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
