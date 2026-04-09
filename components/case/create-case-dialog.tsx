"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { SOCFORTRESS_USERS, ALERT_SEVERITIES } from "@/lib/constants/socfortress"
import { AlertCircle, CheckCircle } from "lucide-react"

interface CreateCaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedAlerts: any[]
  onSuccess?: () => void
}

export function CreateCaseDialog({ open, onOpenChange, selectedAlerts, onSuccess }: CreateCaseDialogProps) {
  const [caseName, setCaseName] = useState("")
  const [caseDescription, setCaseDescription] = useState("")
  const [assignedTo, setAssignedTo] = useState<string>("unassigned")
  const [severity, setSeverity] = useState<string>("Low")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Get unique customer codes from selected alerts
  const customerCodes = [...new Set(selectedAlerts.map((a: any) => a.metadata?.customer_code || a.customer_code))]
  const customerCode = customerCodes.length === 1 ? customerCodes[0] : ""

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!caseName.trim()) {
      setError("Case name is required")
      return
    }

    if (!caseDescription.trim()) {
      setError("Case description is required")
      return
    }

    if (!customerCode) {
      setError("Could not determine customer code from selected alerts")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const alertIds = selectedAlerts.map((a: any) => a.externalId || a.id)

      const response = await fetch("/api/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caseName,
          caseDescription,
          customerCode,
          assignedTo: assignedTo === "unassigned" ? null : assignedTo,
          severity,
          alertIds,
          integrationSource: "socfortress",
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create case")
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        onOpenChange(false)
        setCaseName("")
        setCaseDescription("")
        setAssignedTo("unassigned")
        setSeverity("Low")
        if (onSuccess) {
          onSuccess()
        }
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-semibold">Case Created Successfully</p>
            <p className="text-sm text-muted-foreground mt-2">"{caseName}"</p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Case</DialogTitle>
          <DialogDescription>
            Create a new case and link {selectedAlerts.length} selected alert{selectedAlerts.length !== 1 ? "s" : ""} to it
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Alert Summary */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="text-sm font-semibold mb-2">Selected Alerts</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Count: {selectedAlerts.length} alert{selectedAlerts.length !== 1 ? "s" : ""}</p>
              <p>Customer: {customerCode || "Mixed/Unknown"}</p>
              {customerCodes.length > 1 && (
                <p className="text-amber-600 text-xs mt-2">⚠️ Warning: Selected alerts are from different customers</p>
              )}
            </div>
          </div>

          {/* Case Name */}
          <div className="space-y-2">
            <Label htmlFor="case-name">Case Name *</Label>
            <Input
              id="case-name"
              placeholder="e.g., Suspicious Login Activity Investigation"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Case Description */}
          <div className="space-y-2">
            <Label htmlFor="case-description">Description *</Label>
            <Textarea
              id="case-description"
              placeholder="Detailed description of the case and investigation scope..."
              value={caseDescription}
              onChange={(e) => setCaseDescription(e.target.value)}
              disabled={isLoading}
              rows={4}
            />
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label htmlFor="severity">Severity</Label>
            <Select value={severity} onValueChange={setSeverity} disabled={isLoading}>
              <SelectTrigger id="severity">
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
          </div>

          {/* Assign To */}
          <div className="space-y-2">
            <Label htmlFor="assign-to">Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={isLoading}>
              <SelectTrigger id="assign-to">
                <SelectValue />
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
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !caseName.trim() || !caseDescription.trim()}
            >
              {isLoading ? "Creating..." : "Create Case"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
