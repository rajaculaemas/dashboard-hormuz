"use client"

import { useState } from "react"
import { AlertCircle, Brain, ChevronDown, ChevronUp, FileText, Lightbulb, Network } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Log2NLPResult } from "@/lib/log2nlp"

interface Log2NLPResultsProps {
  results: Log2NLPResult
  isLoading?: boolean
}

export function Log2NLPResults({ results, isLoading = false }: Log2NLPResultsProps) {
  const [expandedPatterns, setExpandedPatterns] = useState<Record<string, boolean>>({})

  const togglePattern = (index: number) => {
    setExpandedPatterns((prev) => ({
      ...prev,
      [index]: !prev[index],
    }))
  }

  const getAnomalySeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500 text-white"
      case "high":
        return "bg-orange-500 text-white"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-blue-500 text-white"
      default:
        return "bg-gray-500 text-white"
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Log2NLP Analysis
          </CardTitle>
          <CardDescription>Processing logs with natural language understanding...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 animate-pulse rounded-full bg-primary/20 flex items-center justify-center">
                <Brain className="h-5 w-5 text-primary animate-pulse" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted"></div>
                <Progress value={65} className="h-2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-muted"></div>
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted"></div>
              <div className="h-4 w-4/6 animate-pulse rounded bg-muted"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Log2NLP Analysis
        </CardTitle>
        <CardDescription>Advanced log analysis using natural language processing</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary">
          <TabsList className="mb-4">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="entities">Entities</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            {results.summary && (
              <div className="rounded-lg border p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Summary
                </h3>
                <p className="text-sm">{results.summary}</p>
              </div>
            )}

            {results.insights && results.insights.length > 0 && (
              <div className="rounded-lg border p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  Key Insights
                </h3>
                <ul className="space-y-2">
                  {results.insights.map((insight, index) => (
                    <li key={index} className="text-sm flex items-start gap-2">
                      <span className="text-yellow-500 mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="entities">
            {results.entities && results.entities.length > 0 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set(results.entities.map((entity) => entity.type))).map((type) => (
                    <Badge key={type} variant="outline" className="capitalize">
                      {type.replace("_", " ")}
                    </Badge>
                  ))}
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Value
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Confidence
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-background divide-y divide-border">
                      {results.entities.map((entity, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm capitalize">
                            {entity.type.replace("_", " ")}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm font-mono">{entity.value}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2">
                              <Progress value={entity.confidence * 100} className="h-2 w-24" />
                              <span>{Math.round(entity.confidence * 100)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No entities detected</div>
            )}
          </TabsContent>

          <TabsContent value="anomalies">
            {results.anomalies && results.anomalies.length > 0 ? (
              <div className="space-y-4">
                {results.anomalies.map((anomaly, index) => (
                  <div key={index} className="rounded-lg border overflow-hidden">
                    <div className={`px-4 py-2 ${getAnomalySeverityColor(anomaly.severity)}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          <span className="font-medium capitalize">{anomaly.severity} Severity</span>
                        </div>
                        <Badge variant="outline" className="bg-white/20">
                          {Math.round(anomaly.confidence * 100)}% confidence
                        </Badge>
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-sm">{anomaly.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No anomalies detected</div>
            )}
          </TabsContent>

          <TabsContent value="patterns">
            {results.patterns && results.patterns.length > 0 ? (
              <div className="space-y-4">
                {results.patterns.map((pattern, index) => (
                  <Collapsible
                    key={index}
                    open={expandedPatterns[index]}
                    onOpenChange={() => togglePattern(index)}
                    className="rounded-lg border overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-muted/50">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-2">
                            <Network className="h-4 w-4 text-primary" />
                            <span className="font-medium">Pattern detected {pattern.frequency} times</span>
                          </div>
                          <Button variant="ghost" size="sm">
                            {expandedPatterns[index] ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      <div className="p-4 space-y-3">
                        <div>
                          <h4 className="text-sm font-medium mb-1">Pattern</h4>
                          <p className="text-sm bg-muted/50 p-2 rounded">{pattern.description}</p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-1">Examples</h4>
                          <ul className="space-y-2">
                            {pattern.examples.map((example, i) => (
                              <li key={i} className="text-sm bg-muted/30 p-2 rounded">
                                {example}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No patterns detected</div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
