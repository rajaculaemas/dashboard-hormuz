"use client"

import { useState, useEffect } from "react"
import { AnimatePresence } from "framer-motion"
import { Plus, Search, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IntegrationCard } from "@/components/integration/integration-card"
import { IntegrationForm } from "@/components/integration/integration-form"
import { AgentInstructions } from "@/components/integration/agent-instructions"
import { useIntegrationStore } from "@/lib/stores/integration-store"
import type { Integration } from "@/lib/types/integration"
import { useAuthStore } from "@/lib/stores/auth-store"

export default function IntegrationsPage() {
  const { integrations, loading, error, fetchIntegrations, checkAllIntegrationsStatus } = useIntegrationStore()
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "alert" | "log">("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [agentCredentials, setAgentCredentials] = useState({ key: "", secret: "" })
  const [refreshing, setRefreshing] = useState(false)
  const { user, setUser } = useAuthStore()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me")
        const data = await res.json()
        if (data?.user) {
          setUser(data.user)
          setIsAdmin(data.user.role === "administrator")
        } else {
          setIsAdmin(false)
        }
      } catch (err) {
        console.error("Failed to fetch current user", err)
        setIsAdmin(false)
      }
    }
    fetchUser()
  }, [setUser])

  useEffect(() => {
    fetchIntegrations()

    // Set up periodic status checks
    const statusInterval = setInterval(() => {
      checkAllIntegrationsStatus()
    }, 60000) // Check every minute

    return () => clearInterval(statusInterval)
  }, [fetchIntegrations, checkAllIntegrationsStatus])

  const handleRefresh = async () => {
    setRefreshing(true)
    await checkAllIntegrationsStatus()
    setRefreshing(false)
  }

  const handleAddIntegration = () => {
    setSelectedIntegration(null)
    setIsAddDialogOpen(true)
  }

  const handleEditIntegration = (integration: Integration) => {
    setSelectedIntegration(integration)
    setIsEditDialogOpen(true)
  }

  const handleAddDialogClose = () => {
    setIsAddDialogOpen(false)
    // Check if we need to show agent instructions
    const agentIntegration = integrations.find(
      (i) => i.method === "agent" && i.type === "log" && i.status === "connected",
    )
    if (agentIntegration) {
      const keyCredential = agentIntegration.credentials.find((c) => c.key === "AGENT_ID")
      const secretCredential = agentIntegration.credentials.find((c) => c.key === "AGENT_SECRET")
      if (keyCredential && secretCredential) {
        setAgentCredentials({
          key: keyCredential.value,
          secret: secretCredential.value,
        })
        setIsAgentDialogOpen(true)
      }
    }
  }

  const filteredIntegrations = integrations.filter((integration) => {
    const matchesSearch =
      searchTerm === "" ||
      integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      integration.source.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesTab = activeTab === "all" || integration.type === activeTab

    return matchesSearch && matchesTab
  })

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">Manage your alert and log integrations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Status
          </Button>
          {isAdmin && (
            <Button onClick={handleAddIntegration}>
              <Plus className="h-4 w-4 mr-2" />
              Add Integration
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-auto flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search integrations..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Tabs
          defaultValue="all"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "all" | "alert" | "log")}
          className="w-full md:w-auto"
        >
          <TabsList className="grid grid-cols-3 w-full md:w-[400px]">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="alert">Alert Sources</TabsTrigger>
            <TabsTrigger value="log">Log Sources</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <AnimatePresence>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-[200px] animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full mb-2"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredIntegrations.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No integrations found</CardTitle>
              <CardDescription>
                {searchTerm ? "Try adjusting your search or filters" : "Get started by adding your first integration"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center py-6">
              <Button onClick={handleAddIntegration}>
                <Plus className="h-4 w-4 mr-2" />
                Add Integration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                onEdit={handleEditIntegration}
                canManage={isAdmin}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Integration</DialogTitle>
            <DialogDescription>Connect your security tools and log sources to the SOC Dashboard</DialogDescription>
          </DialogHeader>
          <IntegrationForm onClose={handleAddDialogClose} />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Integration</DialogTitle>
            <DialogDescription>Update your integration settings and credentials</DialogDescription>
          </DialogHeader>
          {selectedIntegration && (
            <IntegrationForm integration={selectedIntegration} onClose={() => setIsEditDialogOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agent Installation</DialogTitle>
            <DialogDescription>Follow these instructions to install the log collection agent</DialogDescription>
          </DialogHeader>
          <AgentInstructions agentKey={agentCredentials.key} agentSecret={agentCredentials.secret} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
