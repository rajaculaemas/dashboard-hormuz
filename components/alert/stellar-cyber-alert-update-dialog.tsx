"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, X, Clock, Upload, Lock, Unlock } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EscalationFileUploader } from "./escalation-file-uploader"
import { PendingEscalationFileUploader } from "./pending-escalation-file-uploader"

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
  const [errorMessage, setErrorMessage] = useState("")
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([])
  const [tagsToDelete, setTagsToDelete] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [tagMode, setTagMode] = useState<"add" | "delete">("add")
  const [hasJwtKey, setHasJwtKey] = useState<boolean | null>(null)
  const [checkingJwt, setCheckingJwt] = useState(false)
  const [recheckAttempts, setRecheckAttempts] = useState(0)
  const [stellarUsers, setStellarUsers] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [l2Analysts, setL2Analysts] = useState<any[]>([])
  const [loadingL2Analysts, setLoadingL2Analysts] = useState(false)
  const [actionMode, setActionMode] = useState<"update" | "escalate">("update")
  const [escalation, setEscalation] = useState<any>(null)
  const [escalationError, setEscalationError] = useState("")
  const [escalateToL2, setEscalateToL2] = useState("")
  const [escalationAnalysis, setEscalationAnalysis] = useState("")
  const [loadingEscalation, setLoadingEscalation] = useState(false)
  const [justEscalated, setJustEscalated] = useState(false)
  const [newEscalationId, setNewEscalationId] = useState("")
  const [pendingEscalationFiles, setPendingEscalationFiles] = useState<any[]>([])
  const [closeError, setCloseError] = useState("")
  const [isClosing, setIsClosing] = useState(false)
  const [isReopening, setIsReopening] = useState(false)
  const [reopenError, setReopenError] = useState("")
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

  // Load current status from database when dialog opens
  const loadCurrentStatus = async () => {
    if (!alert?.id) return
    try {
      console.log("[Stellar Dialog] Loading current status from database for alert:", alert.id)
      const response = await fetch(`/api/alerts/${alert.id}`)
      if (response.ok) {
        const { data } = await response.json()
        if (data) {
          // Update status from current database state
          setStatus(data?.status || "New")
          setSeverity(data?.severity || "")
          setAssignee(data?.metadata?.assignee || data?.assignee || "")
          console.log("[Stellar Dialog] Current status loaded:", { status: data?.status, severity: data?.severity, assignee: data?.assignee })
        }
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error loading current status:", error)
    }
  }

  // Fetch Stellar Cyber users when dialog opens and JWT key is ready
  useEffect(() => {
    if (open && hasJwtKey === true) {
      console.log("[Stellar Dialog] JWT key available, loading current status...")
      // Load current status from database first
      loadCurrentStatus()
      // Then fetch Stellar users
      fetchStellarUsers()
      // Always fetch L2 analysts when dialog opens
      fetchL2Analysts()
      // Fetch escalation details if alert has one
      if (alert?.id) {
        fetchEscalation()
      }
    }
  }, [open, hasJwtKey, alert?.id])

  const fetchStellarUsers = async () => {
    try {
      setLoadingUsers(true)
      const integrationId = alert?.integrationId || alert?.metadata?.integrationId || ""
      const response = await fetch(`/api/stellar-cyber/users?integrationId=${integrationId}`)
      const data = await response.json()
      
      if (data.success) {
        console.log(`[Stellar Dialog] Fetched ${data.count} Stellar users`)
        setStellarUsers(data.users || [])
      } else {
        console.error("[Stellar Dialog] Failed to fetch users:", data.error)
        setStellarUsers([])
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error fetching Stellar users:", error)
      setStellarUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }

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

      // Include assignee (Saved locally in DB, NOT sent to Stellar Cyber API)
      if (assignee?.trim()) {
        body.assignedTo = assignee
      }

      // NOTE: Stellar Cyber API does NOT support assignee field
      // Only include assignee for integrations that support it (Socfortress, QRadar)
      // Do NOT send assignedTo for Stellar Cyber updates

      // Add custom analysis fields
      if (severityBasedOnAnalysis) {
        body.severityBasedOnAnalysis = severityBasedOnAnalysis
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

        // Refresh alerts
        await onLoadAlerts?.()

        // Reset form
        setStatus("New")
        setSeverity("")
        setAssignee("")
        setComments("")
        setSeverityBasedOnAnalysis(null)
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

  const fetchL2Analysts = async () => {
    try {
      setLoadingL2Analysts(true)
      console.log("[Stellar Dialog] Fetching L2 analysts...")
      const response = await fetch(`/api/users?position=L2`)
      const data = await response.json()
      console.log("[Stellar Dialog] API Response:", data)
      
      if (data.success && Array.isArray(data.users)) {
        console.log("[Stellar Dialog] L2 analysts loaded:", data.users.length, "analysts")
        setL2Analysts(data.users)
      } else if (Array.isArray(data)) {
        console.log("[Stellar Dialog] L2 analysts loaded (array format):", data.length, "analysts")
        setL2Analysts(data)
      } else {
        console.error("[Stellar Dialog] Unexpected response format:", data)
        setL2Analysts([])
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error fetching L2 analysts:", error)
      setL2Analysts([])
    } finally {
      setLoadingL2Analysts(false)
    }
  }

  const fetchEscalation = async () => {
    if (!alert?.id) return
    try {
      setLoadingEscalation(true)
      const response = await fetch(`/api/alerts/${alert.id}/escalation`)
      if (response.ok) {
        const data = await response.json().catch(() => ({ escalation: null }))
        setEscalation(data.escalation || null)
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error fetching escalation:", error)
    } finally {
      setLoadingEscalation(false)
    }
  }

  const handleEscalate = async () => {
    setEscalationError("")
    if (!escalateToL2) {
      setEscalationError("Please select an L2 analyst")
      return
    }

    try {
      setIsLoading(true)
      const response = await fetch(`/api/alerts/${alert.id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escalationLevel: 2,
          assignedToId: escalateToL2,
          notes: escalationAnalysis || "",
        }),
      })

      if (response.ok) {
        const data = await response.json()
        console.log("[Stellar Dialog] Alert escalated successfully")
        setJustEscalated(true)
        const escalationId = data.escalationId || ""
        setNewEscalationId(escalationId)
        
        // Upload pending files if any exist
        if (pendingEscalationFiles.length > 0 && escalationId) {
          console.log("[Stellar Dialog] Uploading pending files...", pendingEscalationFiles.length)
          for (const file of pendingEscalationFiles) {
            const formData = new FormData()
            formData.append("file", file)
            formData.append("escalationId", escalationId)
            try {
              await fetch(`/api/alerts/${alert.id}/escalation/upload-attachment`, {
                method: "POST",
                body: formData,
              })
            } catch (fileError) {
              console.error("[Stellar Dialog] Error uploading file:", fileError)
            }
          }
        }
        
        setEscalateToL2("")
        setEscalationAnalysis("")
        setPendingEscalationFiles([])
        await fetchEscalation()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to escalate alert" }))
        throw new Error(errorData.error || "Failed to escalate alert")
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error escalating alert:", error)
      setEscalationError(error instanceof Error ? error.message : "Failed to escalate alert")
    } finally {
      setIsLoading(false)
    }
  }

  const handleReopenEscalation = async () => {
    if (!escalation?.id) return
    try {
      setIsReopening(true)
      setReopenError("")
      const response = await fetch(`/api/alerts/${alert.id}/escalation/${escalation.id}/close-reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      })

      if (response.ok) {
        await fetchEscalation()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to reopen escalation" }))
        setReopenError(errorData.error || "Failed to reopen escalation")
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error reopening escalation:", error)
      setReopenError("Failed to reopen escalation")
    } finally {
      setIsReopening(false)
    }
  }

  const handleCloseEscalation = async () => {
    if (!escalation?.id) return
    try {
      setIsClosing(true)
      setCloseError("")
      const response = await fetch(`/api/alerts/${alert.id}/escalation/${escalation.id}/close-reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      })

      if (response.ok) {
        await fetchEscalation()
      } else {
        const errorData = await response.json().catch(() => ({ error: "Failed to close escalation" }))
        setCloseError(errorData.error || "Failed to close escalation")
      }
    } catch (error) {
      console.error("[Stellar Dialog] Error closing escalation:", error)
      setCloseError("Failed to close escalation")
    } finally {
      setIsClosing(false)
    }
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
            {/* Action Mode Toggle */}
            <div className="flex gap-4 mb-4 p-3 bg-muted rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={actionMode === "update"}
                  onChange={() => {
                    setActionMode("update")
                    setEscalationError("")
                  }}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Update Status (as L1)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={actionMode === "escalate"}
                  onChange={async () => {
                    setActionMode("escalate")
                    setErrorMessage("")
                    setEscalationError("")
                    // Always fetch fresh L2 analysts when entering escalate mode
                    console.log("[Stellar Dialog] User switched to escalate mode, fetching L2 analysts...")
                    await fetchL2Analysts()
                  }}
                  disabled={escalation !== null && !loadingEscalation}
                  className="w-4 h-4"
                />
                <span className={`text-sm font-medium ${escalation !== null && !loadingEscalation ? "text-gray-400" : ""}`}>
                  Escalate to L2 {escalation !== null && !loadingEscalation ? "(Already escalated)" : "(requires analysis)"}
                </span>
              </label>
            </div>

            {/* Error Messages */}
            {errorMessage && !actionMode.includes("escalate") && (
              <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{errorMessage}</p>
              </div>
            )}
            {escalationError && actionMode === "escalate" && (
              <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{escalationError}</p>
              </div>
            )}

            {actionMode === "escalate" && escalation && !loadingEscalation && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">This alert is already escalated</p>
                  <p className="text-xs text-blue-800 mt-1">
                    View the escalation details below or check the Details tab to continue the escalation conversation with L2 analysts.
                  </p>
                </div>
              </div>
            )}

            {/* Update Mode Form */}
            {actionMode === "update" && (
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

          {/* Assign To */}
          <div className="space-y-2">
            <Label htmlFor="assignee">Assign To (Local Only)</Label>
            <Select value={assignee} onValueChange={setAssignee} disabled={loadingUsers}>
              <SelectTrigger id="assignee">
                <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select user (optional)"} />
              </SelectTrigger>
              <SelectContent>
                {stellarUsers.length > 0 ? (
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

              {/* Tag Input - Predefined Tags + Manual Input */}
              <div className="space-y-3">
                {tagMode === "add" && (
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Quick Add Predefined Tags:</Label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {["True Positive", "False Positive", "Benign True Positive"].map((tag) => (
                        <Button
                          key={tag}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => {
                            if (!tagsToAdd.includes(tag)) {
                              setTagsToAdd([...tagsToAdd, tag])
                            }
                          }}
                          disabled={tagsToAdd.includes(tag)}
                        >
                          + {tag}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="new-tag" className="text-sm">
                    {tagMode === "add" ? "Or add custom tag" : "Remove tag"}
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="new-tag"
                      placeholder={tagMode === "add" ? "Enter custom tag name..." : "Enter tag to remove..."}
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
            )}

            {/* Escalation Mode Form - Tabbed Interface */}
            {actionMode === "escalate" && (
            <>
            {escalation && (
              <Tabs defaultValue="attachments" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="attachments">📎 Attachments</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>

                {/* Escalation Status Header */}
                <div className="mt-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={escalation.closedAt ? "secondary" : "destructive"}
                        className="gap-1"
                      >
                        {escalation.closedAt ? <Lock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {escalation.status?.toUpperCase()}
                      </Badge>
                      {escalation.escalationLevel === 2 && (
                        <Badge variant="outline" className="gap-1">
                          🔺 L2 → L3 Escalated
                        </Badge>
                      )}
                    </div>
                    {escalation.closedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReopenEscalation}
                        disabled={isClosing}
                      >
                        <Unlock className="h-3 w-3 mr-2" />
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>

                {closeError && (
                  <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg mb-4">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{closeError}</p>
                  </div>
                )}

                {/* Attachments Tab */}
                <TabsContent value="attachments" className="mt-4">
                  <EscalationFileUploader
                    alertId={alert.id}
                    escalationId={escalation.id}
                    disabled={escalation.closedAt ? true : false}
                    onUploadComplete={() => fetchEscalation()}
                  />
                </TabsContent>

                {/* Details Tab */}
                <TabsContent value="details" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-gray-600">Escalated By</p>
                      <p className="text-gray-900">{escalation.escalatedBy?.name}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-600">Escalated To</p>
                      <p className="text-gray-900">{escalation.escalatedTo?.name}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-600">Escalation Time</p>
                      <p className="text-gray-900 text-xs">{new Date(escalation.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-600">Status</p>
                      <div className="mt-1">
                        <Badge variant={escalation.closedAt ? "secondary" : "default"}>
                          {escalation.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {!escalation.closedAt && (
                    <div className="border-t pt-4">
                      <Label className="text-sm font-medium mb-2 block">Close Escalation</Label>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleCloseEscalation()}
                        disabled={isClosing}
                        className="w-full"
                      >
                        {isClosing ? "Closing..." : "Close Escalation"}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Closing will stop further escalation activity unless reopened later.
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
            {!escalation && !loadingEscalation && (
              <div className="space-y-4 py-4">
              {/* Timeout Information */}
              <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-900">30-Minute Response Timeout</p>
                  <p className="text-xs text-orange-800 mt-1">
                    L2 analyst will have 30 minutes to respond via Telegram. If no response is received, the alert will be auto-escalated to L3.
                  </p>
                </div>
              </div>

              {/* L2 Analyst Selection */}
              <div className="space-y-2">
                <Label htmlFor="escalate-to-l2">Escalate to L2 Analyst * {loadingL2Analysts && "(Loading...)"}</Label>
                <Select value={escalateToL2} onValueChange={setEscalateToL2} disabled={loadingL2Analysts || l2Analysts.length === 0}>
                  <SelectTrigger id="escalate-to-l2">
                    <SelectValue placeholder={loadingL2Analysts ? "Loading L2 analysts..." : l2Analysts.length === 0 ? "No L2 analysts available" : "Select L2 analyst"} />
                  </SelectTrigger>
                  <SelectContent>
                    {l2Analysts.length > 0 ? (
                      l2Analysts.map((analyst) => (
                        <SelectItem key={analyst.id} value={analyst.id}>
                          {analyst.name} {analyst.email ? `(${analyst.email})` : ""}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-sm text-muted-foreground">
                        {loadingL2Analysts ? "Loading analysts..." : "No L2 analysts found with Telegram chat ID"}
                      </div>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">L2 analyst must have Telegram chat ID linked</p>
                {!loadingL2Analysts && l2Analysts.length > 0 && (
                  <p className="text-xs text-green-600">✓ {l2Analysts.length} L2 analysts available</p>
                )}
              </div>

              {/* Escalation Analysis */}
              <div className="space-y-2">
                <Label htmlFor="escalation-analysis">Analysis (min 20 characters) *</Label>
                <Textarea
                  id="escalation-analysis"
                  placeholder="Describe your analysis and why this alert needs L2 review..."
                  value={escalationAnalysis}
                  onChange={(e) => setEscalationAnalysis(e.target.value)}
                  className="min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground">
                  {escalationAnalysis.length} / 20 characters minimum
                </p>
              </div>

              {/* File Attachment Section - Available from start */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">📎 Attach Evidence Files</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Add files now - they'll be sent to the L2 analyst when you escalate
                </p>
                
                <PendingEscalationFileUploader
                  pendingFiles={pendingEscalationFiles}
                  onFilesChange={setPendingEscalationFiles}
                />
              </div>
            </div>
            )}
            </>
            )}
          </>
        )}

        {/* Footer - Always show but disable buttons if no JWT key */}
        <DialogFooter>
          {justEscalated ? (
            <>
              <Button 
                variant="outline" 
                onClick={() => {
                  // Reset state
                  setJustEscalated(false)
                  setNewEscalationId("")
                  setActionMode("update")
                  setPendingEscalationFiles([])
                  onOpenChange(false)
                  onUpdateSuccess?.()
                }}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                {hasJwtKey === false && !checkingJwt ? "Close" : "Cancel"}
              </Button>
              <Button 
                onClick={actionMode === "escalate" ? handleEscalate : handleUpdateStatus} 
                disabled={isLoading || hasJwtKey === false || checkingJwt}
              >
                {isLoading ? (
                  actionMode === "escalate" ? "Escalating..." : "Updating..."
                ) : (
                  actionMode === "escalate" ? "Escalate to L2" : "Update Status"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
