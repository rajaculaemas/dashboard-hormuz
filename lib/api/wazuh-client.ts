import https from "https"
import fetch from "node-fetch"

const httpsAgent = new https.Agent({ rejectUnauthorized: false })

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
  agent?: any
  rule?: any
  title?: string
  message?: string
  srcIp?: string
  dstIp?: string
  srcPort?: number | undefined
  dstPort?: number | undefined
  protocol?: string
  manager?: string
  cluster?: string
  severity?: number | null
  metadata?: any
}

export class WazuhClient {
  elasticsearch_url: string
  elasticsearch_username: string
  elasticsearch_password: string
  elasticsearch_index: string

  constructor(creds: WazuhCredentials) {
    this.elasticsearch_url = (creds.elasticsearch_url || "").replace(/\/+$/, "")
    this.elasticsearch_username = creds.elasticsearch_username || ""
    this.elasticsearch_password = creds.elasticsearch_password || ""
    this.elasticsearch_index = creds.elasticsearch_index || "wazuh-*"
  }

  private parseTimestamp(src: any): Date {
    const tsRaw = src.timestamp || src.timestamp_utc || src['@timestamp'] || src.msg_timestamp || new Date().toISOString()
    if (typeof tsRaw === 'number') {
      // Heuristic: treat large numbers as epoch milliseconds, smaller numbers as seconds
      // Epoch millis in 2025 is ~1.7e12, so values > 1e12 are likely milliseconds
      if (tsRaw > 1e12) return new Date(tsRaw)
      return new Date(tsRaw * 1000)
    }
    try {
      return new Date(tsRaw)
    } catch {
      return new Date()
    }
  }

