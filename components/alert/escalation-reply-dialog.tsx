"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { AlertCircle, Loader2, Upload, X, FileText, Image as ImageIcon } from "lucide-react"

interface EscalationReplyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  alertId: string
  escalationId: string
  respondentName: string
  originalAnalysis: string
  onReplySuccess?: () => void
}

export function EscalationReplyDialog({
  open,
  onOpenChange,
  alertId,
  escalationId,
  respondentName,
  originalAnalysis,
  onReplySuccess,
}: EscalationReplyDialogProps) {
  const [reply, setReply] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>("")
  const [dragActive, setDragActive] = useState(false)

  const ALLOWED_EXTENSIONS = [".txt", ".png", ".jpg", ".jpeg", ".gif"]
  const ALLOWED_MIMETYPES = [
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/gif"
  ]
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

  const handleFileSelect = (selectedFiles: FileList) => {
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        
        // Validate extension
        const ext = "." + file.name.split(".").pop()?.toLowerCase()
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          setError(`${file.name}: File type not allowed. Use: ${ALLOWED_EXTENSIONS.join(", ")}`)
          continue
        }

        // Validate MIME type
        if (!ALLOWED_MIMETYPES.includes(file.type)) {
          setError(`${file.name}: MIME type not allowed`)
          continue
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          setError(`${file.name}: File size exceeds 5MB limit`)
          continue
        }

        // Add file to list if not already present
        if (!files.find(f => f.name === file.name && f.size === file.size)) {
          setFiles(prev => [...prev, file])
          setError("")
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error selecting files")
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files)
    }
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    try {
      setError("")

      // Validate reply length
      if (reply.trim().length < 10) {
        setError("Reply must be at least 10 characters")
        return
      }

      setIsSubmitting(true)

      // Step 1: Upload files first (if any)
      const uploadedFileIds: string[] = []
      for (const file of files) {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("escalationId", escalationId)

        const uploadResponse = await fetch(
          `/api/alerts/${alertId}/escalation/upload-attachment`,
          {
            method: "POST",
            body: formData,
          }
        )

        if (!uploadResponse.ok) {
          const uploadData = await uploadResponse.json()
          throw new Error(`File upload failed: ${uploadData.error}`)
        }

        const uploadData = await uploadResponse.json()
        if (uploadData.attachment?.id) {
          uploadedFileIds.push(uploadData.attachment.id)
        }
      }

      // Step 2: Send reply with file references
      const response = await fetch(
        `/api/alerts/${alertId}/escalation/${escalationId}/reply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reply: reply.trim(),
            fileIds: uploadedFileIds,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to send reply")
        return
      }

      // Success
      setReply("")
      setFiles([])
      onOpenChange(false)
      onReplySuccess?.()
    } catch (err) {
      console.error("[Reply Dialog] Error:", err)
      setError(err instanceof Error ? err.message : "Failed to send reply")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setReply("")
      setFiles([])
      setError("")
      setDragActive(false)
    }
    onOpenChange(newOpen)
  }

  const charCount = reply.length

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reply to L2 Analysis</DialogTitle>
          <DialogDescription>
            Respond to {respondentName}'s analysis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Original Analysis Quote */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-xs font-medium text-blue-900 mb-2">L2 Analysis:</p>
            <p className="text-sm text-blue-800 line-clamp-3">"{originalAnalysis}"</p>
          </div>

          {/* Reply Textarea */}
          <div className="space-y-2">
            <Label htmlFor="reply-text">Your Reply (min 10 characters) *</Label>
            <Textarea
              id="reply-text"
              placeholder="Enter your reply to the L2 analysis..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              className="min-h-[120px] resize-none"
              disabled={isSubmitting}
            />
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                {charCount} characters
              </p>
              {charCount > 0 && charCount < 10 && (
                <p className="text-xs text-orange-600">
                  Minimum 10 characters required
                </p>
              )}
            </div>
          </div>

          {/* File Uploader */}
          <div className="space-y-2 border-t pt-4">
            <Label>Attach Files (Optional)</Label>
            <p className="text-xs text-muted-foreground">
              .txt, .png, .jpg, .jpeg, .gif - Max 5MB each
            </p>

            {/* Drag & Drop Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition ${
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 bg-gray-50 hover:bg-gray-100"
              } ${isSubmitting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => {
                if (!isSubmitting) {
                  document.getElementById("file-input")?.click()
                }
              }}
            >
              <input
                id="file-input"
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(",")}
                onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                className="hidden"
                disabled={isSubmitting}
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Drop files here or click to select</p>
                  <p className="text-xs text-gray-500">Multiple files supported</p>
                </div>
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">{files.length} file(s) selected:</p>
                <div className="space-y-2">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded border border-gray-200"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {file.type.startsWith("image/") ? (
                          <ImageIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{file.name}</p>
                          <p className="text-[10px] text-gray-500">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0"
                        onClick={() => removeFile(idx)}
                        disabled={isSubmitting}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Info Message */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            <span>ℹ️</span>
            <span>Your reply and files will be sent to the L2 analyst via Telegram</span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || reply.trim().length < 10}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting ? "Sending..." : "Send Reply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
