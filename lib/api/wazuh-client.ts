import https from "https"
import fetch from "node-fetch"

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

export interface WazuhCredentials {
  elasticsearch_url: string
  elasticsearch_username: string
  elasticsearch_password: string
  elasticsearch_index: string
}

export interface WazuhAlert {
  id: string
  externalId: string
  timestamp: Date
  agent: {
    id: string
    name: string
    ip: string
    labels?: {
      customer?: string
    }
  }
  rule: {
    level: number
    description: string
    id: string
    mitre?: {
      id: string[]
      tactic: string[]
      technique: string[]
    }
    groups: string[]
  }
  title: string
  severity: string | null
  message: string
  srcIp?: string
  dstIp?: string
  srcPort?: number
  dstPort?: number
  protocol?: string
  manager: {
    name: string
  }
  cluster?: {
    name: string
    node: string
  }
  metadata: Record<string, any>
}

export class WazuhClient {
  private elasticsearch_url: string
  private elasticsearch_username: string
  private elasticsearch_password: string
  private elasticsearch_index: string

  constructor(credentials: WazuhCredentials) {
    this.elasticsearch_url = credentials.elasticsearch_url.replace(/\/$/, "")
    this.elasticsearch_username = credentials.elasticsearch_username
    this.elasticsearch_password = credentials.elasticsearch_password
    // Normalize index pattern: Python reference uses "wazuh-posindonesia_*"
    const idx = credentials.elasticsearch_index || "wazuh-*"
    // Force correct pattern for POS Indonesia indices which are time-suffixed with underscore
    if (idx.startsWith("wazuh-posindonesia")) {
      this.elasticsearch_index = "wazuh-posindonesia_*"
    } else {
      this.elasticsearch_index = idx
    }
  }

