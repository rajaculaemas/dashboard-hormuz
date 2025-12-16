"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangleIcon, UserIcon, SaveIcon, XIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CaseActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  case: any
  onUpdate: () => void
}

interface CaseUpdate {
  status?: string
  assignee?: string
  severity?: string
  comment?: string
}

export const ASSIGNEES = [
  { id: "unassigned", name: "Unassigned" },
  { id: "abimantara", name: "Abdi Bimantara" },
  { id: "ahafiz", name: "Habib" },
  { id: "ambarfitri", name: "Ambar" },
  { id: "araffly", name: "Rafly Cireng" },
  { id: "ariful", name: "Ariful" },
  { id: "asap", name: "Asap" },
  { id: "azamzami", name: "Ahmad Zaid Zam Zami" },
  { id: "bimarizki", name: "Bima" },
  { id: "fannisa", name: "Jawir" },
  { id: "fazzahrah", name: "Farah" },
  { id: "ffadhillah", name: "Fikri" },
  { id: "fnurelia", name: "Firda" },
  { id: "gandarizky", name: "Ganda" },
  { id: "haikalrahman", name: "Haikal" },
  { id: "hnurjannah", name: "Habil dan Qabil" },
  { id: "mtaufik", name: "Taufik" },
  { id: "radhitia", name: "Raihan" },
  { id: "shizbullah", name: "Said Bajaj Bajuri" },
]

// When dealing with QRadar integrations, only a small set of usernames
// are valid on the QRadar side. Use these ids when updating QRadar offenses.
export const QRADAR_ASSIGNEES = [
  { id: "unassigned", name: "Unassigned" },
  { id: "admin", name: "Administrator" },
  { id: "sakti", name: "Sakti" },
  { id: "soc_analyst", name: "SOC Analyst" },
  { id: "soc247", name: "SOC247" },
  { id: "socntt", name: "SOCNTT" },
]

const STATUSES = [
  { value: "Open", label: "Open", color: "destructive" },
  { value: "In Progress", label: "In Progress", color: "default" },
  { value: "Resolved", label: "Resolved", color: "secondary" },
  { value: "Closed", label: "Closed", color: "outline" },
  { value: "Cancelled", label: "Cancelled", color: "outline" },
]

const SEVERITIES = [
  { value: "Critical", label: "Critical", color: "destructive" },
  { value: "High", label: "High", color: "destructive" },
  { value: "Medium", label: "Medium", color: "default" },
  { value: "Low", label: "Low", color: "secondary" },
]

