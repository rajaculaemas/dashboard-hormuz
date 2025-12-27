"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { RefreshCw, CheckCircle, XCircle, Clock, ChevronDown } from "lucide-react"
import { useIntegrationStore } from "@/lib/stores/integration-store"
import { SafeDate } from "@/components/ui/safe-date"

export function SyncStatus() {
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())
  const [lastAutoSync, setLastAutoSync] = useState<Date | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const allIntegrations = integrations.filter(
    (i) => i.source === "stellar-cyber" || i.source === "qradar" || i.source === "wazuh"
  )
  const connectedCount = allIntegrations.filter((i) => i.status === "connected").length

  const handleManualSyncAll = async () => {
    try {
      setSyncingIds(new Set(allIntegrations.map(i => i.id)))

      const response = await fetch("/api/alerts/auto-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (response.ok) {
        setLastAutoSync(new Date())
        await fetchIntegrations()
      }
    } catch (error) {
      console.error("Manual sync failed:", error)
    } finally {
      setSyncingIds(new Set())
    }
  }

  const handleSyncIntegration = async (integrationId: string) => {
    try {
      setSyncingIds(prev => new Set([...prev, integrationId]))

      const integration = integrations.find(i => i.id === integrationId)
      const isWazuh = integration?.source === "wazuh"
      const endpoint = isWazuh ? "/api/alerts/wazuh/sync" : "/api/alerts/sync"

      // Untuk Wazuh, kirim resetCursor dan hoursBack di body agar API bisa baca langsung
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      let body: any = { integrationId }
      if (isWazuh) {
        body.resetCursor = true
        body.hoursBack = 3
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })

      if (response.ok) {
        setLastAutoSync(new Date())
        await fetchIntegrations()
      }
    } catch (error) {
      console.error(`Sync failed for integration ${integrationId}:`, error)
    } finally {
      setSyncingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(integrationId)
        return newSet
      })
    }
  }

  useEffect(() => {
    fetchIntegrations()
  }, [])

  if (allIntegrations.length === 0) {
    return null
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Integration Status</span>
            <Badge variant="secondary" className="text-xs">
              {connectedCount}/{allIntegrations.length}
            </Badge>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
        {/* Integration List */}
        <div className="space-y-2">
          {allIntegrations.map((integration) => (
            <div 
              key={integration.id} 
              className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700"
            >
              {/* Left side - Status and Name */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {integration.status === "connected" ? (
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{integration.name}</span>
                    <Badge 
                      variant={integration.status === "connected" ? "default" : "destructive"} 
                      className="text-xs"
                    >
                      {integration.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Middle - Last Sync */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                <Clock className="h-3 w-3" />
                {integration.lastSyncAt ? (
                  <SafeDate date={integration.lastSyncAt} />
                ) : (
                  <span>Never</span>
                )}
              </div>

              {/* Right side - Sync Button */}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => handleSyncIntegration(integration.id)}
                disabled={syncingIds.has(integration.id) || integration.status !== "connected"}
                className="flex-shrink-0"
              >
                <RefreshCw 
                  className={`h-3.5 w-3.5 ${syncingIds.has(integration.id) ? "animate-spin" : ""}`} 
                />
              </Button>
            </div>
          ))}
        </div>

        {/* Sync All Button */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex-1">
            {lastAutoSync && (
              <span className="text-xs text-muted-foreground">
                Last sync: <SafeDate date={lastAutoSync.toISOString()} />
              </span>
            )}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleManualSyncAll}
            disabled={syncingIds.size > 0}
            className="ml-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingIds.size > 0 ? "animate-spin" : ""}`} />
            Sync All
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

