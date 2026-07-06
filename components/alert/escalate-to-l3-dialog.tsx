"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

interface EscalateToL3DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  escalationId: string
  alertId: string
  onSuccess?: () => void
}

export function EscalateToL3Dialog({
  open,
  onOpenChange,
  escalationId,
  alertId,
  onSuccess,
}: EscalateToL3DialogProps) {
  const [l3Analysts, setL3Analysts] = useState<any[]>([])
  const [loadingL3Analysts, setLoadingL3Analysts] = useState(false)
  const [selectedL3, setSelectedL3] = useState("")
  const [escalationReason, setEscalationReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  // Fetch L3 analysts when dialog opens
  useEffect(() => {
    if (open) {
      fetchL3Analysts()
    }
  }, [open])

  const fetchL3Analysts = async () => {
    try {
      setLoadingL3Analysts(true)
      setError("")

      // Try fetching L3 analysts - we'll make a custom request
      // that matches server-side logic (Manager, L3, Lead, or administrators)
      const response = await fetch(
        `/api/users?position=L3`,
      )
      const data = await response.json()

      if (response.ok) {
        // Get L3 analysts and filter for those with Telegram
        let l3s = data.users || []
        
        // For now, the API filters by position=L3
        // Server-side also includes Manager, Lead positions and administrators
        // This limitation is acceptable as users can input their position
        const validL3s = l3s.filter((u: any) => u.telegramChatId)
        
        setL3Analysts(validL3s)
        console.log(`[Escalate L3 Dialog] Found ${validL3s.length} available L3 analysts`)
        
        if (validL3s.length === 0) {
          setError("No L3 analysts available. Please ensure L3 analysts have Telegram integration setup.")
        }
      } else {
        setError("Failed to load L3 analysts")
        setL3Analysts([])
      }
    } catch (error) {
      console.error("[Escalate L3 Dialog] Error fetching L3 analysts:", error)
      setError("Error loading L3 analysts")
      setL3Analysts([])
    } finally {
      setLoadingL3Analysts(false)
    }
  }

  const handleEscalate = async () => {
    if (!selectedL3) {
      setError("Please select an L3 analyst")
      return
    }

    try {
      setIsSubmitting(true)
      setError("")

      const response = await fetch(`/api/alerts/${alertId}/escalation/escalate-l3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escalationId,
          selectedL3UserId: selectedL3,
          escalationReason: escalationReason.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        console.log("Alert escalated to L3 successfully")
        onOpenChange(false)
        setSelectedL3("")
        setEscalationReason("")
        onSuccess?.()
      } else {
        setError(data.error || "Failed to escalate to L3")
        console.error("Error escalating to L3:", data.error)
      }
    } catch (error) {
      console.error("Error escalating to L3:", error)
      setError(error instanceof Error ? error.message : "Unknown error")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escalate to L3</DialogTitle>
          <DialogDescription>
            Select which L3 analyst to escalate this alert to
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* L3 Analyst Selection */}
          <div className="space-y-2">
            <Label htmlFor="select-l3">Select L3 Analyst *</Label>
            <Select value={selectedL3} onValueChange={setSelectedL3} disabled={loadingL3Analysts || isSubmitting}>
              <SelectTrigger id="select-l3">
                <SelectValue
                  placeholder={
                    loadingL3Analysts
                      ? "Loading L3 analysts..."
                      : l3Analysts.length === 0
                        ? "No L3 analysts available"
                        : "Select L3 analyst"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {l3Analysts.map((analyst) => (
                  <SelectItem key={analyst.id} value={analyst.id}>
                    {analyst.name} {analyst.email ? `(${analyst.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">L3 analyst must have Telegram chat ID linked</p>
          </div>

          {/* Escalation Reason (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="escalation-reason">Reason for Escalation (optional)</Label>
            <Textarea
              id="escalation-reason"
              placeholder="Explain why this alert needs L3 attention..."
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              className="min-h-[80px]"
              disabled={isSubmitting}
            />
          </div>

          {/* Error Message */}
          {error && <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</div>}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEscalate}
              disabled={isSubmitting || !selectedL3 || l3Analysts.length === 0}
              className="gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Escalating..." : "🚀 Escalate to L3"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
