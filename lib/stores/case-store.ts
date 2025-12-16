import { create } from "zustand"
import type { DatabaseCase } from "@/lib/types/case"

interface CaseFilters {
  timeRange: string
  status?: string | null
  severity?: string | null
  assignee?: string | null
}

interface CaseStats {
  total: number
  open: number
  inProgress: number
  resolved: number
  critical: number
  avgMttd: number
}

interface CaseStore {
  cases: DatabaseCase[]
  stats: CaseStats
  loading: boolean
  error: string | null
  filters: CaseFilters
  fetchCases: () => Promise<void>
  syncCases: (integrationId: string) => Promise<void>
  updateCase: (caseId: string, updates: any) => Promise<void>
  setFilters: (filters: Partial<CaseFilters>) => void
}

export const useCaseStore = create<CaseStore>((set, get) => ({
  cases: [],
  stats: {
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    critical: 0,
    avgMttd: 0,
  },
  loading: false,
  error: null,
  filters: {
    timeRange: "24h",
  },

  fetchCases: async () => {
    try {
      set({ loading: true, error: null })
      const { filters } = get()

      const params = new URLSearchParams({
        time_range: filters.timeRange,
      })

      if (filters.status) params.append("status", filters.status)
      if (filters.severity) params.append("severity", filters.severity)
      if (filters.assignee) params.append("assignee", filters.assignee)

      const response = await fetch(`/api/cases?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        set({
          cases: data.data || [],
          stats: data.stats || {
            total: 0,
            open: 0,
            inProgress: 0,
            resolved: 0,
            critical: 0,
            avgMttd: 0,
          },
          loading: false,
        })
      } else {
        set({ error: data.error || "Failed to fetch cases", loading: false })
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Failed to fetch cases",
        loading: false,
      })
    }
  },

  syncCases: async (integrationId: string) => {
    try {
      const response = await fetch("/api/cases/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ integrationId }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to sync cases")
      }

      return data
    } catch (error) {
      throw error
    }
  },

  updateCase: async (caseId: string, updates: any) => {
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to update case")
      }

      // Refresh cases after update
      await get().fetchCases()

      return data
    } catch (error) {
      throw error
    }
  },

  setFilters: (newFilters: Partial<CaseFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }))
  },
}))
