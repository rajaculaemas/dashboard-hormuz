"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Bell } from "lucide-react"
import { SafeDate } from "@/components/ui/safe-date"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

interface AlertTableProps {
  alerts: any[]
  loading: boolean
  selectedAlerts: string[]
  availableIntegrations: any[]
  canUpdateAlert: boolean
  onSelectAlert: (checked: boolean, alertId: string) => void
  onViewDetails: (alert: any) => void
  onUpdateStatus: (alert: any) => void
}

export function AlertTable({
  alerts,
  loading,
  selectedAlerts,
  availableIntegrations,
  canUpdateAlert,
  onSelectAlert,
  onViewDetails,
  onUpdateStatus,
}: AlertTableProps) {
  const severityColor = (severity: string | null | undefined) => {
    switch (severity) {
      case "Critical":
        return "bg-red-500/10 text-red-500"
      case "High":
        return "bg-orange-500/10 text-orange-500"
      case "Medium":
        return "bg-yellow-500/10 text-yellow-500"
      case "Low":
        return "bg-blue-500/10 text-blue-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "New":
        return "bg-red-500/10 text-red-500"
      case "In Progress":
        return "bg-yellow-500/10 text-yellow-500"
      case "Ignored":
        return "bg-gray-500/10 text-gray-500"
      case "Closed":
        return "bg-green-500/10 text-green-500"
      default:
        return "bg-blue-500/10 text-blue-500"
    }
  }

  const getIntegrationName = (alert: any) => {
    const integration = availableIntegrations.find((i) =>
      i.id === alert.integrationId || i.id === alert.integration_id || i.id === alert.integration?.id,
    )
    return integration?.name || "Unknown"
  }

  if (loading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Alert Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Tactic</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Monitored Tenants</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-4" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="h-8 w-20" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="border rounded-lg p-12 text-center">
        <Bell className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
        <h3 className="text-lg font-medium">No alerts found</h3>
        <p className="text-muted-foreground">There are no alerts matching your current filter.</p>
      </div>
    )
  }

  return (
    <AnimatePresence>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedAlerts.length > 0 && selectedAlerts.length === alerts.length}
                  indeterminate={selectedAlerts.length > 0 && selectedAlerts.length < alerts.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      // Select all visible alerts
                      const allIds = alerts.filter(a => !a.metadata?.qradar).map(a => a.id)
                      // Preserve existing selections and add new ones
                      const combined = Array.from(new Set([...selectedAlerts, ...allIds]))
                      // Manually trigger change by calling onSelectAlert for each new one
                      const toAdd = allIds.filter(id => !selectedAlerts.includes(id))
                      toAdd.forEach(id => onSelectAlert(true, id))
                    } else {
                      // Deselect all visible alerts
                      const allIds = alerts.filter(a => !a.metadata?.qradar).map(a => a.id)
                      allIds.forEach(id => onSelectAlert(false, id))
                    }
                  }}
                />
              </TableHead>
              <TableHead>Alert Type</TableHead>
              <TableHead className="text-right">Critical</TableHead>
              <TableHead className="text-right">High Fidelity</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Tactic</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Monitored Tenants</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((alert) => (
              <motion.tr
                key={alert.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="hover:bg-muted/50 transition-colors"
              >
                <TableCell>
                  {!alert.metadata?.qradar && canUpdateAlert && (
                    <Checkbox
                      checked={selectedAlerts.includes(alert.id)}
                      onCheckedChange={(checked) => onSelectAlert(checked as boolean, alert.id)}
                    />
                  )}
                </TableCell>
                <TableCell className="font-medium max-w-xs truncate">
                  {alert.title || alert.metadata?.rule?.description || alert.metadata?.ruleDescription || "Unknown Alert"}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="font-mono">
                    {alerts.filter(a => a.severity === "Critical").length}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="font-mono">
                    {alerts.filter(a => a.severity === "High").length}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="font-mono">
                    {alerts.length}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {alert.metadata?.stage || alert.metadata?.stage_name || "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {alert.metadata?.mitreTactic || alert.metadata?.tactic || "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(alert.metadata?.tags || []).slice(0, 2).map((tag: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {(alert.metadata?.tags || []).length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{(alert.metadata?.tags || []).length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {getIntegrationName(alert)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails(alert)}
                      className="h-8 px-2 text-blue-500 hover:text-blue-700"
                    >
                      View
                    </Button>
                    {canUpdateAlert && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onUpdateStatus(alert)}
                        className="h-8 px-2"
                      >
                        ⋯
                      </Button>
                    )}
                  </div>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </AnimatePresence>
  )
}
