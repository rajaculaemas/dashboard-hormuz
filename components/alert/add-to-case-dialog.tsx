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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, AlertTriangle } from "lucide-react"
import { SOCFORTRESS_USERS, ALERT_SEVERITIES } from "@/lib/constants/socfortress"
import type { StellarCyberAlert } from "@/lib/config/stellar-cyber"

interface AddToCaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alerts: StellarCyberAlert[] | null
  integrationId?: string
  onSuccess?: () => void
}

const SEVERITY_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
  { value: "Critical", label: "Critical" },
]

const STATUS_OPTIONS = [
  { value: "New", label: "New" },
  { value: "In Progress", label: "In Progress" },
  { value: "Ignored", label: "Ignored" },
  { value: "Closed", label: "Closed" },
]

export function AddToCaseDialog({ open, onOpenChange, alerts, integrationId, onSuccess }: AddToCaseDialogProps) {
  const [caseName, setCaseName] = useState("")
  const [caseDescription, setCaseDescription] = useState("")
  const [severity, setSeverity] = useState("")
  const [status, setStatus] = useState("New")
  const [comment, setComment] = useState("")
  const [assignedTo, setAssignedTo] = useState("unassigned")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stellarUsers, setStellarUsers] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Detect if alerts are from Socfortress or Stellar Cyber
  const isSocfortress = alerts?.some((a: any) => 
    a.source === "socfortress" || a.source === "copilot" || 
    a.integration?.source?.toLowerCase() === "socfortress" || 
    a.integration?.source?.toLowerCase() === "copilot" || 
    a.metadata?.socfortress || a.metadata?.copilot
  ) || false
  
  const isStellarCyber = alerts?.some((a: any) => 
    a.source === "stellar_cyber" || a.metadata?.stellar_cyber || 
    a.integration?.source?.toLowerCase() === "stellar-cyber"
  ) || false

  // Get customer code for Socfortress
  const customerCodes = alerts ? [...new Set(alerts.map((a: any) => a.metadata?.customer_code || a.customer_code))] : []
  const customerCode = customerCodes.length === 1 ? customerCodes[0] : ""

  // Fetch users when dialog opens
  useEffect(() => {
    if (open && integrationId) {
      if (isStellarCyber) {
        console.log("[Add to Case] Fetching Stellar Cyber users...")
        fetchStellarUsers()
      } else if (isSocfortress) {
        console.log("[Add to Case] Using Socfortress users")
        setLoadingUsers(false)
      }
    }
  }, [open, integrationId, isStellarCyber, isSocfortress])

  const fetchStellarUsers = async () => {
    try {
      setLoadingUsers(true)
      const response = await fetch(`/api/stellar-cyber/users?integrationId=${integrationId}`)
      const data = await response.json()
      
      if (data.success) {
        console.log(`[Add to Case] Fetched ${data.count} Stellar users`)
        setStellarUsers(data.users || [])
      } else {
        console.error("[Add to Case] Failed to fetch users:", data.error)
        setStellarUsers([])
      }
    } catch (error) {
      console.error("[Add to Case] Error fetching Stellar users:", error)
      setStellarUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }

  // Auto-populate case name from first alert
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && alerts && alerts.length > 0 && !caseName) {
      const firstAlert = alerts[0]
      setCaseName(`Case for ${firstAlert.title || firstAlert.event_name || "Alert"}`)
      if (!severity && firstAlert.severity) {
        setSeverity(firstAlert.severity)
      }
    }
    onOpenChange(newOpen)
  }

  const handleSubmit = async () => {
    if (!alerts || alerts.length === 0 || !caseName.trim()) {
      setError("Please enter a case name")
      return
    }

    // For Socfortress, require description
    if (isSocfortress && !caseDescription.trim()) {
      setError("Description is required for Socfortress cases")
      return
    }

    // For Socfortress, require customer code
    if (isSocfortress && !customerCode) {
      setError("Could not determine customer code from selected alerts")
      return
    }

    setLoading(true)
    setError(null)

    const resolvedAssignedTo = assignedTo === "unassigned" ? undefined : assignedTo

    try {
      // Socfortress case creation
      if (isSocfortress) {
        const alertIds = alerts.map((a: any) => a.externalId || a.id).filter(Boolean)
        const response = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseName,
            caseDescription,
            customerCode,
            assignedTo: resolvedAssignedTo,
            severity: severity || "Low",
            alertIds,
            integrationSource: "socfortress",
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || "Failed to create case")
        }
      } else {
        // Stellar Cyber case creation
        const response = await fetch("/api/cases/add-to-case", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alertIds: alerts.map((a) => a._id || a.id).filter(Boolean),
            name: caseName,
            severity: severity || "Medium",
            status,
            comment,
            assignedTo: resolvedAssignedTo,
            integrationId,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || "Failed to create case")
        }
      }

      // Reset form
      setCaseName("")
      setCaseDescription("")
      setSeverity("")
      setStatus("New")
      setComment("")
      setAssignedTo("unassigned")
      onOpenChange(false)

      // Call success callback
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create case")
    } finally {
      setLoading(false)
    }
  }

  if (!alerts || alerts.length === 0) return null

  const firstAlert = alerts[0]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={isSocfortress ? "max-w-2xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>Add Alert{alerts.length > 1 ? "s" : ""} to Case</DialogTitle>
          <DialogDescription>
            Create a new case in {isSocfortress ? "SOCFortress" : "Stellar Cyber"}{alerts.length > 1 ? ` for ${alerts.length} alerts` : ""}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive text-sm p-3 rounded-md flex gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {alerts.length > 1 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 rounded-md flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Multiple Alerts Selected</p>
              <p className="text-xs mt-1">{alerts.length} alerts will be added to this case</p>
            </div>
          </div>
        )}

        <div className="space-y-4 py-4">
          {/* Alert Summary - Socfortress only */}
          {isSocfortress && (
            <div className="bg-muted p-4 rounded-lg space-y-1">
              <h4 className="text-sm font-semibold mb-2">Selected Alerts</h4>
              <p className="text-sm text-muted-foreground">Count: {alerts.length} alert{alerts.length !== 1 ? "s" : ""}</p>
              <p className="text-sm text-muted-foreground">Customer: {customerCode || "Mixed/Unknown"}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="case-name">Case Name *</Label>
            <Input
              id="case-name"
              placeholder={isSocfortress ? "e.g., Suspicious Login Activity Investigation" : "Enter case name"}
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Description - Socfortress only */}
          {isSocfortress && (
            <div className="space-y-2">
              <Label htmlFor="case-description">Description *</Label>
              <Textarea
                id="case-description"
                placeholder="Detailed description of the case and investigation scope..."
                value={caseDescription}
                onChange={(e) => setCaseDescription(e.target.value)}
                disabled={loading}
                rows={4}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <Select value={severity} onValueChange={setSeverity} disabled={loading}>
              <SelectTrigger id="severity">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {(isSocfortress ? ALERT_SEVERITIES : SEVERITY_OPTIONS).map((opt: any) => (
                  <SelectItem key={opt.value || opt} value={opt.value || opt}>
                    {opt.label || opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status - Stellar Cyber only */}
          {!isSocfortress && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus} disabled={loading}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Comment - Stellar Cyber only */}
          {!isSocfortress && (
            <div className="space-y-2">
              <Label htmlFor="comment">Comment (Optional)</Label>
              <Textarea
                id="comment"
                placeholder="Add a comment about this case..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={loading}
                className="h-20"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="assignee">Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={loading || loadingUsers}>
              <SelectTrigger id="assignee">
                <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select user (optional)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {isSocfortress ? (
                  SOCFORTRESS_USERS.map((user) => (
                    <SelectItem key={user.id} value={user.username}>
                      {user.username}
                    </SelectItem>
                  ))
                ) : stellarUsers.length > 0 ? (
                  stellarUsers.map((user) => (
                    <SelectItem key={user.id} value={user.name}>
                      {user.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {loadingUsers ? "Loading..." : "No users available"}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground bg-secondary/20 p-2 rounded space-y-1">
            <p className="font-semibold">Alert{alerts.length > 1 ? "s" : ""} Summary:</p>
            <p>Count: {alerts.length}</p>
            <p>Title: {firstAlert?.title || firstAlert?.event_name || "N/A"}</p>
            <p>Severity: {firstAlert?.severity || "N/A"}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !caseName.trim() || (isSocfortress && !caseDescription.trim())}>
            {loading ? "Creating..." : "Create Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
