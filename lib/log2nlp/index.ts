import type { LogEntry } from "@/lib/api"

export interface Log2NLPConfig {
  modelType: "basic" | "advanced"
  confidenceThreshold: number
  maxTokens: number
  enableSummarization: boolean
  enableAnomalyDetection: boolean
  enableEntityExtraction: boolean
}

export interface Log2NLPResult {
  summary?: string
  entities?: {
    type: string
    value: string
    confidence: number
  }[]
  anomalies?: {
    description: string
    severity: "low" | "medium" | "high" | "critical"
    confidence: number
  }[]
  patterns?: {
    description: string
    frequency: number
    examples: string[]
  }[]
  insights?: string[]
}

export class Log2NLP {
  private config: Log2NLPConfig

  constructor(config?: Partial<Log2NLPConfig>) {
    this.config = {
      modelType: config?.modelType || "basic",
      confidenceThreshold: config?.confidenceThreshold || 0.7,
      maxTokens: config?.maxTokens || 1000,
      enableSummarization: config?.enableSummarization !== undefined ? config.enableSummarization : true,
      enableAnomalyDetection: config?.enableAnomalyDetection !== undefined ? config.enableAnomalyDetection : true,
      enableEntityExtraction: config?.enableEntityExtraction !== undefined ? config.enableEntityExtraction : true,
    }
  }

  /**
   * Process logs using NLP techniques instead of traditional parsing
   */
  async processLogs(logs: LogEntry[]): Promise<Log2NLPResult> {
    // In a real implementation, this would use an actual NLP model
    // For demo purposes, we'll simulate the processing

    console.log(`Processing ${logs.length} logs with Log2NLP (${this.config.modelType} model)`)

    // Simulate processing time based on log volume and model type
    const processingTime = logs.length * (this.config.modelType === "advanced" ? 50 : 20)
    await new Promise((resolve) => setTimeout(resolve, processingTime))

    const result: Log2NLPResult = {}

    // Generate summary if enabled
    if (this.config.enableSummarization) {
      result.summary = this.generateSummary(logs)
    }

    // Extract entities if enabled
    if (this.config.enableEntityExtraction) {
      result.entities = this.extractEntities(logs)
    }

    // Detect anomalies if enabled
    if (this.config.enableAnomalyDetection) {
      result.anomalies = this.detectAnomalies(logs)
    }

    // Identify patterns
    result.patterns = this.identifyPatterns(logs)

    // Generate insights
    result.insights = this.generateInsights(logs)

    return result
  }

  /**
   * Generate a natural language summary of the logs
   */
  private generateSummary(logs: LogEntry[]): string {
    // Group logs by level
    const levelCounts: Record<string, number> = {}
    logs.forEach((log) => {
      levelCounts[log.level] = (levelCounts[log.level] || 0) + 1
    })

    // Group logs by source
    const sourceCounts: Record<string, number> = {}
    logs.forEach((log) => {
      sourceCounts[log.source] = (sourceCounts[log.source] || 0) + 1
    })

    // Find the time range
    const timestamps = logs.map((log) => new Date(log.timestamp).getTime())
    const minTime = new Date(Math.min(...timestamps))
    const maxTime = new Date(Math.max(...timestamps))

    // Generate summary
    return `Analyzed ${logs.length} log entries from ${Object.keys(sourceCounts).length} sources between ${minTime.toLocaleString()} and ${maxTime.toLocaleString()}. 
    Found ${levelCounts.error || 0} errors, ${levelCounts.warning || 0} warnings, and ${levelCounts.info || 0} informational messages. 
    Most active source: ${Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "none"}.`
  }

  /**
   * Extract entities from logs using NLP
   */
  private extractEntities(logs: LogEntry[]): Log2NLPResult["entities"] {
    const entities: Log2NLPResult["entities"] = []

    // Extract IP addresses
    const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
    logs.forEach((log) => {
      const message = log.message
      const metadata = JSON.stringify(log.metadata)

      // Extract IPs from message
      const ips = [...message.matchAll(ipRegex)].map((match) => match[0])

      // Extract IPs from metadata
      const metadataIps = [...metadata.matchAll(ipRegex)].map((match) => match[0])

      // Combine and deduplicate
      const uniqueIps = [...new Set([...ips, ...metadataIps])]

      uniqueIps.forEach((ip) => {
        entities.push({
          type: "ip_address",
          value: ip,
          confidence: 0.95,
        })
      })
    })

    // Extract usernames (simulated)
    logs.forEach((log) => {
      if (log.metadata?.user) {
        entities.push({
          type: "username",
          value: log.metadata.user as string,
          confidence: 0.9,
        })
      }
    })

    // Extract actions (simulated)
    logs.forEach((log) => {
      if (log.metadata?.action) {
        entities.push({
          type: "action",
          value: log.metadata.action as string,
          confidence: 0.85,
        })
      }
    })

    return entities
  }

