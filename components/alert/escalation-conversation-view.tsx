"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Download, FileText, Image as ImageIcon, AlertCircle, Clock } from "lucide-react"
import { formatTimestampWithTimezone } from "@/lib/utils/timestamp"

interface EscalationAttachment {
  id: string
  fileName: string
  fileUrl: string
  fileType: "text" | "image"
  fileSize: number
  uploadedBy: {
    id: string
    name: string
    email: string
  }
  createdAt: string
  sentToTelegram: boolean
}

interface EscalationResponse {
  id: string
  analysis: string
  conclusion?: string
  action: string
  responder: {
    id: string
    name: string
    email: string
  }
  createdAt: string
}

interface ConversationViewProps {
  escalation: any
  alert: any
}

export function EscalationConversationView({ escalation, alert }: ConversationViewProps) {
  const [attachments, setAttachments] = useState<Record<string, EscalationAttachment[]>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (escalation?.id) {
      fetchAttachments()
    }
  }, [escalation?.id])

  const fetchAttachments = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/alerts/${alert.id}/escalation/${escalation.id}/attachments`)
      if (response.ok) {
        const data = await response.json()
        setAttachments(data.attachments || {})
      }
    } catch (error) {
      console.error("Error fetching attachments:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!escalation) {
    return null
  }

  const isClosed = escalation.closedAt && new Date(escalation.closedAt) < new Date()

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <Card className={isClosed ? "border-gray-300 bg-gray-50" : "border-orange-200 bg-orange-50"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">
                {isClosed ? "🔒 Closed" : "🔓 Active"} Escalation
              </CardTitle>
              <Badge variant={isClosed ? "secondary" : "destructive"}>
                {escalation.status.toUpperCase()}
              </Badge>
            </div>
            {isClosed && escalation.closedBy && (
              <span className="text-xs text-gray-600">
                Closed by {escalation.closedBy.name} at {formatTimestampWithTimezone(escalation.closedAt)}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Conversation Thread */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversation Thread</CardTitle>
          <CardDescription>
            L{escalation.escalationLevel} → L{escalation.escalationLevel + 1} Escalation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] border rounded-lg p-4 space-y-4">
            {/* L1 Initial Analysis */}
            <div className="border-l-4 border-blue-500 pl-4 py-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-blue-900">
                    {escalation.escalatedBy?.name || "L1 Analyst"}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">Initial Analysis</p>
                </div>
                <span className="text-xs text-gray-500">
                  {formatTimestampWithTimezone(escalation.createdAt)}
                </span>
              </div>
              <p className="text-sm mt-3 bg-blue-50 p-3 rounded border border-blue-200">
                {escalation.l1Analysis || "No analysis provided"}
              </p>

              {/* L1 Attachments */}
              {attachments["l1"] && attachments["l1"].length > 0 && (
                <AttachmentList attachments={attachments["l1"]} level="L1" />
              )}
            </div>

            {/* L2 Response */}
            {(escalation.l2Analysis || escalation.responses?.length > 0) && (
              <div className="border-l-4 border-green-500 pl-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-green-900">
                      {escalation.escalatedTo?.name || "L2 Analyst"}
                    </p>
                    <p className="text-xs text-green-700 mt-1">Response</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {escalation.repliedAt ? formatTimestampWithTimezone(escalation.repliedAt) : "Pending"}
                  </span>
                </div>

                {escalation.l2Analysis && (
                  <>
                    <p className="text-sm mt-3 bg-green-50 p-3 rounded border border-green-200">
                      {escalation.l2Analysis}
                    </p>
                    {escalation.responses?.[0]?.conclusion && (
                      <div className="mt-2 text-xs">
                        <Badge variant="outline" className="text-green-700">
                          {escalation.responses[0].conclusion}
                        </Badge>
                      </div>
                    )}
                  </>
                )}

                {/* L2 Attachments */}
                {attachments["l2"] && attachments["l2"].length > 0 && (
                  <AttachmentList attachments={attachments["l2"]} level="L2" />
                )}
              </div>
            )}

            {/* L3 Response (if escalated) */}
            {escalation.escalationLevel === 2 && (escalation.l3Analysis || escalation.status === "escalated") && (
              <div className="border-l-4 border-purple-500 pl-4 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-purple-900">L3 Manager/Expert</p>
                    <p className="text-xs text-purple-700 mt-1">Escalated Analysis</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {escalation.l3Analysis ? formatTimestampWithTimezone(escalation.resolvedAt) : "Pending"}
                  </span>
                </div>

                {escalation.l3Analysis ? (
                  <>
                    <p className="text-sm mt-3 bg-purple-50 p-3 rounded border border-purple-200">
                      {escalation.l3Analysis}
                    </p>
                    {escalation.responses?.find((r: any) => r.analysis && r.createdAt > escalation.repliedAt) && (
                      <div className="mt-2 text-xs">
                        <Badge variant="outline" className="text-purple-700">
                          Response Received
                        </Badge>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-sm text-purple-700">
                    <AlertCircle className="h-4 w-4" />
                    Waiting for L3 response...
                  </div>
                )}

                {/* L3 Attachments */}
                {attachments["l3"] && attachments["l3"].length > 0 && (
                  <AttachmentList attachments={attachments["l3"]} level="L3" />
                )}
              </div>
            )}

            {/* Pending State */}
            {!escalation.repliedAt && !escalation.l2Analysis && (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Clock className="h-4 w-4 mr-2" />
                <span className="text-sm">Waiting for L2 response...</span>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Attachment List Component
 */
function AttachmentList({
  attachments,
  level,
}: {
  attachments: EscalationAttachment[]
  level: string
}) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium text-gray-600">📎 Attachments from {level}</p>
      <div className="space-y-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded border border-gray-200 hover:bg-gray-100 transition"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {attachment.fileType === "text" ? (
                <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
              ) : (
                <ImageIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{attachment.fileName}</p>
                <p className="text-[10px] text-gray-500">
                  {(attachment.fileSize / 1024).toFixed(1)} KB
                  {attachment.sentToTelegram && " • Sent to Telegram"}
                </p>
              </div>
            </div>
            <a
              href={attachment.fileUrl}
              download={attachment.fileName}
              className="flex-shrink-0"
              title="Download file"
            >
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Download className="h-4 w-4" />
              </Button>
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