  private formatEsDate(date: Date): string {
    const pad = (n: number, width = 2) => String(n).padStart(width, "0")
    const year = date.getUTCFullYear()
    const month = pad(date.getUTCMonth() + 1)
    const day = pad(date.getUTCDate())
    const hours = pad(date.getUTCHours())
    const minutes = pad(date.getUTCMinutes())
    const seconds = pad(date.getUTCSeconds())
    const millis = pad(date.getUTCMilliseconds(), 3)
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`
  }

  private mapRuleLevelToSeverity(level: number): string {
    if (level <= 4) return "Low"
    if (level <= 7) return "Medium"
    if (level <= 10) return "High"
    return "Critical"
  }

  async searchAlerts(sinceTimestamp?: string): Promise<WazuhAlert[]> {
    const alertsMap = new Map<string, WazuhAlert>()

    try {
      const sinceDate = sinceTimestamp ? new Date(sinceTimestamp) : new Date(Date.now() - 2 * 60 * 60 * 1000) // Changed to 2 hours per user requirement
      const since = this.formatEsDate(sinceDate)
      const sinceISO = sinceDate.toISOString() // ISO format for timestamp_utc
      const startEpoch = Math.floor(sinceDate.getTime() / 1000)
      const endEpoch = Math.floor(Date.now() / 1000)

      const pageSize = 10000 // Match Python script size
      const maxAlerts = 10000 // Limit total alerts to prevent memory issues
      const sort = [
        { true: { order: "desc" } },
        { timestamp_utc: { order: "desc", missing: "_last" } },
        // Removed _id from sort - causes CircuitBreaker exception on large datasets
      ]

      const url = `${this.elasticsearch_url}/${this.elasticsearch_index}/_search`
      let totalFetched = 0

      // PRIMARY query: Use `true` field (epoch) like Python reference - THIS WORKS
      const baseQuery = {
        size: pageSize,
        sort,
        query: {
          bool: {
            must: [
              { term: { syslog_level: "ALERT" } },
            ],
            filter: [
              { range: { true: { gte: startEpoch, lte: endEpoch } } },
            ],
          },
        },
      }
      // FALLBACK query: ISO range on `timestamp_utc` if epoch returns zero
      const fallbackQuery = {
        size: pageSize,
        sort,
        query: {
          bool: {
            must: [
              { term: { syslog_level: "ALERT" } },
            ],
            filter: [
              { range: { timestamp_utc: { gte: sinceISO, lte: new Date().toISOString() } } },
            ],
          },
        },
      }

      let searchAfter: any[] | undefined
      console.log(`[Wazuh Client] ======= ALERT SEARCH START =======`)
      console.log(`[Wazuh Client] URL: ${url}`)
      console.log(`[Wazuh Client] Index: ${this.elasticsearch_index}`)
      console.log(`[Wazuh Client] Time Range (epoch): ${startEpoch} to ${endEpoch}`)

      while (totalFetched < maxAlerts) {
        let body: any = searchAfter ? { ...baseQuery, search_after: searchAfter } : baseQuery

        const authHeader = "Basic " + Buffer.from(`${this.elasticsearch_username}:${this.elasticsearch_password}`).toString("base64")
        const bodyJson = JSON.stringify(body)
        
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: bodyJson,
          agent: httpsAgent,
          timeout: 30000,
        } as any)
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error(`[Wazuh Client] ❌ ES Error Response (${response.status}):`, errorText.substring(0, 800))
          throw new Error(`Elasticsearch error: ${response.status} ${response.statusText} - ${errorText.substring(0, 500)}`)
        }

        let data = (await response.json()) as any
        let hits = data?.hits?.hits

        console.log(`[Wazuh Client] Raw response structure:`, JSON.stringify({
          has_hits: !!data?.hits,
          total_structure: data?.hits?.total,
          hits_array_length: data?.hits?.hits?.length,
          has_error: !!data?.error
        }))

        if (data?.error) {
          console.error(`[Wazuh Client] ES returned error:`, JSON.stringify(data.error, null, 2))
          throw new Error(`Elasticsearch query error: ${JSON.stringify(data.error)}`)
        }

        let totalHits = typeof data?.hits?.total === 'object' ? data.hits.total.value : (data?.hits?.total || 0)
        console.log(`[Wazuh Client] ES Response - Total hits: ${totalHits}, Returned: ${hits?.length || 0}`)
        
        if (hits?.length > 0) {
          console.log(`[Wazuh Client] First hit timestamp:`, hits[0]._source?.timestamp_utc || hits[0]._source?.timestamp)
        }

        if (!hits || hits.length === 0) {
          // Try fallback once when first page yields zero
          if (!searchAfter && (totalHits === 0)) {
            console.log(`[Wazuh Client] PRIMARY QUERY returned 0 hits. Retrying with timestamp_utc fallback...`)
            body = searchAfter ? { ...fallbackQuery, search_after: searchAfter } : fallbackQuery
            const response2 = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Basic " + Buffer.from(`${this.elasticsearch_username}:${this.elasticsearch_password}`).toString("base64"),
              },
              body: JSON.stringify(body),
              agent: httpsAgent,
              timeout: 30000,
            } as any)
            if (!response2.ok) {
              const errorText2 = await response2.text()
              console.error(`[Wazuh Client] ES Error Response (fallback):`, errorText2.substring(0, 500))
              throw new Error(`Elasticsearch error (fallback): ${response2.status} ${response2.statusText} - ${errorText2.substring(0, 500)}`)
            }
            data = (await response2.json()) as any
            const hits2 = data?.hits?.hits
            totalHits = typeof data?.hits?.total === 'object' ? data.hits.total.value : (data?.hits?.total || 0)
            console.log(`[Wazuh Client] FALLBACK Response - Total hits: ${totalHits}, Returned: ${hits2?.length || 0}`)
            if (!hits2 || hits2.length === 0) {
              console.log(`[Wazuh Client] No more alerts found after fallback. Total fetched: ${totalFetched}`)
              break
            }
            // Update hits variable to use fallback results
            hits = hits2
          } else {
            console.log(`[Wazuh Client] No more alerts found. Total fetched: ${totalFetched}`)
            break
          }
        }

        console.log(`[Wazuh Client] Fetched ${hits.length} alerts (total so far: ${totalFetched + hits.length})`)

        hits.forEach((hit: any) => {
          const source = hit._source

          let parsedMessage: any = {}
          if (typeof source.message === "string") {
            try {
              parsedMessage = JSON.parse(source.message)
            } catch {
              parsedMessage = {}
            }
          } else if (typeof source.message === "object" && source.message !== null) {
            parsedMessage = source.message
          }

          // Defensive: skip documents that are not syslog_level ALERT.
          // Some environments may index messages without the field visible in the UI
          // (it can be present at top-level in ES). Ensure we only process ALERTs.
          const syslogLevel = (source.syslog_level || parsedMessage?.syslog_level) as string | undefined
          if (syslogLevel && syslogLevel.toUpperCase() !== "ALERT") {
            console.log(`[Wazuh Client] Skipping doc ${source.id || hit._id} with syslog_level=${syslogLevel}`)
            return
          }

          const agentId = source.agent_id || ""
          const agentName = source.agent_name || ""
          const agentIp = source.agent_ip || ""
          const agentLabels = source.agent_labels_customer || ""

          const ruleId = source.rule_id || ""
          const ruleLevel = source.rule_level || 1
          const ruleDescription = source.rule_description || ""
          const ruleGroups = source.rule_groups || ""

          const managerId = source.cluster_node || ""
          const clusterName = source.cluster_name || ""

          // Extract network info: try ES fields first, then fall back to parsed message data
          let srcIp = source.src_ip || source.source || source.data_win_eventdata_sourceIp || source.data_srcip || ""
          let dstIp = source.dst_ip || source.destination || source.data_win_eventdata_destinationIp || source.data_dstip || ""
          let srcPort = source.src_port ? parseInt(source.src_port, 10) : (source.data_source_port ? parseInt(source.data_source_port, 10) : undefined)
          let dstPort = source.dst_port ? parseInt(source.dst_port, 10) : (source.data_destination_port ? parseInt(source.data_destination_port, 10) : undefined)
          let protocol = source.protocol || source.data_win_eventdata_protocol || source.data_protocol || ""
          
          // For web logs, extract from parsed message data (nginx, apache logs)
          if (parsedMessage?.data) {
            const msgData = parsedMessage.data
            if (msgData.srcip && !srcIp) srcIp = msgData.srcip
            if (msgData.dstip && !dstIp) dstIp = msgData.dstip
            if (msgData.srcport && !srcPort) srcPort = parseInt(msgData.srcport, 10)
            if (msgData.dstport && !dstPort) dstPort = parseInt(msgData.dstport, 10)
            if (msgData.protocol && !protocol) protocol = msgData.protocol
          }

          const timestamp = source.timestamp_utc || source.timestamp || new Date().toISOString()

          const title =
            (ruleDescription && ruleDescription.trim()) ||
            (source.syslog_description && source.syslog_description.trim()) ||
            `[Unknown] Alert`

          const messageStr = source.syslog_description || ruleDescription || source.message || "No details available"

          const alert: WazuhAlert = {
            id: source.id || hit._id,
            externalId: source.id || hit._id,
            timestamp: new Date(timestamp),
            agent: {
              id: agentId,
              name: agentName,
              ip: agentIp,
              labels: agentLabels ? { customer: agentLabels } : undefined,
            },
            rule: {
              level: ruleLevel,
              description: ruleDescription,
              id: ruleId,
              mitre: parsedMessage?.rule?.mitre,
              groups: ruleGroups ? ruleGroups.split(",").map((g: string) => g.trim()) : [],
            },
            title,
            severity: null,
            message: messageStr,
            srcIp,
            dstIp,
            srcPort,
            dstPort,
            protocol,
            manager: {
              name: managerId || source.manager_name || "",
            },
            cluster: clusterName
              ? {
                  name: clusterName,
                  node: source.cluster_node || "",
                }
              : undefined,
            metadata: {
              id: source.id,
              externalId: source.id,
              raw_es: source,
              timestamp,
              location: source.location || source.decoder_name,
              ruleId,
              ruleLevel,
              ruleDescription,
              ruleFiredTimes: source.rule_firedtimes,
              ruleGroups: ruleGroups ? ruleGroups.split(",").map((g: string) => g.trim()) : [],
              ruleMailAlert: source.rule_mail,
              agentId,
              agentName,
              agentIp,
              agentLabels: agentLabels ? { customer: agentLabels } : undefined,
              managerId,
              clusterName,
              clusterNode: source.cluster_node,
              srcIp,
              dstIp,
              srcPort,
              dstPort,
              protocol,
              // Web request fields - try ES fields first, then parsed message
              url: source.data_url || parsedMessage?.data?.url || "",
              httpMethod: source.data_protocol || parsedMessage?.data?.protocol || protocol || "",
              httpStatusCode: source.data_id || parsedMessage?.data?.id || "",
              userAgent: source.user_agent || parsedMessage?.data?.user_agent || "",
              pciDss: source.rule_pci_dss?.split(","),
              gdpr: source.rule_gdpr?.split(","),
              hipaa: source.rule_hipaa?.split(","),
              nist800_53: source.rule_nist_800_53?.split(","),
              mitreTactic: source.rule_mitre_tactic || parsedMessage?.rule?.mitre?.tactic,
              mitreId: source.rule_mitre_id || parsedMessage?.rule?.mitre?.id,
              mitreTechnique: source.rule_mitre_technique || parsedMessage?.rule?.mitre?.technique,
              message: typeof source.message === "string" ? source.message : JSON.stringify(source.message),
              eventData: parsedMessage?.data?.win?.eventdata,
              fullLog: source.full_log,
            },
          }

          if (!alertsMap.has(alert.externalId)) {
            alertsMap.set(alert.externalId, alert)
          }
        })

        totalFetched += hits.length

        const lastHit = hits[hits.length - 1]
        searchAfter = lastHit?.sort

        // Check if last alert is older than since - if so, we can stop
        const lastTimestamp = hits[hits.length - 1]?._source?.timestamp_utc || hits[hits.length - 1]?._source?.timestamp
        if (lastTimestamp && new Date(lastTimestamp).getTime() < sinceDate.getTime()) {
          console.log(`[Wazuh Client] Last alert timestamp (${lastTimestamp}) is older than since boundary, stopping`)
          break
        }

        // Continue to next page if we have search_after and haven't hit limit
        if (!searchAfter || hits.length < pageSize) {
          console.log(`[Wazuh Client] No more pages available (hits: ${hits.length}, pageSize: ${pageSize})`)
          break
        }
      }

      console.log(`[Wazuh Client] ✅ Final result: ${alertsMap.size} unique alerts fetched`)
      console.log(`[Wazuh Client] ======= ALERT SEARCH END =======`)
      return Array.from(alertsMap.values())
    } catch (error) {
      console.error("❌ Error searching Wazuh alerts:", error)
      console.log(`[Wazuh Client] ======= ALERT SEARCH FAILED =======`)
      throw error
    }
  }
}