  /**
   * Detect anomalies in logs using NLP and statistical methods
   */
  private detectAnomalies(logs: LogEntry[]): Log2NLPResult["anomalies"] {
    const anomalies: Log2NLPResult["anomalies"] = []

    // Check for error spikes
    const errorLogs = logs.filter((log) => log.level === "error")
    if (errorLogs.length > logs.length * 0.2) {
      anomalies.push({
        description: "Unusually high number of error messages",
        severity: "high",
        confidence: 0.85,
      })
    }

    // Check for unusual login patterns (simulated)
    const loginLogs = logs.filter(
      (log) => log.message.toLowerCase().includes("login") || log.message.toLowerCase().includes("authentication"),
    )

    if (loginLogs.length > 10) {
      anomalies.push({
        description: "Multiple authentication events detected",
        severity: "medium",
        confidence: 0.75,
      })
    }

    // Check for unusual time patterns (simulated)
    const nightTimeLogins = loginLogs.filter((log) => {
      const hour = new Date(log.timestamp).getHours()
      return hour >= 22 || hour <= 5
    })

    if (nightTimeLogins.length > 3) {
      anomalies.push({
        description: "Unusual login activity during non-business hours",
        severity: "high",
        confidence: 0.8,
      })
    }

    return anomalies
  }

  /**
   * Identify patterns in logs using NLP clustering
   */
  private identifyPatterns(logs: LogEntry[]): Log2NLPResult["patterns"] {
    const patterns: Log2NLPResult["patterns"] = []

    // Group logs by similar messages (simulated clustering)
    const messageGroups: Record<string, LogEntry[]> = {}

    logs.forEach((log) => {
      // Simplify message for grouping (simulated NLP processing)
      const simplifiedMessage = log.message
        .replace(/\d+/g, "NUM")
        .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, "UUID")
        .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "IP_ADDR")
        .toLowerCase()

      if (!messageGroups[simplifiedMessage]) {
        messageGroups[simplifiedMessage] = []
      }

      messageGroups[simplifiedMessage].push(log)
    })

    // Convert groups to patterns
    Object.entries(messageGroups)
      .filter(([_, group]) => group.length > 1) // Only include patterns that occur multiple times
      .sort((a, b) => b[1].length - a[1].length) // Sort by frequency
      .slice(0, 5) // Take top 5 patterns
      .forEach(([_, group]) => {
        patterns.push({
          description: group[0].message,
          frequency: group.length,
          examples: group.slice(0, 3).map((log) => log.message),
        })
      })

    return patterns
  }

  /**
   * Generate insights from logs using NLP
   */
  private generateInsights(logs: LogEntry[]): string[] {
    const insights: string[] = []

    // Check error distribution
    const errorLogs = logs.filter((log) => log.level === "error")
    if (errorLogs.length > 0) {
      const errorSources = errorLogs.reduce(
        (acc, log) => {
          acc[log.source] = (acc[log.source] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      const topErrorSource = Object.entries(errorSources).sort((a, b) => b[1] - a[1])[0]

      if (topErrorSource) {
        insights.push(`Most errors (${topErrorSource[1]}) are coming from ${topErrorSource[0]}`)
      }
    }

    // Check time patterns
    const hourDistribution = logs.reduce(
      (acc, log) => {
        const hour = new Date(log.timestamp).getHours()
        acc[hour] = (acc[hour] || 0) + 1
        return acc
      },
      {} as Record<number, number>,
    )

    const maxHour = Object.entries(hourDistribution).sort((a, b) => b[1] - a[1])[0]

    if (maxHour) {
      insights.push(`Peak log activity occurs around ${maxHour[0]}:00 with ${maxHour[1]} entries`)
    }

    // Add more insights based on log content
    if (logs.some((log) => log.message.toLowerCase().includes("firewall"))) {
      insights.push("Firewall activity detected in logs, consider reviewing security policies")
    }

    if (
      logs.some((log) => log.message.toLowerCase().includes("failed") && log.message.toLowerCase().includes("login"))
    ) {
      insights.push("Failed login attempts detected, monitor for potential brute force attacks")
    }

    return insights
  }
}

// Export a singleton instance with default configuration
export const log2nlp = new Log2NLP()
