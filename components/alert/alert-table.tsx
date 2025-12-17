"use client"

import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Bell } from "lucide-react"
import { SafeDate } from "@/components/ui/safe-date"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { AlertColumn } from "@/components/alert/alert-column-selector"

interface AlertTableProps {
  alerts: any[]
  loading: boolean
  selectedAlerts: string[]
  availableIntegrations: any[]
  canUpdateAlert: boolean
  columns: AlertColumn[]
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
  columns,
  onSelectAlert,
  onViewDetails,
  onUpdateStatus,
}: AlertTableProps) {
  // Debug: Log alert structure on first render or when alerts change
  useEffect(() => {
    if (alerts.length > 0) {
      console.log('[AlertTable] First alert structure:', {
        id: alerts[0].id,
        title: alerts[0].title,
        metadata: alerts[0].metadata,
        topLevelFields: Object.keys(alerts[0]).filter(k => !['metadata', 'integration', 'id', 'title', 'description'].includes(k)),
      })
    }
  }, [alerts])

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

  const calculateMTTD = (alert: any) => {
    try {
      const alertTime = new Date(alert.timestamp || alert.created_at)
      const updatedTime = new Date(alert.updatedAt || alert.updated_at || Date.now())
      
      if (!alertTime.getTime()) return "-"
      
      const diffMs = updatedTime.getTime() - alertTime.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      
      if (diffMins < 1) return "< 1m"
      if (diffMins < 60) return `${diffMins}m`
      
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}h`
      
      const diffDays = Math.floor(diffHours / 24)
      return `${diffDays}d`
    } catch {
      return "-"
    }
  }

  const getColumnValue = (alert: any, columnId: string) => {
    switch (columnId) {
      case "timestamp":
        return <SafeDate date={alert.timestamp || alert.created_at} />

      case "title":
        return alert.title || alert.metadata?.rule?.description || alert.metadata?.ruleDescription || alert.description || "Unknown"

      case "srcip":
        // Wazuh stores as metadata.srcIp (camelCase) - check that first
        return (
          alert.metadata?.srcIp ||  // Wazuh primary
          alert.metadata?.srcip || 
          alert.metadata?.source_ip ||
          alert.metadata?.src_ip ||
          alert.metadata?.sourceAddress ||
          alert.srcIp ||  // Top level
          alert.srcip ||
          "-"
        )

      case "dstip":
        // Wazuh stores as metadata.dstIp (camelCase) - check that first
        return (
          alert.metadata?.dstIp ||  // Wazuh primary
          alert.metadata?.dstip || 
          alert.metadata?.destination_ip ||
          alert.metadata?.dst_ip ||
          alert.metadata?.destinationAddress ||
          alert.dstIp ||  // Top level
          alert.dstip ||
          "-"
        )

      case "responseCode":
        return (
          alert.metadata?.http_status_code ||
          alert.metadata?.status_code ||
          alert.metadata?.response_code ||
          alert.metadata?.responseCode ||
          alert.metadata?.status ||
          "-"
        )

      case "integration":
        return getIntegrationName(alert)

      case "mttd":
        return calculateMTTD(alert)

      case "severity":
        return (
          <Badge variant="outline" className={severityColor(alert.severity)}>
            {alert.severity || "-"}
          </Badge>
        )

      case "status":
        return (
          <Badge variant="outline" className={statusColor(alert.status)}>
            {alert.status || "-"}
          </Badge>
        )

      case "sourcePort":
        // Wazuh stores as metadata.srcPort (camelCase)
        return (
          alert.metadata?.srcPort ||  // Wazuh primary
          alert.metadata?.srcport ||
          alert.metadata?.src_port ||
          alert.metadata?.source_port ||
          alert.srcPort ||
          "-"
        )

      case "destinationPort":
        // Wazuh stores as metadata.dstPort (camelCase)
        return (
          alert.metadata?.dstPort ||  // Wazuh primary
          alert.metadata?.dstport ||
          alert.metadata?.dst_port ||
          alert.metadata?.destination_port ||
          alert.dstPort ||
          "-"
        )

      case "protocol":
        // Wazuh stores as metadata.protocol
        return (
          alert.metadata?.protocol ||
          alert.metadata?.http_method ||
          alert.protocol ||
          "-"
        )

      case "agentName":
        return (
          alert.metadata?.agent?.name ||
          alert.metadata?.agentName ||
          alert.metadata?.agent_name ||
          alert.agent?.name ||
          "-"
        )

      case "agentIp":
        return (
          alert.metadata?.agent?.ip ||
          alert.metadata?.agentIp ||
          alert.metadata?.agent_ip ||
          alert.agent?.ip ||
          "-"
        )

      case "rule":
        return (
          alert.metadata?.rule?.description ||
          alert.metadata?.ruleDescription ||
          alert.metadata?.rule_description ||
          alert.rule?.description ||
          "-"
        )

      case "mitreTactic":
        return (
          alert.metadata?.rule?.mitre?.tactic?.[0] ||
          alert.metadata?.mitreTactic ||
          alert.metadata?.mitre_tactic ||
          alert.rule?.mitre?.tactic?.[0] ||
          "-"
        )

      case "mitreId":
        return (
          alert.metadata?.rule?.mitre?.id?.[0] ||
          alert.metadata?.mitreId ||
          alert.metadata?.mitre_id ||
          alert.rule?.mitre?.id?.[0] ||
          "-"
        )

      case "tags":
        const tags = alert.metadata?.tags || alert.tags || []
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((tag: string, idx: number) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{tags.length - 2}
              </Badge>
            )}
          </div>
        )

      default:
        return "-"
    }
  }

  const visibleColumns = columns.filter((col) => col.visible)

  if (loading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              {visibleColumns.map((col) => (
                <TableHead key={col.id}>{col.label}</TableHead>
              ))}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-4 w-4" />
                </TableCell>
                {visibleColumns.map((col) => (
                  <TableCell key={col.id}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
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
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedAlerts.length > 0 && selectedAlerts.length === alerts.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const allIds = alerts.filter(a => !a.metadata?.qradar).map(a => a.id)
                      const toAdd = allIds.filter(id => !selectedAlerts.includes(id))
                      toAdd.forEach(id => onSelectAlert(true, id))
                    } else {
                      const allIds = alerts.filter(a => !a.metadata?.qradar).map(a => a.id)
                      allIds.forEach(id => onSelectAlert(false, id))
                    }
                  }}
                />
              </TableHead>
              {visibleColumns.map((col) => (
                <TableHead key={col.id}>{col.label}</TableHead>
              ))}
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
                {visibleColumns.map((col) => (
                  <TableCell key={col.id} className="max-w-xs truncate">
                    {getColumnValue(alert, col.id)}
                  </TableCell>
                ))}
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
