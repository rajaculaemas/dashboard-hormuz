"use client"

import { useState } from "react"
import { Clock, Search, ChevronDown, ChevronUp, FileText, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface TimelineEvent {
  id: string
  title: string
  description: string
  timestamp: string
  type: "alert" | "action" | "artifact" | "note"
  severity?: "critical" | "high" | "medium" | "low"
  user?: {
    name: string
    avatar?: string
  }
  metadata?: Record<string, any>
}

interface Incident {
  id: string
  title: string
  status: "open" | "investigating" | "contained" | "eradicated" | "recovered" | "closed"
  severity: "critical" | "high" | "medium" | "low"
  createdAt: string
  updatedAt: string
  assignee?: {
    name: string
    avatar?: string
  }
  events: TimelineEvent[]
}

export default function IncidentTimelinePage() {
  const [incidents] = useState<Incident[]>([
    {
      id: "INC-001",
      title: "Ransomware Attack on Finance Department",
      status: "contained",
      severity: "critical",
      createdAt: "2023-05-15T08:30:00Z",
      updatedAt: "2023-05-15T14:45:00Z",
      assignee: {
        name: "Alex Johnson",
        avatar: "/placeholder.svg?height=40&width=40",
      },
      events: [
        {
          id: "event-1",
          title: "Initial Alert: Suspicious Encryption Activity",
          description: "Multiple file encryption attempts detected on finance department workstations",
          timestamp: "2023-05-15T08:30:00Z",
          type: "alert",
          severity: "critical",
          metadata: {
            source: "EDR",
            affectedSystems: ["FINANCE-PC-01", "FINANCE-PC-03", "FINANCE-PC-07"],
          },
        },
        {
          id: "event-2",
          title: "Isolation of Affected Systems",
          description: "Finance department workstations isolated from the network",
          timestamp: "2023-05-15T08:45:00Z",
          type: "action",
          user: {
            name: "Alex Johnson",
            avatar: "/placeholder.svg?height=40&width=40",
          },
        },
        {
          id: "event-3",
          title: "Malware Sample Collected",
          description: "Ransomware binary extracted for analysis",
          timestamp: "2023-05-15T09:15:00Z",
          type: "artifact",
          user: {
            name: "Morgan Smith",
            avatar: "/placeholder.svg?height=40&width=40",
          },
          metadata: {
            fileHash: "5f2b7f93a6a697a7f5b47d12c2f6e8e0",
            fileSize: "256KB",
          },
        },
        {
          id: "event-4",
          title: "Ransomware Family Identified",
          description: "Malware identified as LockBit 3.0 variant",
          timestamp: "2023-05-15T10:30:00Z",
          type: "note",
          user: {
            name: "Morgan Smith",
            avatar: "/placeholder.svg?height=40&width=40",
          },
        },
        {
          id: "event-5",
          title: "Containment Measures Implemented",
          description: "Updated firewall rules and deployed emergency EDR policy",
          timestamp: "2023-05-15T11:45:00Z",
          type: "action",
          user: {
            name: "Alex Johnson",
            avatar: "/placeholder.svg?height=40&width=40",
          },
        },
        {
          id: "event-6",
          title: "Backup Restoration Initiated",
          description: "Started restoring finance department data from offline backups",
          timestamp: "2023-05-15T13:20:00Z",
          type: "action",
          user: {
            name: "Jamie Williams",
            avatar: "/placeholder.svg?height=40&width=40",
          },
        },
        {
          id: "event-7",
          title: "Incident Contained",
          description: "No further encryption activity detected. Containment confirmed.",
          timestamp: "2023-05-15T14:45:00Z",
          type: "note",
          user: {
            name: "Alex Johnson",
            avatar: "/placeholder.svg?height=40&width=40",
          },
        },
      ],
    },
  ])

  const [selectedIncident, setSelectedIncident] = useState<string>(incidents[0]?.id || "")
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({})
  const [filterType, setFilterType] = useState<string>("all")

  const currentIncident = incidents.find((inc) => inc.id === selectedIncident)

  const toggleEventExpansion = (id: string) => {
    setExpandedEvents((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const filteredEvents =
    currentIncident?.events.filter((event) => filterType === "all" || event.type === filterType) || []

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "alert":
        return <Badge variant="destructive">Alert</Badge>
      case "action":
        return <Badge variant="default">Action</Badge>
      case "artifact":
        return <Badge variant="secondary">Artifact</Badge>
      case "note":
        return <Badge variant="outline">Note</Badge>
      default:
        return null
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-500"
      case "high":
        return "text-orange-500"
      case "medium":
        return "text-yellow-500"
      case "low":
        return "text-blue-500"
      default:
        return "text-gray-500"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-red-500/10 text-red-500"
      case "investigating":
        return "bg-orange-500/10 text-orange-500"
      case "contained":
        return "bg-yellow-500/10 text-yellow-500"
      case "eradicated":
        return "bg-blue-500/10 text-blue-500"
      case "recovered":
        return "bg-purple-500/10 text-purple-500"
      case "closed":
        return "bg-green-500/10 text-green-500"
      default:
        return "bg-gray-500/10 text-gray-500"
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incident Timeline</h1>
          <p className="text-muted-foreground">Chronological view of security incident events and responses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <FileText className="h-4 w-4 mr-2" />
            Report
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Incident Details</CardTitle>
              <CardDescription>Current status and information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentIncident && (
                <>
                  <div>
                    <h3 className="text-lg font-medium">{currentIncident.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={getStatusColor(currentIncident.status)}>
                        {currentIncident.status}
                      </Badge>
                      <span className={`text-sm font-medium ${getSeverityColor(currentIncident.severity)}`}>
                        {currentIncident.severity} severity
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Incident ID</div>
                    <div className="font-mono">{currentIncident.id}</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Created</div>
                    <div>{new Date(currentIncident.createdAt).toLocaleString()}</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Last Updated</div>
                    <div>{new Date(currentIncident.updatedAt).toLocaleString()}</div>
                  </div>

                  {currentIncident.assignee && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Assigned To</div>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={currentIncident.assignee.avatar || "/placeholder.svg"} />
                          <AvatarFallback>{currentIncident.assignee.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{currentIncident.assignee.name}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Timeline Events</div>
                    <div className="text-2xl font-bold">{currentIncident.events.length}</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Related Incidents</CardTitle>
              <CardDescription>Similar or connected incidents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6 text-muted-foreground">No related incidents found</div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Timeline</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input type="search" placeholder="Search timeline..." className="pl-8" />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    <SelectItem value="alert">Alerts</SelectItem>
                    <SelectItem value="action">Actions</SelectItem>
                    <SelectItem value="artifact">Artifacts</SelectItem>
                    <SelectItem value="note">Notes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6 border-l-2 border-muted space-y-6">
                {filteredEvents.map((event, index) => (
                  <Collapsible
                    key={event.id}
                    open={expandedEvents[event.id]}
                    onOpenChange={() => toggleEventExpansion(event.id)}
                    className="relative"
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-[25px] h-4 w-4 rounded-full bg-primary border-4 border-background" />

                    <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(event.timestamp).toLocaleString()}</span>
                    </div>

                    <div className="border rounded-lg overflow-hidden">
                      <div className="p-4 hover:bg-accent/50 transition-colors cursor-pointer">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {getEventTypeIcon(event.type)}
                              {event.severity && (
                                <span className={`text-xs font-medium ${getSeverityColor(event.severity)}`}>
                                  {event.severity} severity
                                </span>
                              )}
                            </div>
                            <h3 className="font-medium">{event.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                          </div>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm">
                              {expandedEvents[event.id] ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>

                        {event.user && (
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={event.user.avatar || "/placeholder.svg"} />
                              <AvatarFallback>{event.user.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span>{event.user.name}</span>
                          </div>
                        )}
                      </div>

                      <CollapsibleContent>
                        {event.metadata && (
                          <div className="p-4 pt-0 border-t bg-muted/50">
                            <h4 className="font-medium mb-2">Additional Details</h4>
                            <pre className="bg-background p-2 rounded-md text-xs overflow-x-auto">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
