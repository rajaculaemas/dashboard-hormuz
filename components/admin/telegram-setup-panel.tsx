"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { AlertCircle, CheckCircle, Loader2, Settings, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface TelegramSetupPanelProps {
  onStatusChange?: (status: boolean) => void
}

export function TelegramSetupPanel({ onStatusChange }: TelegramSetupPanelProps) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [testMessage, setTestMessage] = useState("")
  const [testChatId, setTestChatId] = useState("")
  const [showTestDialog, setShowTestDialog] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null)

  // Fetch status on mount
  useEffect(() => {
    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    try {
      setStatusLoading(true)
      const response = await fetch("/api/admin/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" }),
      })

      if (response.ok) {
        const data = await response.json()
        setStatus(data)
        onStatusChange?.(data.configured)
      }
    } catch (error) {
      console.error("Error fetching status:", error)
    } finally {
      setStatusLoading(false)
    }
  }

  const handleSetup = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      })

      const data = await response.json()

      if (response.ok) {
        alert(data.message || "Webhook configured successfully")
        fetchStatus()
      } else {
        alert(`Error: ${data.error || "Failed to setup webhook"}`)
      }
    } catch (error) {
      alert("Error setting up webhook: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete the webhook? Escalation notifications will stop working.")) {
      return
    }

    try {
      setLoading(true)
      const response = await fetch("/api/admin/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      })

      const data = await response.json()

      if (response.ok) {
        alert(data.message || "Webhook deleted")
        fetchStatus()
      } else {
        alert(`Error: ${data.error || "Failed to delete webhook"}`)
      }
    } catch (error) {
      alert("Error deleting webhook: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!testChatId.trim()) {
      alert("Please enter a chat ID")
      return
    }

    try {
      setTestLoading(true)
      const response = await fetch("/api/admin/telegram/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", chatId: testChatId }),
      })

      const data = await response.json()
      setTestResult(data)
    } catch (error) {
      setTestResult({
        error: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Bot Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Telegram Bot Configuration
          </CardTitle>
          <CardDescription>Manage the Telegram bot for alert escalations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading status...
            </div>
          ) : status ? (
            <>
              {/* Bot Status */}
              <div>
                <label className="text-sm font-medium">Bot Status</label>
                <div className="flex items-center gap-2 mt-2">
                  {status.botInfo ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">@{status.botInfo.username}</p>
                        <p className="text-xs text-muted-foreground">ID: {status.botInfo.id}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="h-5 w-5" />
                      <span className="text-sm">Bot verification failed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Webhook Status */}
              <div>
                <label className="text-sm font-medium">Webhook Status</label>
                <div className="mt-2">
                  {status.configured ? (
                    <div className="space-y-2">
                      <Badge className="bg-green-100 text-green-800">Connected</Badge>
                      {status.webhookInfo?.url && (
                        <div className="text-xs bg-muted p-2 rounded break-all">
                          <p className="font-mono">{status.webhookInfo.url}</p>
                        </div>
                      )}
                      {status.webhookInfo?.last_error_message && (
                        <div className="text-xs text-red-600">
                          Last error: {status.webhookInfo.last_error_message}
                        </div>
                      )}
                      {status.webhookInfo?.pending_update_count !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          Pending updates: {status.webhookInfo.pending_update_count}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-orange-600 border-orange-200">
                      Not Connected
                    </Badge>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                {!status.configured ? (
                  <Button onClick={handleSetup} disabled={loading} className="gap-2">
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Configure Webhook
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleDelete} disabled={loading} variant="destructive" className="gap-2">
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      <Trash2 className="h-4 w-4" />
                      Delete Webhook
                    </Button>
                    <Button
                      onClick={() => {
                        setTestResult(null)
                        setShowTestDialog(true)
                      }}
                      variant="outline"
                      disabled={loading}
                    >
                      Test Connection
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="text-muted-foreground text-sm">Failed to load status</div>
          )}
        </CardContent>
      </Card>

      {/* Test Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Telegram Connection</DialogTitle>
            <DialogDescription>
              Send a test message to verify the bot is working correctly
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Chat ID</label>
              <Input
                placeholder="e.g., 123456789"
                value={testChatId}
                onChange={(e) => setTestChatId(e.target.value)}
                disabled={testLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter your Telegram chat ID to receive a test message
              </p>
            </div>

            {testResult && (
              <div className={`p-3 rounded text-sm ${testResult.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                {testResult.error ?
                  `❌ ${testResult.error}`
                  : `✅ ${testResult.message}`
                }
              </div>
            )}

            <Button onClick={handleTest} disabled={testLoading || !testChatId.trim()} className="w-full gap-2">
              {testLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send Test Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-sm text-blue-900">How Telegram Escalation Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>
            1. When an alert is escalated to L2, the selected analyst receives a Telegram message with the alert details
          </p>
          <p>
            2. L2 can reply to the message with format: <code className="bg-blue-100 px-1 rounded">ANALYSIS: ... CONCLUSION: ...</code>
          </p>
          <p>
            3. If L2 doesn't respond within 30 minutes, the alert is automatically escalated to L3
          </p>
          <p>
            4. L3 receives the escalated alert and can provide analysis (uses same format)
          </p>
          <p>
            5. If L3 doesn't respond, admin is notified for manual intervention
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