export function CaseActionDialog({ open, onOpenChange, case: caseData, onUpdate }: CaseActionDialogProps) {
  const [updates, setUpdates] = useState<CaseUpdate>({})
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [closingReasons, setClosingReasons] = useState<Array<{ id: number; text: string }>>([])
  const [selectedClosingReason, setSelectedClosingReason] = useState<number | null>(null)
  const [appUsers, setAppUsers] = useState<Array<{ id: string; name: string }>>([])
  const { toast } = useToast()

  useEffect(() => {
    if (open && caseData) {
      console.log("[CaseActionDialog] Received caseData:", caseData)
      console.log("[CaseActionDialog] Integration source:", caseData.integration?.source)
      // Reset form when dialog opens
      setUpdates({})
      setComment("")
      setSelectedClosingReason(null)

      // If this is a Wazuh ticket, fetch app users
      if (caseData.integration?.source === "wazuh" || caseData.integration?.name?.toLowerCase().includes("wazuh")) {
        console.log("[CaseActionDialog] Wazuh case detected, fetching app users")
        ;(async () => {
          try {
            const resp = await fetch("/api/users")
            const data = await resp.json()
            console.log("[CaseActionDialog] App users response:", data)
            if (data.success && Array.isArray(data.users)) {
              setAppUsers(data.users)
            } else if (Array.isArray(data)) {
              setAppUsers(data)
            }
          } catch (err) {
            console.error("[CaseActionDialog] Failed to fetch app users:", err)
          }
        })()
      } else if (caseData.integration?.source === "qradar") {
        console.log("[CaseActionDialog] QRadar case detected, fetching closing reasons")
        console.log("[CaseActionDialog] caseData.integrationId:", caseData.integrationId)
        console.log("[CaseActionDialog] caseData.integration?.id:", caseData.integration?.id)
        ;(async () => {
          try {
            const integId = caseData.integrationId || caseData.integration?.id
            if (!integId) {
              console.error("[CaseActionDialog] No integration ID found!")
              return
            }
            const url = `/api/qradar/closing-reasons?integrationId=${integId}`
            console.log("[CaseActionDialog] Fetching from URL:", url)
            const resp = await fetch(url)
            console.log("[CaseActionDialog] Response status:", resp.status)
            const data = await resp.json()
            console.log("[CaseActionDialog] Closing reasons response:", data)
            if (data.success) {
              setClosingReasons(data.reasons || [])
              console.log("[CaseActionDialog] Loaded closing reasons:", data.reasons)
            } else {
              console.error("[CaseActionDialog] Failed to fetch closing reasons:", data.error)
            }
          } catch (err) {
            console.error("[CaseActionDialog] Failed to fetch QRadar closing reasons:", err)
          }
        })()
      }
    }
  }, [open, caseData])

  const handleUpdate = async () => {
    if (!caseData) return

    // Check if there are any changes
    const hasChanges = Object.keys(updates).length > 0 || comment.trim()

    if (!hasChanges) {
      toast({
        title: "No Changes",
        description: "Please make at least one change before updating.",
        variant: "destructive",
      })
      return
    }

    // For QRadar Closed status, closing reason is REQUIRED
    if (caseData.integration?.source === "qradar" && updates.status === "Closed" && !selectedClosingReason) {
      toast({
        title: "Closing Reason Required",
        description: "Please select a closing reason before closing the offense.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const updateData: any = {
        ...updates,
        comment: comment.trim() || undefined,
      }

      // Include integration source info for backend routing
      console.log("[handleUpdate] caseData.integration:", caseData.integration)
      console.log("[handleUpdate] caseData.integration?.source:", caseData.integration?.source)
      
      if (caseData.integration?.source) {
        updateData.integrationSource = caseData.integration.source
        console.log("[handleUpdate] Added integrationSource:", updateData.integrationSource)
      }

      if (caseData.integration?.source === "qradar" && updates.status === "Closed" && selectedClosingReason) {
        updateData.closingReasonId = selectedClosingReason
      }

      let response
      let data

      if (caseData.integration?.source === "qradar") {
        // For QRadar, update the underlying alert via the alerts PATCH endpoint
        const body: any = {
          status: updates.status || caseData.status,
          comments: updateData.comment,
          isQRadar: true,
        }

        if (updates.assignee) {
          body.assignedTo = updates.assignee
        }

        if (updates.status === "Closed" && selectedClosingReason) {
          body.closingReasonId = selectedClosingReason
        }

        response = await fetch(`/api/alerts/${caseData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        data = await response.json()

        if (data.success) {
          toast({ title: "Alert Updated", description: "The QRadar alert was updated." })
          onUpdate()
          onOpenChange(false)
        } else {
          toast({ title: "Update Failed", description: data.error || "Failed to update alert", variant: "destructive" })
        }
      } else {
        response = await fetch(`/api/cases/${caseData.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        })

        data = await response.json()

        if (data.success) {
          toast({ title: "Case Updated", description: "The case has been successfully updated." })
          onUpdate()
          onOpenChange(false)
        } else {
          toast({ title: "Update Failed", description: data.error || "Failed to update case", variant: "destructive" })
        }
      }
    } catch (error) {
      console.error("Error updating case:", error)
      console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace")
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "An error occurred while updating the case",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getChangeSummary = () => {
    const changes: string[] = []

    if (updates.status && updates.status !== caseData?.status) {
      changes.push(`Status: ${caseData?.status} ? ${updates.status}`)
    }

    if (updates.assignee && updates.assignee !== caseData?.assignee) {
      const oldAssignee = ASSIGNEES.find((a) => a.id === caseData?.assignee)?.name || "Unassigned"
      const newAssignee = ASSIGNEES.find((a) => a.id === updates.assignee)?.name || "Unassigned"
      changes.push(`Assignee: ${oldAssignee} ? ${newAssignee}`)
    }

    if (updates.severity && updates.severity !== caseData?.severity) {
      changes.push(`Severity: ${caseData?.severity} ? ${updates.severity}`)
    }

    return changes
  }

  const getSeverityColor = (severity: string) => {
    const severityObj = SEVERITIES.find((s) => s.value === severity)
    return severityObj?.color || "outline"
  }

  const getStatusColor = (status: string) => {
    const statusObj = STATUSES.find((s) => s.value === status)
    return statusObj?.color || "outline"
  }

  if (!caseData) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5" />
            Update Case
            <Badge variant="outline" className="ml-2">
              #{caseData.ticketId}
            </Badge>
          </DialogTitle>
          <DialogDescription>Make changes to the case and add comments</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Case Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current Case Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`grid gap-4 ${caseData.integration?.source === "qradar" ? "grid-cols-2" : "grid-cols-3"}`}>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                  <Badge variant={getStatusColor(caseData.status)} className="mt-1">
                    {caseData.status}
                  </Badge>
                </div>
                {caseData.integration?.source !== "qradar" && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Severity</Label>
                    <Badge variant={getSeverityColor(caseData.severity)} className="mt-1">
                      {caseData.severity}
                    </Badge>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Assignee</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{caseData.assigneeName || caseData.assignee || "Unassigned"}</span>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Case Name</Label>
                <p className="text-sm mt-1">{caseData.name}</p>
              </div>
            </CardContent>
          </Card>

          {/* Update Form */}
          <div className="space-y-4">
            <div className={`grid gap-4 ${caseData.integration?.source === "qradar" ? "grid-cols-2" : "grid-cols-3"}`}>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={updates.status || ""}
                  onValueChange={(value) => setUpdates({ ...updates, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {(caseData.integration?.source === "qradar" ? [{ value: "Closed", label: "Closed" }] : STATUSES).map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {caseData.integration?.source !== "qradar" && (
                <div className="space-y-2">
                  <Label htmlFor="severity">Severity</Label>
                  <Select
                    value={updates.severity || ""}
                    onValueChange={(value) => setUpdates({ ...updates, severity: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((severity) => (
                        <SelectItem key={severity.value} value={severity.value}>
                          {severity.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="assignee">Assignee</Label>
                <Select
                  value={updates.assignee || ""}
                  onValueChange={(value) => setUpdates({ ...updates, assignee: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      caseData.integration?.source === "qradar" ? QRADAR_ASSIGNEES : 
                      (caseData.integration?.source === "wazuh" || caseData.integration?.name?.toLowerCase().includes("wazuh")) && appUsers.length > 0
                        ? appUsers
                        : ASSIGNEES
                    ).map((assignee) => (
                      <SelectItem key={assignee.id} value={assignee.id}>
                        {assignee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comment</Label>
              <Textarea
                id="comment"
                placeholder="Add a comment about this update..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            {caseData.integration?.source === "qradar" && updates.status === "Closed" && (
              <div className="space-y-2">
                <Label htmlFor="closingReason">Closing Reason</Label>
                <Select value={selectedClosingReason?.toString() || ""} onValueChange={(v) => setSelectedClosingReason(Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select closing reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {closingReasons.map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>
                        ID: {r.id} - {r.text}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Changes Summary */}
          {getChangeSummary().length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Changes Summary</CardTitle>
                <CardDescription>The following changes will be applied</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getChangeSummary().map((change, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm">{change}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            <XIcon className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleUpdate} disabled={loading}>
            <SaveIcon className="h-4 w-4 mr-2" />
            {loading ? "Updating..." : "Update Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