  async searchAlerts(
    sinceISO?: string,
    options?: { indexPattern?: string; extraFilters?: any; limit?: number },
  ): Promise<WazuhAlert[]> {
    const indexRaw = options?.indexPattern || this.elasticsearch_index
    const indexPatterns = String(indexRaw).split(',').map((s) => s.trim()).filter(Boolean)
    const pageSize = 500
    const maxAlerts = options?.limit || 1000
    const since = sinceISO || new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const nowISO = new Date().toISOString()

    const alertsMap = new Map<string, WazuhAlert>()

    for (const indexPattern of indexPatterns) {
      if (alertsMap.size >= maxAlerts) break

      const url = `${this.elasticsearch_url}/${indexPattern}/_search`
      const isFortinet = /fortinet/i.test(indexPattern)
      const isPaloAlto = /palo.?alto/i.test(indexPattern)

      const baseQuery: any = {
        size: pageSize,
        // Avoid sorting on `@timestamp` for Fortinet/Palo Alto indices because some
        // indices do not define that field in their mapping and Elasticsearch will
        // reject the query. Sort only by `timestamp` to avoid fielddata pressure from
        // sorting on `_id` which can trigger circuit_breaking exceptions on large indices.
        sort: [{ timestamp: { order: "desc", missing: "_last" } }],
        query: {
          bool: {
            must: (isFortinet || isPaloAlto) ? [] : [{ term: { syslog_level: "ALERT" } }],
            // Match any of several common timestamp fields. Some Wazuh indices use
            // `timestamp_utc`, others use `timestamp`, `@timestamp` or `msg_timestamp`.
            // Use a `should` clause so documents that have any of these fields in
            // the requested time range will be returned.
            filter: [
              {
                bool: {
                  should: [
                    { range: { timestamp_utc: { gte: since, lte: nowISO, format: "epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS" } } },
                    { range: { timestamp: { gte: since, lte: nowISO, format: "epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS" } } },
                    { range: { "@timestamp": { gte: since, lte: nowISO, format: "epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS" } } },
                    { range: { msg_timestamp: { gte: since, lte: nowISO, format: "epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS" } } },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
      }

      const extra = options?.extraFilters
      if (extra) {
        if (extra.term && typeof extra.term === 'object') {
          Object.keys(extra.term).forEach((k) => baseQuery.query.bool.filter.push({ term: { [k]: extra.term[k] } }))
        }
        if (Array.isArray(extra.exists)) extra.exists.forEach((f: string) => baseQuery.query.bool.filter.push({ exists: { field: f } }))
        if (extra.must_not) {
          baseQuery.query.bool.must_not = baseQuery.query.bool.must_not || []
          if (Array.isArray(extra.must_not)) {
            extra.must_not.forEach((mn: any) => {
              if (typeof mn === 'object') Object.keys(mn).forEach((k) => baseQuery.query.bool.must_not.push({ term: { [k]: mn[k] } }))
            })
          } else if (typeof extra.must_not === 'object') {
            Object.keys(extra.must_not).forEach((k) => baseQuery.query.bool.must_not.push({ term: { [k]: extra.must_not[k] } }))
          }
        }
      }

      if (isFortinet) {
        // For normal/streaming sync prefer only `tunnel-up` VPN events so we
        // don't create alerts for tunnel-down (disconnect) events. Backfills
        // can use the standalone script which includes both actions.
        baseQuery.query.bool.filter.push({ term: { action: 'tunnel-up' } })
        baseQuery.query.bool.filter.push({ exists: { field: 'remip_country_code' } })
        baseQuery.query.bool.must_not = baseQuery.query.bool.must_not || []
        baseQuery.query.bool.must_not.push({ term: { remip_country_code: 'ID' } })
      }

      if (isPaloAlto) {
        // For Palo Alto, filter for THREAT events with ALERT level
        baseQuery.query.bool.filter.push({ term: { event_log_name: 'THREAT' } })
        baseQuery.query.bool.must = baseQuery.query.bool.must || []
        baseQuery.query.bool.must.push({ term: { syslog_level: 'ALERT' } })
      }

      let searchAfter: any[] | undefined

      while (alertsMap.size < maxAlerts) {
        const body: any = { ...baseQuery }
        if (searchAfter) body.search_after = searchAfter

        const auth = 'Basic ' + Buffer.from(`${this.elasticsearch_username}:${this.elasticsearch_password}`).toString('base64')
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify(body),
          agent: httpsAgent as any,
          timeout: 30000,
        } as any)

        if (!res.ok) {
          const t = await res.text().catch(() => '')
          throw new Error(`Elasticsearch error ${res.status} ${res.statusText} - ${t.substring(0, 500)}`)
        }

        const data = (await res.json()) as any
        if (data?.error) throw new Error(`Elasticsearch error: ${JSON.stringify(data.error)}`)

        const hits: any[] = data?.hits?.hits || []
        console.log(`[WazuhClient] index=${indexPattern} returned ${hits.length} hits (page).`)
        if (isFortinet && hits.length > 0) {
          try {
            const sample = hits[0]
            console.log(`[WazuhClient][Fortinet] sample hit id=${sample._id} action=${sample._source?.action} remip_cc=${sample._source?.remip_country_code}`)
          } catch (e) {
            // ignore logging errors
          }
        }
        if (isPaloAlto && hits.length > 0) {
          try {
            const sample = hits[0]
            console.log(`[WazuhClient][PaloAlto] sample hit id=${sample._id} event_log_name=${sample._source?.event_log_name} syslog_level=${sample._source?.syslog_level}`)
          } catch (e) {
            // ignore logging errors
          }
        }
        if (!hits || hits.length === 0) break

        for (const hit of hits) {
          const src = hit._source || {}

          let parsedMessage: any = {}
          if (typeof src.message === 'string') {
            try { parsedMessage = JSON.parse(src.message) } catch { parsedMessage = {} }
          } else if (typeof src.message === 'object' && src.message) parsedMessage = src.message

          const ts = this.parseTimestamp(src)

          const vendorLogDesc = parsedMessage?.logdesc || src.logdesc
          const ruleDesc = src.rule_description || ''
          let title = vendorLogDesc || ruleDesc || (src.syslog_description || '[Unknown] Alert')

          // Fortinet-specific title adjustment: mark successful VPNs outside
          // Indonesia with a consistent title so UI scripts (and existing
          // maintenance scripts) can rely on it.
          try {
            const actionField = (src.action || parsedMessage?.action || '').toString().trim().toLowerCase()
            const remipCc = (src.remip_country_code || parsedMessage?.remip_country_code || '').toString().trim().toUpperCase()
            if (isFortinet && actionField === 'tunnel-up' && remipCc && remipCc !== 'ID') {
              title = 'VPN Successful Outside Indonesia'
            }
          } catch (e) {
            // ignore
          }

          const alert: WazuhAlert = {
            id: src.id || hit._id,
            externalId: src.id || hit._id,
            timestamp: ts,
            agent: { id: src.agent_id, name: src.agent_name, ip: src.agent_ip },
            rule: { id: src.rule_id, description: ruleDesc },
            title: String(title).trim(),
            message: src.syslog_description || ruleDesc || src.message || '',
            srcIp: src.src_ip || src.source || parsedMessage?.srcip,
            dstIp: src.dst_ip || src.destination || parsedMessage?.dstip,
            srcPort: src.src_port ? parseInt(String(src.src_port), 10) : undefined,
            dstPort: src.dst_port ? parseInt(String(src.dst_port), 10) : undefined,
            protocol: src.protocol || parsedMessage?.protocol || '',
            manager: src.manager || src.cluster_node || undefined,
            cluster: src.cluster_name || undefined,
            severity: src.rule_level ? Number(src.rule_level) : (parsedMessage?.severity ? Number(parsedMessage.severity) : null),
            metadata: { raw_es: src },
          }

          if (!alertsMap.has(alert.externalId)) alertsMap.set(alert.externalId, alert)
          if (alertsMap.size >= maxAlerts) break
        }

        if (isFortinet) break // single-page for Fortinet indices

        if (isPaloAlto) break // single-page for Palo Alto indices

        const last = hits[hits.length - 1]
        searchAfter = last?.sort
        if (!searchAfter || hits.length < pageSize) break
      }
    }

    return Array.from(alertsMap.values())
  }

  /**
   * Free-text log search for the SOC chat assistant.
   * No mandatory syslog_level/action/event_log_name filters — searches all event types.
   */
  async searchRawLogs(params: {
    query?: string          // free-text / field:value (query_string syntax)
    srcIp?: string
    dstIp?: string
    agentName?: string
    ruleId?: string
    indexPattern?: string   // comma-separated or single pattern
    since?: string          // ISO timestamp (default: 24h ago)
    until?: string          // ISO timestamp (default: now)
    limit?: number
  }): Promise<any[]> {
    const {
      query,
      srcIp,
      dstIp,
      agentName,
      ruleId,
      indexPattern,
      since,
      until,
      limit = 20,
    } = params

    const sinceISO = since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const untilISO = until || new Date().toISOString()

    // Use provided index or the integration's configured index
    const patterns = indexPattern
      ? indexPattern.split(',').map((s) => s.trim()).filter(Boolean)
      : [this.elasticsearch_index]

    const results: any[] = []

    for (const pattern of patterns) {
      if (results.length >= limit) break

      const url = `${this.elasticsearch_url}/${pattern}/_search`

      // Build bool query
      const mustClauses: any[] = []
      const filterClauses: any[] = [
        {
          bool: {
            should: [
              { range: { timestamp:     { gte: sinceISO, lte: untilISO, format: "epoch_millis||strict_date_optional_time" } } },
              { range: { timestamp_utc: { gte: sinceISO, lte: untilISO, format: "epoch_millis||strict_date_optional_time" } } },
              { range: { "@timestamp":  { gte: sinceISO, lte: untilISO, format: "epoch_millis||strict_date_optional_time" } } },
              { range: { msg_timestamp: { gte: sinceISO, lte: untilISO, format: "epoch_millis||strict_date_optional_time" } } },
            ],
            minimum_should_match: 1,
          },
        },
      ]

      // Free-text query — strategy depends on whether user specified a field or not.
      if (query) {
        const hasFieldSyntax = /\w[\w.]+\s*:/.test(query)  // e.g. "syslog_description:DNS*"

        if (hasFieldSyntax) {
          // Explicit field:value — pass directly to query_string
          mustClauses.push({
            query_string: {
              query,
              analyze_wildcard: true,
              lenient: true,
            },
          })
        } else {
          // Strip leading/trailing wildcards that the LLM sometimes adds (e.g. "*DNS Command*")
          // phrase_prefix and phrase queries do not support wildcard chars — they break tokenisation.
          const cleanQuery = query.replace(/[*?]/g, '').trim()

          // Description fields only — prevents cross-field false positives (e.g. Fortinet
          // events where service:"DNS" is in one field and "Command" happens to be in another).
          const descriptionFields = [
            "syslog_description", "rule_description", "rule.description",
            "logdesc", "message", "event_name",
            "alert_indicator", "alert_signature",   // Palo Alto threat/spyware events
          ]
          const isMultiWord = cleanQuery.includes(' ')

          if (isMultiWord) {
            // Extract meaningful words (> 2 chars) in order, strip stop chars like hyphens.
            // "DNS Command-and-Control" → ["DNS","Command","Control"]
            const words = cleanQuery.split(/[^a-zA-Z0-9]+/).filter(w => w.length > 2)
            // Ordered wildcard: *DNS*Command*Control* — requires words to appear in order
            // in the SAME raw field value (used for keyword/non-analyzed fields).
            const orderedWildcard = `*${words.join('*')}*`

            mustClauses.push({
              bool: {
                should: [
                  // 1. Phrase prefix on analyzed (text) fields — tokens must appear
                  //    as a consecutive phrase in ONE field. Prevents cross-field matches.
                  {
                    multi_match: {
                      query: cleanQuery,
                      type: "phrase_prefix",
                      fields: descriptionFields,
                      lenient: true,
                    },
                  },
                  // 2. Ordered wildcard on .keyword sub-fields — handles non-analyzed fields.
                  //    "*DNS*Command*Control*" matches "DNS Command-and-Control..." but NOT
                  //    "Command...Control...DNS" or "DNS query to domain" alone.
                  {
                    query_string: {
                      query: orderedWildcard,
                      fields: descriptionFields.map(f => `${f}.keyword`),
                      analyze_wildcard: true,
                      lenient: true,
                    },
                  },
                ],
                minimum_should_match: 1,
              },
            })
          } else {
            // Single word: safe to use wildcard across all fields
            mustClauses.push({
              query_string: {
                query: `*${cleanQuery}*`,
                fields: ['*'],
                analyze_wildcard: true,
                lenient: true,
              },
            })
          }
        }
        console.log(`[WazuhClient.searchRawLogs] query="${query}" cleanQuery="${query.replace(/[*?]/g,'').trim()}" hasFieldSyntax=${hasFieldSyntax}`)
      }

      if (srcIp)     filterClauses.push({ bool: { should: [{ term: { src_ip: srcIp } }, { term: { source: srcIp } }], minimum_should_match: 1 } })
      if (dstIp)     filterClauses.push({ bool: { should: [{ term: { dst_ip: dstIp } }, { term: { destination: dstIp } }], minimum_should_match: 1 } })
      if (agentName) filterClauses.push({ bool: { should: [{ match: { agent_name: agentName } }, { match: { "agent.name": agentName } }], minimum_should_match: 1 } })
      if (ruleId)    filterClauses.push({ bool: { should: [{ term: { rule_id: ruleId } }, { term: { "rule.id": ruleId } }], minimum_should_match: 1 } })

      const body = {
        size: Math.min(limit - results.length, 50),
        sort: [{ timestamp: { order: "desc", missing: "_last" } }],
        query: {
          bool: {
            must: mustClauses,
            filter: filterClauses,
          },
        },
      }

      const auth = 'Basic ' + Buffer.from(`${this.elasticsearch_username}:${this.elasticsearch_password}`).toString('base64')

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify(body),
          agent: httpsAgent as any,
          timeout: 30000,
        } as any)

        if (!res.ok) {
          const t = await res.text().catch(() => '')
          console.error(`[WazuhClient.searchRawLogs] ${pattern}: ${res.status} ${t.slice(0, 200)}`)
          continue
        }

        const data = (await res.json()) as any
        const hits: any[] = data?.hits?.hits || []

        for (const hit of hits) {
          const src = hit._source || {}
          results.push({
            id: hit._id,
            index: hit._index,
            timestamp: src.timestamp || src.timestamp_utc || src['@timestamp'] || src.msg_timestamp,
            rule_id: src.rule_id || src.rule?.id,
            rule_description: src.rule_description || src.rule?.description || src.logdesc || src.syslog_description,
            agent_name: src.agent_name || src.agent?.name,
            agent_ip: src.agent_ip || src.agent?.ip,
            src_ip: src.src_ip || src.source,
            dst_ip: src.dst_ip || src.destination,
            src_port: src.src_port,
            dst_port: src.dst_port,
            severity: src.rule_level || src.severity,
            syslog_level: src.syslog_level,
            message: src.syslog_description || src.rule_description || src.logdesc,
            // Palo Alto threat/spyware fields
            vendor_event_action: src.vendor_event_action,   // alert, sinkhole, drop, dropped, block-ip, reset-client, reset-server
            alert_indicator: src.alert_indicator,           // domain or IP that triggered the alert
            alert_signature: src.alert_signature,           // e.g. "Tunneling:xpmrlba.com(109001001)"
            alert_category: src.alert_category,             // e.g. ["dns-c2", "any"]
            alert_definitions_version: src.alert_definitions_version,
            vendor_alert_severity: src.vendor_alert_severity,
            application_name: src.application_name,
            pan_log_subtype: src.pan_log_subtype,           // spyware, vulnerability, wildfire, etc.
            _raw: src,
          })
        }
      } catch (err: any) {
        console.error(`[WazuhClient.searchRawLogs] ${pattern}: ${err.message}`)
      }
    }

    return results.slice(0, limit)
  }
}

export default WazuhClient
