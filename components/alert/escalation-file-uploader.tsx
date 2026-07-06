"use client"

import { useState, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Upload, X, FileText, Image as ImageIcon, AlertCircle, Check, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

const ALLOWED_EXTENSIONS = [".txt", ".png", ".jpg", ".jpeg", ".gif"]
const ALLOWED_MIME_TYPES = ["text/plain", "image/png", "image/jpeg", "image/gif"]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

interface UploadedFile {
  id: string
  fileName: string
  fileSize: number
  fileType: "text" | "image"
  uploadProgress: number
  uploadStatus: "pending" | "uploading" | "success" | "error"
  errorMessage?: string
  sentToTelegram?: boolean
}

interface FileUploaderProps {
  alertId: string
  escalationId?: string | null
  onUploadComplete?: (file: UploadedFile) => void
  disabled?: boolean
}

export function EscalationFileUploader({
  alertId,
  escalationId,
  onUploadComplete,
  disabled = false,
}: FileUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Determine if uploader is disabled (no escalation yet or explicitly disabled)
  const isDisabled = disabled || !escalationId

  /**
   * Validate file before uploading
   */
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check extension
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
      }
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid MIME type. Please use text or image files.`,
      }
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`,
      }
    }

    return { valid: true }
  }

  /**
   * Get file type icon and classification
   */
  const getFileType = (fileName: string): "text" | "image" => {
    const ext = `.${fileName.split(".").pop()?.toLowerCase()}`
    return ["image/png", "image/jpeg", "image/gif"].includes(
      ALLOWED_MIME_TYPES[ALLOWED_EXTENSIONS.indexOf(ext)] || ""
    )
      ? "image"
      : "text"
  }

  /**
   * Upload file to backend
   */
  const uploadFile = async (file: File, fileId: string) => {
    try {
      setGlobalError(null)

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                uploadStatus: "uploading",
              }
            : f
        )
      )

      // Prepare FormData
      const formData = new FormData()
      formData.append("file", file)
      if (escalationId) {
        formData.append("escalationId", escalationId)
      }

      // Upload
      const response = await fetch(`/api/alerts/${alertId}/escalation/upload-attachment`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Upload failed")
      }

      // Update file with response data
      const uploadedFile = {
        id: fileId,
        fileName: data.attachment.fileName,
        fileSize: data.attachment.fileSize,
        fileType: getFileType(data.attachment.fileName),
        uploadProgress: 100,
        uploadStatus: "success" as const,
        sentToTelegram: data.attachment.sentToTelegram,
      }

      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? uploadedFile : f))
      )

      // Callback
      if (onUploadComplete) {
        onUploadComplete(uploadedFile)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      setGlobalError(errorMessage)

      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                uploadStatus: "error",
                errorMessage,
              }
            : f
        )
      )
    }
  }

  /**
   * Handle file selection (from input or drag-drop)
   */
  const handleFiles = async (fileList: FileList) => {
    // Don't allow uploads if disabled
    if (isDisabled) {
      setGlobalError("Please create an escalation first before uploading files")
      return
    }

    const newFiles: UploadedFile[] = []

    Array.from(fileList).forEach((file) => {
      const validation = validateFile(file)

      if (!validation.valid) {
        setGlobalError(validation.error || "Invalid file")
        return
      }

      const fileId = `${Date.now()}-${Math.random()}`
      const newFile: UploadedFile = {
        id: fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: getFileType(file.name),
        uploadProgress: 0,
        uploadStatus: "pending",
      }

      newFiles.push(newFile)

      // Upload immediately
      uploadFile(file, fileId)
    })

    setFiles((prev) => [...prev, ...newFiles])
  }

  /**
   * Drag-drop handlers
   */
  const handleDrag = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.type === "dragenter" || e.type === "dragover") {
        setIsDragActive(true)
      } else if (e.type === "dragleave") {
        setIsDragActive(false)
      }
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFiles(e.dataTransfer.files)
      }
    },
    []
  )

  /**
   * Remove file from list
   */
  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  /**
   * Clear all files
   */
  const clearAll = () => {
    setFiles([])
    setGlobalError(null)
  }

  const pendingCount = files.filter((f) => f.uploadStatus === "pending").length
  const successCount = files.filter((f) => f.uploadStatus === "success").length
  const errorCount = files.filter((f) => f.uploadStatus === "error").length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📎 Upload Attachments</CardTitle>
        <CardDescription>
          {isDisabled && !escalationId 
            ? "Create an escalation first to attach files to send to L2/L3"
            : "Attach files to your escalation response (.txt, .png, .jpg, .jpeg, .gif • Max 5MB)"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info message when no escalation */}
        {!escalationId && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              📎 Upload will be available once you click "Escalate to L2" and create the escalation
            </AlertDescription>
          </Alert>
        )}

        {/* Global Error Alert */}
        {globalError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{globalError}</AlertDescription>
          </Alert>
        )}

        {/* Upload Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition",
            isDragActive && !isDisabled
              ? "border-blue-500 bg-blue-50 cursor-pointer"
              : "border-gray-300 bg-gray-50",
            !isDisabled && "hover:border-blue-400 hover:bg-blue-25 cursor-pointer",
            isDisabled && "opacity-60 bg-gray-100"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.join(",")}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
            disabled={isDisabled}
          />

          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-gray-400" />
            <div className="text-sm">
              <button
                onClick={() => {
                  if (isDisabled) {
                    setGlobalError("Please create an escalation first before uploading files")
                  } else {
                    fileInputRef.current?.click()
                  }
                }}
                className={cn(
                  "font-medium underline",
                  isDisabled 
                    ? "text-gray-500 cursor-not-allowed" 
                    : "text-blue-600 hover:text-blue-700 cursor-pointer"
                )}
              >
                Click to upload
              </button>
              <span className="text-gray-600"> or drag and drop</span>
            </div>
            <p className="text-xs text-gray-500">
              {ALLOWED_EXTENSIONS.join(", ")} • Up to {(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB each
            </p>
          </div>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                Uploads ({files.length})
                {successCount > 0 && (
                  <Badge variant="default" className="ml-2">
                    {successCount} sent
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {errorCount} failed
                  </Badge>
                )}
              </h4>
              {files.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  className="text-xs"
                >
                  Clear all
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {files.map((file) => (
                <FileUploadItem
                  key={file.id}
                  file={file}
                  onRemove={() => removeFile(file.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upload Summary */}
        {files.length > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 p-2 rounded">
            <span>
              Total: {files.length} file{files.length !== 1 ? "s" : ""} •{" "}
              {(files.reduce((sum, f) => sum + f.fileSize, 0) / 1024 / 1024).toFixed(1)}MB
            </span>
            {pendingCount > 0 && <span>{pendingCount} uploading...</span>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Individual File Upload Item
 */
function FileUploadItem({
  file,
  onRemove,
}: {
  file: UploadedFile
  onRemove: () => void
}) {
  const getIcon = () => {
    switch (file.fileType) {
      case "text":
        return <FileText className="h-4 w-4 text-blue-500" />
      case "image":
        return <ImageIcon className="h-4 w-4 text-green-500" />
      default:
        return <Upload className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = () => {
    switch (file.uploadStatus) {
      case "pending":
      case "uploading":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Uploading...
          </Badge>
        )
      case "success":
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <Check className="h-3 w-3" />
            {file.sentToTelegram ? "Sent to Telegram" : "Uploaded"}
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Failed
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded p-3 hover:bg-gray-50 transition">
      {/* Icon */}
      <div className="flex-shrink-0">{getIcon()}</div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.fileName}</p>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-gray-500">{(file.fileSize / 1024).toFixed(1)} KB</p>
          {file.uploadStatus === "uploading" && (
            <Progress value={file.uploadProgress} className="h-1 w-32" />
          )}
        </div>
        {file.errorMessage && (
          <p className="text-xs text-red-600 mt-1">{file.errorMessage}</p>
        )}
      </div>

      {/* Status Badge */}
      <div className="flex-shrink-0">{getStatusBadge()}</div>

      {/* Remove Button */}
      {file.uploadStatus !== "uploading" && (
        <button
          onClick={onRemove}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition"
          title="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
