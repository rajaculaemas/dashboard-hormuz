"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, X } from "lucide-react"
import { ASSIGNEES } from "@/components/case/case-action-dialog"

interface StellarCyberAlertUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alert: any
  userId?: string
  onUpdateSuccess?: () => void
  onLoadAlerts?: () => void
}

export function StellarCyberAlertUpdateDialog({
  open,
  onOpenChange,
  alert,
  userId,
  onUpdateSuccess,
  onLoadAlerts,
}: StellarCyberAlertUpdateDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState("New")
  const [severity, setSeverity] = useState("")
  const [assignee, setAssignee] = useState("")
  const [comments, setComments] = useState("")
  const [severityBasedOnAnalysis, setSeverityBasedOnAnalysis] = useState<string | null>(null)
  const [analysisNotes, setAnalysisNotes] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([])
  const [tagsToDelete, setTagsToDelete] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [tagMode, setTagMode] = useState<"add" | "delete">("add")
  const [hasJwtKey, setHasJwtKey] = useState<boolean | null>(null)
  const [checkingJwt, setCheckingJwt] = useState(false)
  const [recheckAttempts, setRecheckAttempts] = useState(0)
  const MAX_RECHECK_ATTEMPTS = 30 // Max 30 checks = up to 30 seconds of rechecking

  // Check if user has JWT API key when dialog opens or when it becomes visible
  useEffect(() => {
    if (open && userId) {
      console.log("[Stellar Dialog] Dialog opened, resetting recheck attempts")
      setRecheckAttempts(0)
      checkJwtApiKey()
    }
  }, [open, userId])

  // Recheck JWT key every 1 second if not found, up to max attempts
  // This helps catch cases where user just added it in profile and returned
  useEffect(() => {
    if (!open || !userId || hasJwtKey === true) return
    if (recheckAttempts >= MAX_RECHECK_ATTEMPTS) {
      console.log("[Stellar Dialog] Reached max recheck attempts, stopping")
      return
    }

    const interval = setInterval(() => {
      setRecheckAttempts(prev => prev + 1)
      console.log(`[Stellar Dialog] Rechecking JWT API key (attempt ${recheckAttempts + 1}/${MAX_RECHECK_ATTEMPTS})...`)
      checkJwtApiKey()
    }, 1000) // Check more frequently every 1 second

    return () => clearInterval(interval)
  }, [open, userId, hasJwtKey, recheckAttempts])

  const checkJwtApiKey = async () => {
    try {
      setCheckingJwt(true)
      console.log("[Stellar Dialog] Checking JWT key for current user")
      const endpoint = `/api/users/me/stellar-key`
      console.log(`[Stellar Dialog] Calling endpoint: ${endpoint}`)
      
      const response = await fetch(endpoint, {
        credentials: 'include', // Send auth cookie with request
      })
      const data = await response.json()
      
      console.log(`[Stellar Dialog] JWT check response:`, {
        status: response.status,
        ok: response.ok,
        hasApiKey: data.hasApiKey,
        message: data.message,
        error: data.error,
        fullBody: JSON.stringify(data),
      })
      
      if (response.ok) {
        setHasJwtKey(!!data.hasApiKey)
        if (data.hasApiKey) {
          console.log("[Stellar Dialog] ✓ JWT key found! Form will be enabled.")
        } else {
          console.log("[Stellar Dialog] ✗ JWT key NOT found. Showing popup.")
        }
      } else {
        console.error(`[Stellar Dialog] Request failed with status ${response.status}:`, data)
        setHasJwtKey(false)
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error checking JWT API key:", error)
      setHasJwtKey(false)
    } finally {
      setCheckingJwt(false)
    }
  }

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

      // NOTE: Stellar Cyber API does NOT support assignee field
      // Only include assignee for integrations that support it (Socfortress, QRadar)
      // Do NOT send assignedTo for Stellar Cyber updates

      // Add custom analysis fields
      if (severityBasedOnAnalysis) {
        body.severityBasedOnAnalysis = severityBasedOnAnalysis
      }
      if (analysisNotes?.trim()) {
        body.analysisNotes = analysisNotes
      }

      // Include tags to add/delete
      if (tagsToAdd.length > 0) {
        body.tagsToAdd = tagsToAdd
      }
      if (tagsToDelete.length > 0) {
        body.tagsToDelete = tagsToDelete
      }

      // Include userId for per-user API key usage
      if (userId) {
        body.userId = userId
      }

      const response = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        console.log("[Stellar Cyber Dialog] Alert status updated successfully")

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
        setTagsToAdd([])
        setTagsToDelete([])
        setNewTag("")
        onOpenChange(false)
        onUpdateSuccess?.()
      } else {
        throw new Error("Failed to update alert")
      }
    } catch (error) {
      console.error("[Stellar Cyber Dialog] Error updating alert:", error)
      setErrorMessage(error instanceof Error ? error.message : "Failed to update alert")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddTag = () => {
    const trimmedTag = newTag?.trim()
    if (trimmedTag) {
      if (tagMode === "add") {
        if (!tagsToAdd.includes(trimmedTag)) {
          setTagsToAdd([...tagsToAdd, trimmedTag])
        }
      } else {
        if (!tagsToDelete.includes(trimmedTag)) {
          setTagsToDelete([...tagsToDelete, trimmedTag])
        }
      }
      setNewTag("")
    }
  }

  const handleRemoveTag = (tag: string, mode: "add" | "delete") => {
    if (mode === "add") {
      setTagsToAdd(tagsToAdd.filter((t) => t !== tag))
    } else {
      setTagsToDelete(tagsToDelete.filter((t) => t !== tag))
    }
  }

  const handleVerifyAgain = () => {
    console.log("[Stellar Dialog] User clicked 'Verify Again' - rechecking JWT...")
    setHasJwtKey(null)
    setRecheckAttempts(0) // Reset attempts when user manually verifies
    checkJwtApiKey()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Stellar Cyber Alert</DialogTitle>
          <DialogDescription>Update the status and analysis for this Stellar Cyber alert</DialogDescription>
        </DialogHeader>

        {/* JWT API Key Required - Show when user doesn't have it */}
        {hasJwtKey === false && !checkingJwt && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 mb-1">Stellar Cyber JWT API Key Required</h3>
                <p className="text-sm text-amber-800 mb-3">
                  To update Stellar Cyber alerts, you must configure your personal JWT API key in your profile settings first.
                  This ensures all your actions are properly attributed to you.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      window.location.href = "/dashboard/profile"
                    }}
                  >
                    Go to Profile Settings
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleVerifyAgain}
                  >
                    Verify Again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading state while checking JWT key */}
        {checkingJwt && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
              <p className="text-sm text-muted-foreground">
                Verifying Stellar Cyber credentials... {recheckAttempts > 0 && `(attempt ${recheckAttempts}/${MAX_RECHECK_ATTEMPTS})`}
              </p>
            </div>
          </div>
        )}

        {/* Form - Only show if JWT key is available */}
        {hasJwtKey && !checkingJwt && (
          <>
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

          {/* Tags Section */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Alert Tags</h3>

            <div className="space-y-4">
              {/* Tag Mode Selector */}
              <div className="space-y-2">
                <Label>Tag Operation</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={tagMode === "add"}
                      onChange={() => setTagMode("add")}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Add Tags</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={tagMode === "delete"}
                      onChange={() => setTagMode("delete")}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Remove Tags</span>
                  </label>
                </div>
              </div>

              {/* Tag Input */}
              <div className="space-y-2">
                <Label htmlFor="new-tag">
                  {tagMode === "add" ? "Add new tag" : "Remove tag"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="new-tag"
                    placeholder={tagMode === "add" ? "Enter tag name..." : "Enter tag to remove..."}
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddTag()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTag}
                    disabled={!newTag?.trim()}
                  >
                    {tagMode === "add" ? "Add" : "Remove"}
                  </Button>
                </div>
              </div>

              {/* Tags to Add */}
              {tagsToAdd.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tags to Add ({tagsToAdd.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {tagsToAdd.map((tag) => (
                      <Badge key={`add-${tag}`} variant="default" className="gap-1">
                        <span>+ {tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag, "add")}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags to Delete */}
              {tagsToDelete.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tags to Remove ({tagsToDelete.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {tagsToDelete.map((tag) => (
                      <Badge key={`delete-${tag}`} variant="secondary" className="gap-1">
                        <span>- {tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag, "delete")}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
            </div>
          </>
        )}

        {/* Footer - Always show but disable buttons if no JWT key */}
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
          >
            {hasJwtKey === false && !checkingJwt ? "Close" : "Cancel"}
          </Button>
          <Button 
            onClick={handleUpdateStatus} 
            disabled={isLoading || hasJwtKey === false || checkingJwt}
          >
            {isLoading ? "Updating..." : "Update Status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
