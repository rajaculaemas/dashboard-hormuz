"use client"

import { useState, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, X, FileText, Image as ImageIcon, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const ALLOWED_EXTENSIONS = [".txt", ".png", ".jpg", ".jpeg", ".gif"]
const ALLOWED_MIME_TYPES = ["text/plain", "image/png", "image/jpeg", "image/gif"]
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

interface PendingFile {
  id: string
  file: File
  fileName: string
  fileSize: number
  fileType: "text" | "image"
}

interface PendingFileUploaderProps {
  pendingFiles: File[]
  onFilesChange: (files: File[]) => void
}

export function PendingEscalationFileUploader({
  pendingFiles,
  onFilesChange,
}: PendingFileUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  /**
   * Validate file before adding
   */
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check extension
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`
    
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`,
      }
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB`,
      }
    }

    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid MIME type. Please use text or image files.`,
      }
    }

    return { valid: true }
  }

  /**
   * Get file type icon and classification
   */
  const getFileType = (fileName: string): "text" | "image" => {
    const ext = `.${fileName.split(".").pop()?.toLowerCase()}`
    return ext === ".txt" ? "text" : "image"
  }

  /**
   * Handle file selection (from input or drag-drop)
   */
  const handleFiles = async (fileList: FileList) => {
    const newFiles: File[] = []

    Array.from(fileList).forEach((file) => {
      const validation = validateFile(file)

      if (!validation.valid) {
        setGlobalError(validation.error || "Invalid file")
        return
      }

      newFiles.push(file)
    })

    if (newFiles.length > 0) {
      setGlobalError(null)
      onFilesChange([...pendingFiles, ...newFiles])
    }
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
  const removeFile = (index: number) => {
    onFilesChange(pendingFiles.filter((_, i) => i !== index))
  }

  /**
   * Clear all files
   */
  const clearAll = () => {
    onFilesChange([])
    setGlobalError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">📎 Attach Files to Escalation</CardTitle>
        <CardDescription>
          Add files before escalating. They will be sent to L2 analyst automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info message */}
        {pendingFiles.length === 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            💡 Add screenshot, logs, or documents here. They'll be attached when you escalate.
          </div>
        )}

        {/* Global Error Alert */}
        {globalError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 flex gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{globalError}</span>
          </div>
        )}

        {/* Upload Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition cursor-pointer",
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-25"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_EXTENSIONS.join(",")}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-gray-400" />
            <div className="text-sm">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="font-medium text-blue-600 hover:text-blue-700 underline"
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
        {pendingFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                Selected Files ({pendingFiles.length})
                <Badge variant="default" className="ml-2">
                  {pendingFiles.length} to attach
                </Badge>
              </h4>
              {pendingFiles.length > 0 && (
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
              {pendingFiles.map((file, index) => {
                const fileType = getFileType(file.name)
                const isImage = fileType === "image"

                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isImage ? (
                        <ImageIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
