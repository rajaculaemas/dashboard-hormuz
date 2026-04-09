"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RefreshCwIcon } from "lucide-react"
import { SOCFORTRESS_USERS, ALERT_SEVERITIES } from "@/lib/constants/socfortress"

interface SocfortressCaseUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  case: any
  onUpdateSuccess?: () => void
}

export function SocfortressCaseUpdateDialog({
  open,
  onOpenChange,
  case: caseData,
  onUpdateSuccess,
}: SocfortressCaseUpdateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  
  // Map statuses (DB format to UI format)
  const statusMap: Record<string, string> = {
    "OPEN": "New",
    "IN_PROGRESS": "In Progress",
    "CLOSED": "Closed",
  }

  // Initialize with proper status mapping
  const currentDbStatus = caseData?.metadata?.socfortress?.status || caseData?.status || "OPEN"
  const currentUiStatus = statusMap[currentDbStatus] || "New"

  const [status, setStatus] = useState(currentUiStatus)
  const [severity, setSeverity] = useState(caseData?.metadata?.socfortress?.severity || caseData?.severity || "Medium")
  const [assignedTo, setAssignedTo] = useState(caseData?.metadata?.socfortress?.assigned_to || caseData?.assignee || "unassigned")
  const [comment, setComment] = useState("")

  const handleSubmit = async () => {
    if (!caseData?.id) {
      console.error("Case ID missing")
      return
    }

    setIsLoading(true)
    try {
      const payload = {
        status: status, // Send UI format directly (New, In Progress, Closed)
        severity,
        assignee: assignedTo === "unassigned" ? null : assignedTo,
        comment: comment || undefined,
        integrationSource: "socfortress",
      }

      console.log("[Case Dialog] Submitting case update:", payload)

      const response = await fetch(`/api/cases/${caseData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to update case")
      }

      console.log("[Case Dialog] Case updated successfully")
      onOpenChange(false)
      onUpdateSuccess?.()
    } catch (error) {
      console.error("[Case Dialog] Error updating case:", error)
      window.alert("Failed to update case: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsLoading(false)
    }
  }

  if (!caseData) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Case: {caseData.name || caseData.title}</DialogTitle>
          <DialogDescription>
            ID: {caseData.externalId || caseData.id} • Source: {caseData.integration?.name || "SOCFortress"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                  <SelectItem value="New">New</SelectItem>
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

          {/* Comment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Add Comment</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add a comment about this case..."
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
                <span className="font-medium">Current Status:</span> {statusMap[caseData.status] || caseData.status}
              </div>
              <div>
                <span className="font-medium">Current Severity:</span> {caseData.severity || "Not Set"}
              </div>
              <div>
                <span className="font-medium">Current Assignee:</span>{" "}
                {caseData.metadata?.socfortress?.assigned_to || caseData.assignee || "Unassigned"}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? "Updating..." : "Update Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
