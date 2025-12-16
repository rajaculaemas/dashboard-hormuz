"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit,
  ExternalLink,
  MoreVertical,
  RefreshCw,
  Trash2,
  XCircle,
  Download,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useIntegrationStore } from "@/lib/stores/integration-store"
import { useAlertStore } from "@/lib/stores/alert-store"
import type { Integration } from "@/lib/types/integration"

interface IntegrationCardProps {
  integration: Integration
  onEdit: (integration: Integration) => void
  canManage?: boolean
}

export function IntegrationCard({ integration, onEdit, canManage = true }: IntegrationCardProps) {
  const { deleteIntegration, testIntegration } = useIntegrationStore()
  const { syncAlerts } = useAlertStore()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; count?: number } | null>(null)

  const handleDelete = async () => {
    setIsDeleting(true)
    await deleteIntegration(integration.id)
    setIsDeleting(false)
  }

  const handleTest = async () => {
    setIsTesting(true)
    try {
      await testIntegration(integration.id)
    } catch (error) {
      console.error("Test error:", error)
    } finally {
      setIsTesting(false)
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncResult(null)
    try {
      const result = await syncAlerts(integration.id)
      setSyncResult({
        success: true,
        message: result?.message || "Sync success",
        count: result?.stats?.synced || 0,
      })
    } catch (error) {
      console.error("Sync error:", error)
      setSyncResult({ success: false, message: error instanceof Error ? error.message : "Sync failed" })
    } finally {
      setIsSyncing(false)
    }
  }

  const getStatusIcon = () => {
    switch (integration.status) {
      case "connected":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "disconnected":
        return <XCircle className="h-4 w-4 text-gray-500" />
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    switch (integration.status) {
      case "connected":
        return "Connected"
      case "disconnected":
        return "Disconnected"
      case "pending":
        return "Pending"
      case "error":
        return "Error"
      default:
        return "Unknown"
    }
  }

  const getStatusColor = () => {
    switch (integration.status) {
      case "connected":
        return "bg-green-500/10 text-green-500"
      case "disconnected":
        return "bg-gray-500/10 text-gray-500"
      case "pending":
        return "bg-yellow-500/10 text-yellow-500"
      case "error":
        return "bg-red-500/10 text-red-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  const getTypeColor = () => {
    switch (integration.type) {
      case "alert":
        return "bg-blue-500/10 text-blue-500"
      case "log":
        return "bg-purple-500/10 text-purple-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  const safeMethod = integration.method || "api"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                {integration.icon ? (
                  <img src={integration.icon || "/placeholder.svg"} alt={integration.name} className="w-5 h-5" />
                ) : (
                  <div className="w-5 h-5 bg-primary rounded-full" />
                )}
              </div>
              <div>
                <CardTitle className="text-lg">{integration.name}</CardTitle>
                <CardDescription>{integration.source}</CardDescription>
              </div>
            </div>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(integration)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleTest}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Test Connection
                  </DropdownMenuItem>
                  {integration.source === "stellar-cyber" && (
                    <DropdownMenuItem onClick={handleSync}>
                      <Download className="h-4 w-4 mr-2" />
                      Sync Alerts
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Documentation
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <Dialog>
                    <DialogTrigger asChild>
                      <DropdownMenuItem className="text-red-500" onSelect={(e) => e.preventDefault()}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Delete Integration</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to delete the {integration.name} integration? This action cannot be
                          undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => document.body.click()}>
                          Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                          {isDeleting ? "Deleting..." : "Delete"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline" className={getTypeColor()}>
              {integration.type === "alert" ? "Alert" : "Log"}
            </Badge>
            <Badge variant="outline" className={getStatusColor()}>
              <span className="flex items-center gap-1">
                {getStatusIcon()}
                {getStatusText()}
              </span>
            </Badge>
            <Badge variant="outline">{safeMethod.toUpperCase()}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{integration.description || "No description available"}</p>
          {integration.lastSyncAt && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last synced: {new Date(integration.lastSyncAt).toLocaleString()}
            </p>
          )}

          {syncResult && (
            <div className={`mt-2 p-2 rounded text-sm ${syncResult.success ? "bg-green-500/10" : "bg-red-500/10"}`}>
              <p className={syncResult.success ? "text-green-600" : "text-red-600"}>
                {syncResult.message}
                {syncResult.count !== undefined && ` (${syncResult.count} alerts)`}
              </p>
            </div>
          )}
        </CardContent>
        {canManage && (
          <CardFooter className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(integration)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {integration.source === "stellar-cyber" ? (
              <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
                <Download className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync Alerts"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isTesting ? "animate-spin" : ""}`} />
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
            )}
          </CardFooter>
        )}
      </Card>
    </motion.div>
  )
}
