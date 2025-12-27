// Pure JS backfill runner for Wazuh alerts (no import/export, only require)
// Usage: HOURS_BACK=48 INDEX_PATTERN="wazuh-posindonesia_*" node scripts/sync-wazuh-manual.js

const https = require('https')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Allow ignoring self-signed TLS certs for on-prem Elasticsearch clusters.
// This sets the Node-wide option; prefer running with NODE_TLS_REJECT_UNAUTHORIZED=0
// in production consoles only when you understand the security implications.
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  console.warn('[sync-wazuh-manual] NODE_TLS_REJECT_UNAUTHORIZED set to 0 (ignoring TLS certificate validation)')
}

function parseTimestamp(src) {
  const tsRaw = src.timestamp || src.timestamp_utc || src['@timestamp'] || src.msg_timestamp || new Date().toISOString()
  if (typeof tsRaw === 'number') return new Date(tsRaw * 1000)
  try { return new Date(tsRaw) } catch (e) { return new Date() }
}

async function getWazuhCredentialsFromDB(integrationId) {
  let integration
  if (integrationId) {
    integration = await prisma.integration.findUnique({ where: { id: integrationId } })
    if (!integration || integration.source !== 'wazuh') throw new Error('Wazuh integration not found')
  } else {
    integration = await prisma.integration.findFirst({ where: { source: 'wazuh', status: 'connected' } })
    if (!integration) throw new Error('No active Wazuh integration found')
  }

  let credentials = {}
  if (Array.isArray(integration.credentials)) {
    integration.credentials.forEach((c) => { if (c && c.key) credentials[c.key] = c.value })
  } else {
    credentials = integration.credentials || {}
  }

  return {
    elasticsearch_url: credentials.elasticsearch_url || '',
    elasticsearch_username: credentials.elasticsearch_username || '',
    elasticsearch_password: credentials.elasticsearch_password || '',
    elasticsearch_index: credentials.elasticsearch_index || 'wazuh-*',
  }
}

