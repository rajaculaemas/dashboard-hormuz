"use client"

import { useState } from "react"
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
  const [severity, setSeverity] = useState("")
  const [status, setStatus] = useState("New")
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/cases/add-to-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertIds: alerts.map((a) => a._id || a.id).filter(Boolean),
          name: caseName,
          severity: severity || "Medium",
          status,
          comment,
          integrationId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create case")
      }

      // Reset form
      setCaseName("")
      setSeverity("")
      setStatus("New")
      setComment("")
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Alert{alerts.length > 1 ? "s" : ""} to Case</DialogTitle>
          <DialogDescription>
            Create a new case in Stellar Cyber{alerts.length > 1 ? ` for ${alerts.length} alerts` : ""}
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
          <div className="space-y-2">
            <Label htmlFor="case-name">Case Name *</Label>
            <Input
              id="case-name"
              placeholder="Enter case name"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <Select value={severity} onValueChange={setSeverity} disabled={loading}>
              <SelectTrigger id="severity">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Create Case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
