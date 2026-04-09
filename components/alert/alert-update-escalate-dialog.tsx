"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2 } from "lucide-react"

interface AlertUpdateEscalateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  integrationId?: string // "socfortress" | "qradar" | "wazuh" | "stellar"
  onUpdateSuccess?: () => void
  currentUser?: any
  // Status options per integration
  statusOptions?: string[]
  // Custom label for escalation
  escalationLabel?: string
}

interface L2Analyst {
  id: string
  name: string
  email: string
  telegramChatId?: string
}

export function AlertUpdateEscalateDialog({
  open,
  onOpenChange,
  alert,
  integrationId = "generic",
  onUpdateSuccess,
  currentUser,
  statusOptions = ["New", "In Progress", "Closed"],
  escalationLabel = "Escalate to L2 (requires analysis)",
}: AlertUpdateEscalateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [l2Analysts, setL2Analysts] = useState<L2Analyst[]>([])
  const [loadingAnalysts, setLoadingAnalysts] = useState(false)

  // Mode: update status or escalate
  const [actionMode, setActionMode] = useState<"update" | "escalate">("update")

  // Update mode fields
  const [status, setStatus] = useState(statusOptions[0])
  const [comment, setComment] = useState("")
  const [analysis, setAnalysis] = useState("")

  // Escalation fields
  const [escalateToL2, setEscalateToL2] = useState<string>("")
  const [escalationAnalysis, setEscalationAnalysis] = useState("")
  const [escalationError, setEscalationError] = useState<string>("")
  const [escalationChangeStatus, setEscalationChangeStatus] = useState(false)
  const [escalationNewStatus, setEscalationNewStatus] = useState("")

  // Fetch L2 analysts when dialog opens and escalation mode is selected
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

  // Validate escalation form
  const validateEscalation = (): boolean => {
    setEscalationError("")

    if (!escalateToL2?.trim()) {
      setEscalationError("Please select an L2 analyst")
      return false
    }

    if (!escalationAnalysis?.trim()) {
      setEscalationError("Analysis is required for escalation")
      return false
    }

    if (escalationAnalysis.length < 10) {
      setEscalationError("Analysis must be at least 10 characters long")
      return false
    }

    if (escalationChangeStatus && !escalationNewStatus?.trim()) {
      setEscalationError("Please select a new status if changing")
      return false
    }

    return true
  }

  // Handle escalation
  const handleEscalate = async () => {
    if (!validateEscalation()) {
      return
    }

    setIsLoading(true)
    try {
      const payload: any = {
        alertId: alert.id || alert._id,
        escalateToUserId: escalateToL2,
        analysis: escalationAnalysis,
      }

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
        "Failed to escalate: " + (error instanceof Error ? error.message : "Unknown error"),
      )
    } finally {
      setIsLoading(false)
    }
  }

  // Handle status update
  const handleUpdate = async () => {
    if (!status?.trim()) {
      return
    }

    setIsLoading(true)
    try {
      const endpoint =
        integrationId === "socfortress" ? "/api/alerts/update" : `/api/alerts/${alert.id || alert._id}/update`

      const payload: any = {
        status,
      }

      if (analysis?.trim()) {
        payload.analysis = analysis
      }

      if (comment?.trim()) {
        payload.comment = comment
      }

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error("Failed to update alert status")
      }

      console.log("[Dialog] Alert updated successfully")
      onOpenChange(false)
      onUpdateSuccess?.()
    } catch (error) {
      console.error("[Dialog] Error updating alert:", error)
      alert("Error: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (actionMode === "escalate") {
      await handleEscalate()
    } else {
      await handleUpdate()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alert Management</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mode Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Action Mode</CardTitle>
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
                    {escalationLabel}
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Update Mode */}
          {actionMode === "update" && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Analysis (Optional)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add your analysis or findings..."
                    value={analysis}
                    onChange={(e) => setAnalysis(e.target.value)}
                    className="min-h-[100px]"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Comment (Optional)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Add any comments..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="min-h-[80px]"
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {/* Escalation Mode */}
          {actionMode === "escalate" && (
            <div className="space-y-4">
              {escalationError && (
                <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{escalationError}</p>
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Select L2 Analyst</CardTitle>
                  <CardDescription>Choose who will handle this escalation</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={escalateToL2} onValueChange={setEscalateToL2} disabled={loadingAnalysts}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingAnalysts ? "Loading analysts..." : "Select L2 analyst..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {l2Analysts.map((analyst) => (
                        <SelectItem key={analyst.id} value={analyst.id}>
                          {analyst.name} ({analyst.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Analysis</CardTitle>
                  <CardDescription>Provide detailed analysis for the L2 analyst</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Provide your detailed analysis and findings that led to this escalation..."
                    value={escalationAnalysis}
                    onChange={(e) => setEscalationAnalysis(e.target.value)}
                    className="min-h-[150px]"
                  />
                </CardContent>
              </Card>

              <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                <Checkbox
                  id="change-status"
                  checked={escalationChangeStatus}
                  onCheckedChange={(checked) => setEscalationChangeStatus(checked as boolean)}
                />
                <Label htmlFor="change-status" className="cursor-pointer font-normal">
                  Also change alert status during escalation
                </Label>
              </div>

              {escalationChangeStatus && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">New Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={escalationNewStatus} onValueChange={setEscalationNewStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {actionMode === "escalate" ? "Escalate to L2" : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
