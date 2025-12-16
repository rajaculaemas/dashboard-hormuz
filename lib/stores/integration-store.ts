import { create } from "zustand"
import type { Integration } from "@/lib/types/integration"

interface IntegrationState {
  integrations: Integration[]
  isLoading: boolean
  error: string | null
  fetchIntegrations: () => Promise<void>
  addIntegration: (integration: Omit<Integration, "id" | "createdAt" | "updatedAt">) => Promise<void>
  updateIntegration: (id: string, updates: Partial<Integration>) => Promise<void>
  deleteIntegration: (id: string) => Promise<void>
  testIntegration: (id: string) => Promise<any>
  checkAllIntegrationsStatus: () => Promise<void>
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  integrations: [],
  isLoading: false,
  error: null,

  fetchIntegrations: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch("/api/integrations")
      const result = await response.json()

      if (result.success) {
        // Ensure we always have an array
        const integrations = Array.isArray(result.data) ? result.data : []
        set({ integrations, isLoading: false })
      } else {
        set({ integrations: [], error: result.error || "Failed to fetch integrations", isLoading: false })
      }
    } catch (error) {
      console.error("Error fetching integrations:", error)
      set({
        integrations: [],
        error: error instanceof Error ? error.message : "Failed to fetch integrations",
        isLoading: false,
      })
    }
  },

  addIntegration: async (integrationData) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(integrationData),
      })

      const result = await response.json()

      if (result.success) {
        const currentIntegrations = get().integrations || []
        set({
          integrations: [...currentIntegrations, result.data],
          isLoading: false,
        })
      } else {
        set({ error: result.error || "Failed to add integration", isLoading: false })
        throw new Error(result.error || "Failed to add integration")
      }
    } catch (error) {
      console.error("Error adding integration:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to add integration"
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  updateIntegration: async (id, updates) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`/api/integrations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const errorData = await response.json()
        set({ error: errorData.error || "Failed to update integration", isLoading: false })
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        const currentIntegrations = get().integrations || []
        set({
          integrations: currentIntegrations.map((integration) =>
            integration.id === id ? { ...integration, ...result.data } : integration,
          ),
          isLoading: false,
        })
      } else {
        set({ error: result.error || "Failed to update integration", isLoading: false })
        throw new Error(result.error || "Failed to update integration")
      }
    } catch (error) {
      console.error("Error updating integration:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to update integration"
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  deleteIntegration: async (id) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(`/api/integrations/${id}`, {
        method: "DELETE",
      })

      const result = await response.json()

      if (result.success) {
        const currentIntegrations = get().integrations || []
        set({
          integrations: currentIntegrations.filter((integration) => integration.id !== id),
          isLoading: false,
        })
      } else {
        set({ error: result.error || "Failed to delete integration", isLoading: false })
        throw new Error(result.error || "Failed to delete integration")
      }
    } catch (error) {
      console.error("Error deleting integration:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to delete integration"
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },

  testIntegration: async (id) => {
    try {
      const response = await fetch(`/api/integrations/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      })

      const result = await response.json()
      return result
    } catch (error) {
      console.error("Error testing integration:", error)
      throw error
    }
  },

  checkAllIntegrationsStatus: async () => {
    try {
      const response = await fetch("/api/integrations/status")
      const result = await response.json()

      if (Array.isArray(result)) {
        // Update integrations with latest status
        const currentIntegrations = get().integrations || []
        const updatedIntegrations = currentIntegrations.map((integration) => {
          const statusUpdate = result.find((s) => s.id === integration.id)
          return statusUpdate ? { ...integration, ...statusUpdate } : integration
        })
        set({ integrations: updatedIntegrations })
      }
    } catch (error) {
      console.error("Error checking integrations status:", error)
      // Don't set error state, just log it silently
    }
  },
}))
