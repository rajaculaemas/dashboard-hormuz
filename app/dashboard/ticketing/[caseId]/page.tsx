"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Edit2, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SafeDate } from "@/components/ui/safe-date"
import { Skeleton } from "@/components/ui/skeleton"

interface WazuhCaseDetail {
  id: string
  status: string
  severity: string
  description?: string
  notes?: string
  alertCount: number
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  assignee?: {
    id: string
    name?: string
    email: string
  }
  alerts: Array<{
    id: string
    addedAt: string
    alert: any
  }>
}

export default function CaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const caseId = params.caseId as string

  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [caseDetail, setCaseDetail] = useState<WazuhCaseDetail | null>(null)
  
  // Edit states
  const [editStatus, setEditStatus] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [editAssigneeId, setEditAssigneeId] = useState("")

  useEffect(() => {
    loadCase()
    fetchUsers()
  }, [caseId])

  const loadCase = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/wazuh/cases/${caseId}`)
      if (!response.ok) {
        throw new Error("Failed to load case")
      }

      const data = await response.json()
      setCaseDetail(data)
      setEditStatus(data.status)
      setEditNotes(data.notes || "")
      setEditAssigneeId(data.assigneeId || "")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load case",
        variant: "destructive",
      })
      router.push("/dashboard/ticketing")
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users")
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      }
    } catch (error) {
      console.error("Failed to fetch users:", error)
    }
  }

  const handleUpdateCase = async () => {
    setUpdating(true)
    try {
      const response = await fetch(`/api/wazuh/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editStatus,
          assigneeId: editAssigneeId || null,
          notes: editNotes,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to update case")
      }

      const updated = await response.json()
      setCaseDetail(updated)
      setShowEditDialog(false)

      toast({
        title: "Success",
        description: "Case updated successfully",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update case",
        variant: "destructive",
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleDeleteCase = async () => {
    if (!confirm("Are you sure you want to delete this case?")) return

    try {
      const response = await fetch(`/api/wazuh/cases/${caseId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete case")
      }

      toast({
        title: "Success",
        description: "Case deleted successfully",
      })
      router.push("/dashboard/ticketing")
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete case",
        variant: "destructive",
      })
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "destructive"
      case "high":
        return "default"
      case "medium":
        return "secondary"
      default:
        return "outline"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
        return "secondary"
      case "in_progress":
        return "default"
      case "resolved":
        return "outline"
      default:
        return "secondary"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!caseDetail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
        <div className="max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Card className="mt-6">
            <CardContent className="pt-6 text-center text-muted-foreground">
              Case not found
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.back()} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Cases
          </Button>
          <div className="flex gap-2">
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Edit2 className="h-4 w-4" />
                  Edit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Edit Case</DialogTitle>
                  <DialogDescription>
                    Update case details and status
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="assignee">Assign to</Label>
                    <Select value={editAssigneeId} onValueChange={setEditAssigneeId}>
                      <SelectTrigger id="assignee">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Add notes..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleUpdateCase} disabled={updating}>
                    {updating ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              onClick={handleDeleteCase}
              variant="destructive"
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        {/* Case Header Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Case {caseDetail.id.slice(0, 8)}</CardTitle>
                <CardDescription>Created <SafeDate date={caseDetail.createdAt} /></CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant={getStatusColor(caseDetail.status)}>
                  {caseDetail.status === "in_progress" ? "In Progress" : caseDetail.status}
                </Badge>
                <Badge variant={getSeverityColor(caseDetail.severity)}>
                  {caseDetail.severity}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Alerts</p>
                <p className="text-2xl font-bold">{caseDetail.alertCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Severity</p>
                <p className="font-semibold">{caseDetail.severity}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assigned to</p>
                <p className="font-semibold">{caseDetail.assignee?.name || caseDetail.assignee?.email || "Unassigned"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-sm"><SafeDate date={caseDetail.updatedAt} /></p>
              </div>
            </div>

            {caseDetail.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Description</p>
                <p className="text-sm">{caseDetail.description}</p>
              </div>
            )}

            {caseDetail.notes && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{caseDetail.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Associated Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Associated Alerts ({caseDetail.alerts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {caseDetail.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts associated with this case</p>
            ) : (
              <div className="space-y-3">
                {caseDetail.alerts.map((item) => (
                  <Card key={item.id} className="bg-muted/50">
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Alert ID</p>
                          <p className="font-mono text-sm">{item.alert.externalId || item.alert.id.slice(0, 8)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Title</p>
                          <p className="text-sm font-medium">{item.alert.title}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Added</p>
                          <p className="text-sm"><SafeDate date={item.addedAt} /></p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
