"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, Filter, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { SafeDate } from "@/components/ui/safe-date"

interface WazuhCase {
  id: string
  status: string
  severity: string
  alertCount: number
  description?: string
  createdAt: string
  updatedAt: string
  resolvedAt?: string
  assignee?: {
    id: string
    name?: string
    email: string
  }
}

export default function WazuhTicketingPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState<WazuhCase[]>([])
  const [filtering, setFiltering] = useState(false)
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [severityFilter, setSeverityFilter] = useState<string>("")
  const [assigneeFilter, setAssigneeFilter] = useState<string>("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const loadCases = async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("limit", String(pageSize))
      
      if (statusFilter) params.set("status", statusFilter)
      if (severityFilter) params.set("severity", severityFilter)
      if (assigneeFilter) params.set("assigneeId", assigneeFilter)

      const response = await fetch(`/api/wazuh/cases?${params}`)
      if (!response.ok) {
        throw new Error("Failed to load cases")
      }

      const data = await response.json()
      setCases(data.cases)
      setCurrentPage(data.pagination.page)
      setTotalPages(data.pagination.totalPages)
      setTotal(data.pagination.total)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load cases",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCases(1)
  }, [])

  const handleFilterChange = () => {
    setFiltering(true)
    loadCases(1).finally(() => setFiltering(false))
  }

  const handleResetFilters = () => {
    setStatusFilter("")
    setSeverityFilter("")
    setAssigneeFilter("")
    setCurrentPage(1)
    setFiltering(true)
    loadCases(1).finally(() => setFiltering(false))
  }

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "critical":
        return "destructive"
      case "high":
        return "default"
      case "medium":
        return "secondary"
      default:
        return "outline"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
        return "secondary"
      case "in_progress":
        return "default"
      case "resolved":
        return "outline"
      default:
        return "secondary"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Wazuh Ticketing System</h1>
            <p className="text-muted-foreground mt-1">Manage security cases and incidents</p>
          </div>
          <Button size="lg" className="gap-2">
            <Plus className="h-4 w-4" />
            New Case
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Filters</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status-filter">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severity-filter">Severity</Label>
                <Select value={severityFilter} onValueChange={setSeverityFilter}>
                  <SelectTrigger id="severity-filter">
                    <SelectValue placeholder="All severities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All severities</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 items-end">
                <Button onClick={handleFilterChange} disabled={filtering} size="sm">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={handleResetFilters} disabled={filtering} variant="outline" size="sm">
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cases List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Cases ({total})
            </h2>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="text-sm border rounded px-2 py-1"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="h-20 animate-pulse bg-muted" />
              ))}
            </div>
          ) : cases.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No cases found
              </CardContent>
            </Card>
          ) : (
            <motion.div className="space-y-3" layout>
              {cases.map((wazuhCase) => (
                <motion.div
                  key={wazuhCase.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Link href={`/dashboard/ticketing/${wazuhCase.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Case ID</p>
                            <p className="font-mono text-sm">{wazuhCase.id.slice(0, 8)}</p>
                          </div>
                          
                          <div>
                            <p className="text-sm text-muted-foreground">Status</p>
                            <Badge variant={getStatusColor(wazuhCase.status)}>
                              {wazuhCase.status === "in_progress" ? "In Progress" : wazuhCase.status}
                            </Badge>
                          </div>

                          <div>
                            <p className="text-sm text-muted-foreground">Severity</p>
                            <Badge variant={getSeverityColor(wazuhCase.severity)}>
                              {wazuhCase.severity}
                            </Badge>
                          </div>

                          <div>
                            <p className="text-sm text-muted-foreground">Alerts</p>
                            <p className="font-semibold">{wazuhCase.alertCount}</p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Created</p>
                            <p className="text-sm">
                              <SafeDate date={wazuhCase.createdAt} />
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    const newPage = Math.max(1, currentPage - 1)
                    setCurrentPage(newPage)
                    loadCases(newPage)
                  }}
                  disabled={currentPage === 1}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </Button>
                <Button
                  onClick={() => {
                    const newPage = Math.min(totalPages, currentPage + 1)
                    setCurrentPage(newPage)
                    loadCases(newPage)
                  }}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
