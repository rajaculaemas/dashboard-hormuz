import { create } from "zustand"
import type { StellarCyberAlert, AlertStatus } from "@/lib/config/stellar-cyber"

interface AlertFilters {
  timeRange: "1h" | "2h" | "3h" | "6h" | "12h" | "24h" | "7d" | "all"
  status: AlertStatus | "all"
  severity: string | "all"
  source: string | "all"
}

interface AlertStore {
  alerts: StellarCyberAlert[]
  loading: boolean
  error: string | null
  activeTab: AlertStatus | "all"
  filters: AlertFilters
  searchQuery: string
  autoRefresh: boolean
  refreshInterval: NodeJS.Timeout | null
  lastSync: Date | null
  selectedIntegration: string | null
  setSelectedIntegration: (id: string | null) => void
  initializeDefaultIntegration: (integrations: any[]) => void

  // Actions
  setAlerts: (alerts: StellarCyberAlert[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setActiveTab: (tab: AlertStatus | "all") => void
  setFilters: (filters: Partial<AlertFilters>) => void
  setSearchQuery: (query: string) => void
  setAutoRefresh: (enabled: boolean) => void

  // API Actions
  fetchAlerts: () => Promise<void>
  syncAlerts: (integrationId: string) => Promise<void>
  updateAlertStatus: (params: { alertId: string; status: AlertStatus; comments?: string }) => Promise<void>
  startAutoRefresh: () => void
  stopAutoRefresh: () => void
  autoSyncAllIntegrations: () => Promise<any>

  // Computed
  getFilteredAlerts: () => StellarCyberAlert[]
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  loading: false,
  error: null,
  activeTab: "all",
  filters: {
    timeRange: "12h",
    status: "New",
    severity: "all",
    source: "all",
  },
  searchQuery: "",
  autoRefresh: false,
  refreshInterval: null,
  lastSync: null,
  selectedIntegration: null,

  setSelectedIntegration: (id) => set({ selectedIntegration: id }),

  initializeDefaultIntegration: (integrations) => {
    const stellarIntegration = integrations.find(
      (i) => i.source === "stellar-cyber" && i.status === "connected"
    )
    if (stellarIntegration) {
      set({ selectedIntegration: stellarIntegration.id })
    }
  },

  setAlerts: (alerts) => set({ alerts, lastSync: new Date() }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAutoRefresh: (autoRefresh) => {
    const { startAutoRefresh, stopAutoRefresh, selectedIntegration } = get()

    set({ autoRefresh })
    if (autoRefresh && selectedIntegration) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  },

  fetchAlerts: async () => {
    const { setLoading, setError, setAlerts, filters, selectedIntegration } = get()

    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()

      if (selectedIntegration) {
        params.append("integrationId", selectedIntegration)
      }

      if (filters.timeRange !== "all") {
        const hours = {
          "1h": 1,
          "2h": 2,
          "3h": 3,
          "6h": 6,
          "12h": 12,
          "24h": 24,
          "7d": 168,
        }[filters.timeRange]

        const fromTime = new Date(Date.now() - (hours || 24) * 60 * 60 * 1000).toISOString()
        params.append("from", fromTime)
      }

      if (filters.status !== "all") {
        params.append("status", filters.status)
      }

      if (filters.severity !== "all") {
        params.append("severity", filters.severity)
      }

      const response = await fetch(`/api/alerts?${params.toString()}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch alerts: ${response.statusText}`)
      }

      const data = await response.json()
      setAlerts(data.data || data.alerts || [])
    } catch (error) {
      console.error("Error fetching alerts:", error)
      setError(error instanceof Error ? error.message : "Failed to fetch alerts")
    } finally {
      setLoading(false)
    }
  },

  syncAlerts: async (integrationId: string) => {
    const { setLoading, setError, fetchAlerts } = get()

    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/alerts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to sync alerts")
      }

      const data = await response.json()
      await fetchAlerts()
      return data
    } catch (error) {
      console.error("Error syncing alerts:", error)
      setError(error instanceof Error ? error.message : "Failed to sync alerts")
      throw error
    } finally {
      setLoading(false)
    }
  },

  updateAlertStatus: async (params) => {
    const { fetchAlerts } = get()

    try {
      const response = await fetch("/api/alerts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      if (!response.ok) {
        throw new Error("Failed to update alert status")
      }

      await fetchAlerts()
    } catch (error) {
      console.error("Error updating alert status:", error)
      throw error
    }
  },

  autoSyncAllIntegrations: async () => {
    const { setLoading, setError, fetchAlerts } = get()

    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/alerts/auto-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to auto-sync alerts")
      }

      const result = await response.json()
      console.log("Auto-sync result:", result)

      await fetchAlerts()
      return result
    } catch (error) {
      console.error("Error in auto-sync:", error)
      setError(error instanceof Error ? error.message : "Failed to auto-sync alerts")
      throw error
    } finally {
      setLoading(false)
    }
  },

  startAutoRefresh: () => {
    const { refreshInterval, fetchAlerts, syncAlerts, selectedIntegration } = get()

    if (refreshInterval) clearInterval(refreshInterval)

    const newInterval = setInterval(async () => {
      try {
        await fetchAlerts()
        if (selectedIntegration) {
          await syncAlerts(selectedIntegration)
        }
      } catch (error) {
        console.error("Auto-refresh error:", error)
      }
    }, 3 * 60 * 1000)

    set({ refreshInterval: newInterval })
  },

  stopAutoRefresh: () => {
    const { refreshInterval } = get()

    if (refreshInterval) {
      clearInterval(refreshInterval)
      set({ refreshInterval: null })
    }
  },

  getFilteredAlerts: () => {
    const { alerts, activeTab, searchQuery } = get()
    const lowerSearchQuery = searchQuery.toLowerCase().trim()
    
    let filtered = alerts
    
    // Apply status filter
    if (activeTab !== "all") {
      filtered = filtered.filter((alert) => alert.status === activeTab)
    }
    
    // Apply search filter if query is not empty
    if (lowerSearchQuery) {
      filtered = filtered.filter((alert) => {
        const searchableText = [
          alert.title,
          alert.description,
          alert.metadata?.assignee,
          alert.metadata?.srcip,
          alert.metadata?.dstip,
          alert.metadata?.alert_type,
          alert.source,
          alert.id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        
        return searchableText.includes(lowerSearchQuery)
      })
    }
    
    return filtered
  },
}))
