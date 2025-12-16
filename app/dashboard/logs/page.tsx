"use client"

import { useState, useEffect } from "react"
import { Search, Download, RefreshCw, ChevronDown, ChevronUp, Brain } from "lucide-react"
import { type LogEntry, fetchLogs } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { log2nlp, type Log2NLPResult } from "@/lib/log2nlp"
import { Log2NLPResults } from "@/components/log-analysis/log2nlp-results"
import { DateRangePicker } from "@/components/ui/date-range-picker"

export default function LogExplorerPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [levelFilter, setLevelFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [timeRange, setTimeRange] = useState<string>("24h")
  const [useAbsoluteDate, setUseAbsoluteDate] = useState(false)
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>(undefined)
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [useNLP, setUseNLP] = useState(true)
  const [nlpResults, setNlpResults] = useState<Log2NLPResult | null>(null)
  const [processingNLP, setProcessingNLP] = useState(false)

  const loadLogs = async () => {
    try {
      setRefreshing(true)
      const data = await fetchLogs()
      setLogs(data)

      // Process logs with Log2NLP if enabled
      if (useNLP) {
        processLogsWithNLP(data)
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error)
    } finally {
      setRefreshing(false)
    }
  }

  const processLogsWithNLP = async (logsToProcess: LogEntry[]) => {
    try {
      setProcessingNLP(true)
      const results = await log2nlp.processLogs(logsToProcess)
      setNlpResults(results)
    } catch (error) {
      console.error("Error processing logs with Log2NLP:", error)
    } finally {
      setProcessingNLP(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  // When NLP toggle changes, process logs if enabled
  useEffect(() => {
    if (useNLP && logs.length > 0 && !nlpResults) {
      processLogsWithNLP(logs)
    }
  }, [useNLP, logs])

  const toggleLogExpansion = (id: string) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      searchTerm === "" ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(log.metadata).toLowerCase().includes(searchTerm.toLowerCase())

    const matchesLevel = levelFilter === "all" || log.level === levelFilter
    const matchesSource = sourceFilter === "all" || log.source === sourceFilter

    // Date range filter
    let matchesDateRange = true
    if (useAbsoluteDate && dateRange) {
      const logTime = new Date(log.timestamp || 0).getTime()
      const fromTime = dateRange.from.getTime()
      const toTime = dateRange.to.getTime()
      matchesDateRange = logTime >= fromTime && logTime <= toTime
    }

    return matchesSearch && matchesLevel && matchesSource && matchesDateRange
  })

  const sources = Array.from(new Set(logs.map((log) => log.source)))

  const levelColor = (level: string) => {
    switch (level) {
      case "error":
        return "bg-red-500"
      case "warning":
        return "bg-yellow-500"
      case "info":
        return "bg-blue-500"
      case "debug":
        return "bg-gray-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log Explorer</h1>
          <p className="text-muted-foreground">Search and analyze security logs with semantic filtering</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Search & Filter</CardTitle>
              <CardDescription>Use semantic filters to find relevant log entries</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="basic">Basic Filters</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced Query</TabsTrigger>
                </TabsList>
                <TabsContent value="basic">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search logs..."
                          className="pl-8"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      <Select value={levelFilter} onValueChange={setLevelFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Log Level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Levels</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                          <SelectItem value="warning">Warning</SelectItem>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="debug">Debug</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={sourceFilter} onValueChange={setSourceFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="Source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sources</SelectItem>
                          {sources.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={timeRange} onValueChange={setTimeRange} disabled={useAbsoluteDate}>
                        <SelectTrigger>
                          <SelectValue placeholder="Time Range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1h">Last Hour</SelectItem>
                          <SelectItem value="6h">Last 6 Hours</SelectItem>
                          <SelectItem value="24h">Last 24 Hours</SelectItem>
                          <SelectItem value="7d">Last 7 Days</SelectItem>
                          <SelectItem value="30d">Last 30 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-4 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="absolute-date"
                          checked={useAbsoluteDate}
                          onCheckedChange={setUseAbsoluteDate}
                        />
                        <Label htmlFor="absolute-date" className="cursor-pointer">
                          Use Absolute Date Range
                        </Label>
                      </div>
                      {useAbsoluteDate && (
                        <div className="flex-1">
                          <DateRangePicker
                            from={dateRange?.from}
                            to={dateRange?.to}
                            onDateRangeChange={setDateRange}
                            placeholder="Select date range"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="advanced">
                  <div className="space-y-4">
                    <Input placeholder='Example: level="error" AND source="server" OR message CONTAINS "failed login"' />
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        level="error"
                      </Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        source="server"
                      </Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        message CONTAINS "failed"
                      </Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        timestamp &gt; "2023-05-01"
                      </Badge>
                      <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                        metadata.ip="192.168.1.1"
                      </Badge>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Analysis Options</CardTitle>
              <CardDescription>Configure how logs are processed and analyzed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="use-nlp">Use Log2NLP</Label>
                    <p className="text-xs text-muted-foreground">
                      Process logs with NLP instead of traditional parsing
                    </p>
                  </div>
                  <Switch id="use-nlp" checked={useNLP} onCheckedChange={setUseNLP} />
                </div>

                {useNLP && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="anomaly-detection">Anomaly Detection</Label>
                        <p className="text-xs text-muted-foreground">Automatically detect unusual patterns</p>
                      </div>
                      <Switch id="anomaly-detection" defaultChecked />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="entity-extraction">Entity Extraction</Label>
                        <p className="text-xs text-muted-foreground">Extract IPs, users, and other entities</p>
                      </div>
                      <Switch id="entity-extraction" defaultChecked />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="summarization">Summarization</Label>
                        <p className="text-xs text-muted-foreground">Generate natural language summaries</p>
                      </div>
                      <Switch id="summarization" defaultChecked />
                    </div>
                  </>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => processLogsWithNLP(logs)}
                  disabled={processingNLP || !useNLP || logs.length === 0}
                >
                  <Brain className={`h-4 w-4 mr-2 ${processingNLP ? "animate-pulse" : ""}`} />
                  {processingNLP ? "Processing..." : "Analyze Logs"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {useNLP && <Log2NLPResults results={nlpResults || {}} isLoading={processingNLP} />}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle>Log Entries</CardTitle>
            <Badge variant="outline">{filteredLogs.length} results</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No logs found</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search or filters to find what you're looking for.
                  </p>
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <Collapsible
                    key={log.id}
                    open={expandedLogs[log.id]}
                    onOpenChange={() => toggleLogExpansion(log.id)}
                    className="border rounded-lg overflow-hidden"
                  >
                    <div className="p-4 hover:bg-accent/50 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-3 w-3 rounded-full ${levelColor(log.level)}`} />
                          <div>
                            <h3 className="font-medium">{log.message}</h3>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{new Date(log.timestamp).toLocaleString()}</span>
                              <span>•</span>
                              <span>Source: {log.source}</span>
                            </div>
                          </div>
                        </div>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {expandedLogs[log.id] ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="p-4 pt-0 border-t bg-muted/50">
                        <h4 className="font-medium mb-2">Metadata</h4>
                        <pre className="bg-background p-2 rounded-md text-xs overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