async function searchAlertsFromElasticsearch(credentials, sinceISO, options) {
  // Note: using global fetch (Node 18+).
  // Use an https.Agent that ignores self-signed certs so on-prem clusters with
  // self-signed certificates can be queried without TLS errors.
  const httpsAgent = new https.Agent({ rejectUnauthorized: false })
  const indexRaw = options?.indexPattern || credentials.elasticsearch_index || 'wazuh-*'
  const indexPatterns = String(indexRaw).split(',').map(s => s.trim()).filter(Boolean)
  const pageSize = 500
  const maxAlerts = options?.limit || 10000
  const since = sinceISO || new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  const sinceEpoch = Date.parse(since)
  const nowEpoch = Date.now()
  const alertsMap = new Map()
  // Enforce strict syslog filter by default. Set STRICT_SYSLOG=0 to disable.
  const strictSyslog = process.env.STRICT_SYSLOG !== '0'

  for (const indexPattern of indexPatterns) {
    if (alertsMap.size >= maxAlerts) break
    const url = `${credentials.elasticsearch_url.replace(/\/+$/, '')}/${indexPattern}/_search`
    const isFortinet = /fortinet/i.test(indexPattern)

    // Build `must` clause according to STRICT_SYSLOG toggle. By default we
    // require `syslog_level: ALERT` to avoid a flood of unrelated documents.
    let mustClause
    if (strictSyslog) {
      mustClause = [{ term: { syslog_level: 'ALERT' } }]
    } else {
      mustClause = isFortinet ? [] : [{ bool: { should: [
        { term: { syslog_level: 'ALERT' } },
        { exists: { field: 'rule_description' } },
        { exists: { field: 'rule_level' } },
        { exists: { field: 'rule_tsc' } }
      ], minimum_should_match: 1 } }]
    }

    const baseQuery = {
      size: pageSize,
      // Don't sort on `@timestamp` for Fortinet indices (mapping may be missing).
      // Avoid sorting on `_id` to prevent fielddata/circuit-breaker issues.
      sort: [{ timestamp: { order: 'desc', missing: '_last' } }],
      query: {
        bool: {
          must: mustClause,
          // Match documents that have any of these timestamp fields within range
          filter: [
            {
              bool: {
                should: [
                  { range: { timestamp_utc: { gte: sinceEpoch, lte: nowEpoch, format: 'epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS' } } },
                  { range: { timestamp: { gte: sinceEpoch, lte: nowEpoch, format: 'epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS' } } },
                  { range: { '@timestamp': { gte: sinceEpoch, lte: nowEpoch, format: 'epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS' } } },
                  { range: { msg_timestamp: { gte: sinceEpoch, lte: nowEpoch, format: 'epoch_millis||strict_date_optional_time||uuuu-MM-dd HH:mm:ss.SSS' } } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    }

    if (isFortinet) {
      // Only include tunnel-up events for Fortinet in this manual sync
      baseQuery.query.bool.filter.push({ terms: { action: ['tunnel-up'] } })
      baseQuery.query.bool.filter.push({ exists: { field: 'remip_country_code' } })
      baseQuery.query.bool.must_not = baseQuery.query.bool.must_not || []
      baseQuery.query.bool.must_not.push({ term: { remip_country_code: 'ID' } })
    }

    let searchAfter
    while (alertsMap.size < maxAlerts) {
      const body = { ...baseQuery }
      if (searchAfter) body.search_after = searchAfter

      const auth = 'Basic ' + Buffer.from(`${credentials.elasticsearch_username}:${credentials.elasticsearch_password}`).toString('base64')
      const res = await globalThis.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body), timeout: 30000, agent: httpsAgent })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`Elasticsearch error ${res.status} ${res.statusText} - ${t.substring(0, 500)}`)
      }
      const data = await res.json()
      if (data?.error) throw new Error(`Elasticsearch error: ${JSON.stringify(data.error)}`)

      const hits = data?.hits?.hits || []
      if (!hits || hits.length === 0) break

      for (const hit of hits) {
        const src = hit._source || {}
        let parsedMessage = {}
        if (typeof src.message === 'string') {
          try { parsedMessage = JSON.parse(src.message) } catch { parsedMessage = {} }
        } else if (typeof src.message === 'object' && src.message) parsedMessage = src.message

        const ts = parseTimestamp(src)
        const vendorLogDesc = parsedMessage?.logdesc || src.logdesc
        const ruleDesc = src.rule_description || ''
        const title = vendorLogDesc || ruleDesc || (src.syslog_description || '[Unknown] Alert')

        // Determine Fortinet-specific action value (may be in parsed message)
        const actionVal = parsedMessage.action || src.action || parsedMessage?.data?.action || src.action

        // Build alert object
        const alert = {
          id: src.id || hit._id,
          externalId: src.id || hit._id,
          timestamp: ts,
          agent: { id: src.agent_id, name: src.agent_name, ip: src.agent_ip },
          rule: { id: src.rule_id, description: ruleDesc },
          // For Fortinet tunnel-up events outside Indonesia, normalize title
          title: (function() {
            const baseTitle = String(title).trim()
            try {
              if (isFortinet) {
                const remipCountry = (src.remip_country_code || parsedMessage.remip_country_code || '').toString().toLowerCase()
                const isTunnelUp = (actionVal || '').toString().toLowerCase() === 'tunnel-up'
                if (isTunnelUp && remipCountry && remipCountry !== 'id') {
                  return 'VPN Successful Outside Indonesia'
                }
              }
            } catch (e) {}
            return baseTitle
          })(),
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

      if (isFortinet) break
      const last = hits[hits.length - 1]
      searchAfter = last?.sort
      if (!searchAfter || hits.length < pageSize) break
    }
  }

  return Array.from(alertsMap.values())
}

async function main() {
  try {
    console.log('Starting manual Wazuh sync (standalone JS)...')
    const integrationId = 'cmispaga200b8jwvpdct2a2i6'
    const hoursBack = Number(process.env.HOURS_BACK || 48)
    const indexPattern = process.env.INDEX_PATTERN || 'wazuh-posindonesia_*'
    console.log('Integration ID:', integrationId)
    console.log('Hours back:', hoursBack)
    console.log('Index pattern:', indexPattern)

    const credentials = await getWazuhCredentialsFromDB(integrationId)
    console.log('[Wazuh Credentials] URL:', credentials.elasticsearch_url)
    console.log('[Wazuh Credentials] Username:', credentials.elasticsearch_username)
    console.log('[Wazuh Credentials] Index pattern:', credentials.elasticsearch_index)

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()
    console.log('[Wazuh] Fetching alerts since:', since)

    const wazuhAlerts = await searchAlertsFromElasticsearch(credentials, since, { indexPattern })
    console.log(`[Wazuh] searchAlerts returned ${Array.isArray(wazuhAlerts) ? wazuhAlerts.length : 0} alerts (raw)`)

    let stored = 0
    for (const alert of wazuhAlerts) {
      const existing = await prisma.alert.findUnique({ where: { externalId: alert.externalId } })
      if (!existing) {
        await prisma.alert.create({
          data: {
            externalId: alert.externalId,
            title: alert.title,
            description: `Agent: ${alert.agent.name} (${alert.agent.ip})\nRule: ${alert.rule.description}\nMessage: ${alert.message}`,
            severity: null,
            status: 'New',
            timestamp: alert.timestamp,
            metadata: {
              wazuh: true,
              agent: alert.agent,
              rule: alert.rule,
              srcIp: alert.srcIp,
              dstIp: alert.dstIp,
              srcPort: alert.srcPort,
              dstPort: alert.dstPort,
              protocol: alert.protocol,
              manager: alert.manager,
              cluster: alert.cluster,
              ...alert.metadata,
            },
            integrationId: integrationId,
          },
        })
        stored++
      }
    }

    console.log(`[Wazuh] Stored/Upserted alerts count: ${stored}`)
    console.log('✅ Sync completed (standalone JS)!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Sync failed:')
    console.error(err)
    process.exit(1)
  }
}

main()
