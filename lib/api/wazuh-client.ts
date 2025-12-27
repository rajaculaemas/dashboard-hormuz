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
    const maxAlerts = options?.limit || 10000
    const since = sinceISO || new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const nowISO = new Date().toISOString()

    const alertsMap = new Map<string, WazuhAlert>()

    for (const indexPattern of indexPatterns) {
      if (alertsMap.size >= maxAlerts) break

      const url = `${this.elasticsearch_url}/${indexPattern}/_search`
      const isFortinet = /fortinet/i.test(indexPattern)

      const baseQuery: any = {
        size: pageSize,
        // Avoid sorting on `@timestamp` for Fortinet indices because some
        // Fortinet indices do not define that field in their mapping and
        // Elasticsearch will reject the query. Sort only by `timestamp` to
        // avoid fielddata pressure from sorting on `_id` which can trigger
        // circuit_breaking exceptions on large indices.
        sort: [{ timestamp: { order: "desc", missing: "_last" } }],
        query: {
          bool: {
            must: isFortinet ? [] : [{ term: { syslog_level: "ALERT" } }],
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

        const last = hits[hits.length - 1]
        searchAfter = last?.sort
        if (!searchAfter || hits.length < pageSize) break
      }
    }

    return Array.from(alertsMap.values())
  }
}

export default WazuhClient
