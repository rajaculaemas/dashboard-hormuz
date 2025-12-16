import fetch from "node-fetch"
import https from "https"
import type { AlertStatus, StellarCyberAlert } from "@/lib/config/stellar-cyber"
import { urlunparse } from "@/lib/utils/url"
import prisma from "@/lib/prisma"

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

// Fungsi untuk mendapatkan kredensial dari database
const pick = (...values: any[]) => values.find((v) => v !== undefined && v !== null && `${v}`.length > 0) || ""

async function getStellarCyberCredentials(integrationId?: string) {
  try {
    // Jika integrationId disediakan, gunakan itu
    if (integrationId) {
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      })

      if (!integration || integration.source !== "stellar-cyber") {
        throw new Error("Stellar Cyber integration not found")
      }

      let credentials: Record<string, any> = {}

      if (Array.isArray(integration.credentials)) {
        const credentialsArray = integration.credentials as any[]
        credentialsArray.forEach((cred) => {
          if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
            credentials[cred.key] = cred.value
          }
        })
      } else {
        credentials = integration.credentials as Record<string, any>
      }

      const HOST = pick(
        credentials.host,
        credentials.HOST,
        credentials.STELLAR_CYBER_HOST,
        credentials.stellar_cyber_host,
        credentials.stellar_host,
        credentials.api_host,
        credentials.base_url,
        credentials.url,
      )

      const USER_ID = pick(
        credentials.user_id,
        credentials.USER_ID,
        credentials.username,
        credentials.user,
        credentials.email,
        credentials.login,
        credentials.account,
      )

      const REFRESH_TOKEN = pick(
        credentials.refresh_token,
        credentials.refreshToken,
        credentials.REFRESH_TOKEN,
        credentials.password,
        credentials.token,
        credentials.apiToken,
      )

      const TENANT_ID = pick(
        credentials.tenant_id,
        credentials.TENANT_ID,
        credentials.tenant,
        credentials.customer_id,
        credentials.cust_id,
      )

      const API_KEY = pick(
        credentials.api_key,
        credentials.API_KEY,
        credentials.apiKey,
        credentials.apiToken,
        credentials.api_token,
        credentials.token,
        credentials.key,
        credentials.secret,
        credentials.APIKEY,
        credentials.apikey,
        credentials["api-key"],
      )

      return {
        HOST,
        USER_ID,
        REFRESH_TOKEN,
        TENANT_ID,
        API_KEY,
      }
    }

    // Jika tidak ada integrationId, cari integrasi Stellar Cyber yang aktif
    const integration = await prisma.integration.findFirst({
      where: {
        source: "stellar-cyber",
        status: "connected",
      },
    })

    if (!integration) {
      // Fallback ke environment variables
      return {
        HOST: process.env.STELLAR_CYBER_HOST || "localhost",
        USER_ID: process.env.STELLAR_CYBER_USER_ID || "demo@example.com",
        REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN || "demo-token",
        TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID || "demo-tenant",
      }
    }

    let credentials: Record<string, any> = {}

    if (Array.isArray(integration.credentials)) {
      const credentialsArray = integration.credentials as any[]
      credentialsArray.forEach((cred) => {
        if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
          credentials[cred.key] = cred.value
        }
      })
    } else {
      credentials = integration.credentials as Record<string, any>
    }

    const HOST = pick(
      credentials.host,
      credentials.HOST,
      credentials.STELLAR_CYBER_HOST,
      credentials.stellar_cyber_host,
      credentials.stellar_host,
      credentials.api_host,
      credentials.base_url,
      credentials.url,
    )

    const USER_ID = pick(
      credentials.user_id,
      credentials.USER_ID,
      credentials.username,
      credentials.user,
      credentials.email,
      credentials.login,
      credentials.account,
    )

    const REFRESH_TOKEN = pick(
      credentials.refresh_token,
      credentials.refreshToken,
      credentials.REFRESH_TOKEN,
      credentials.password,
      credentials.token,
      credentials.apiToken,
    )

    const TENANT_ID = pick(
      credentials.tenant_id,
      credentials.TENANT_ID,
      credentials.tenant,
      credentials.customer_id,
      credentials.cust_id,
    )

    const API_KEY = pick(
      credentials.api_key,
      credentials.API_KEY,
      credentials.apiKey,
      credentials.apiToken,
      credentials.api_token,
      credentials.token,
      credentials.key,
      credentials.secret,
      credentials.APIKEY,
      credentials.apikey,
      credentials["api-key"],
    )

    return {
      HOST,
      USER_ID,
      REFRESH_TOKEN,
      TENANT_ID,
      API_KEY,
    }
  } catch (error) {
    console.error("Error getting Stellar Cyber credentials:", error)
    // Fallback ke environment variables
    return {
      HOST: process.env.STELLAR_CYBER_HOST || "localhost",
      USER_ID: process.env.STELLAR_CYBER_USER_ID || "demo@example.com",
      REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN || "demo-token",
      TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID || "demo-tenant",
      API_KEY: process.env.STELLAR_CYBER_API_KEY || "",
    }
  }
}

// Fungsi untuk mendapatkan access token
export async function getAccessToken(integrationId?: string): Promise<string> {
  const { HOST, USER_ID, REFRESH_TOKEN, TENANT_ID } = await getStellarCyberCredentials(integrationId)

  console.log("Checking credentials:", {
    HOST: HOST === "localhost" ? "localhost (default)" : "configured",
    USER_ID: USER_ID === "demo@example.com" ? "demo (default)" : "configured",
    REFRESH_TOKEN: REFRESH_TOKEN === "demo-token" ? "demo (default)" : "configured",
    TENANT_ID: TENANT_ID === "demo-tenant" ? "demo (default)" : "configured",
  })

  // Jika environment variables tidak tersedia, kembalikan token dummy untuk development
  if (!HOST || HOST === "localhost" || !USER_ID || !REFRESH_TOKEN || !TENANT_ID) {
    console.warn("Stellar Cyber credentials not properly configured. Using dummy token for development.")
    return "dummy-access-token-for-development"
  }

  const auth = Buffer.from(`${USER_ID}:${REFRESH_TOKEN}:${TENANT_ID}`).toString("base64")

  const headers = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  }

  const url = urlunparse({
    protocol: "https",
    hostname: HOST,
    pathname: "/connect/api/v1/access_token",
  })

  try {
    console.log("Requesting access token from:", url)

    // Allow self-signed certs for on-prem deployments (temporary, per-request)
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
      })

      console.log("Access Token Request Status:", response.status)

      if (!response.ok) {
        console.error(`Failed to get access token: ${response.status} ${response.statusText}`)
        return "error-token-for-fallback"
      }

      const data = await response.json()
      return data.access_token
    } finally {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    }
  } catch (error) {
    console.error("Error getting access token:", error)
    return "error-token-for-fallback"
  }
}

// Fungsi untuk mendapatkan daftar alert
export async function getAlerts(params: {
  minScore?: number
  status?: AlertStatus
  sort?: string
  order?: "asc" | "desc"
  limit?: number
  page?: number
  integrationId?: string
  daysBack?: number  // Allow custom time range (default 7 days)
}): Promise<StellarCyberAlert[]> {
  const { minScore = 0, status, sort = "timestamp", order = "desc", limit = 100, page = 1, integrationId, daysBack = 7 } = params
  const { HOST, TENANT_ID } = await getStellarCyberCredentials(integrationId)

  if (!HOST || !TENANT_ID) {
    console.warn("Stellar Cyber credentials not properly configured. Using mock data.")
    return generateMockAlerts()
  }

  try {
    const token = await getAccessToken(integrationId)
    if (!token || token === "dummy-access-token-for-development" || token === "error-token-for-fallback") {
      console.warn("Fallback token used. Returning mock data.")
      return generateMockAlerts()
    }

    // Build query parameters
    const queryParams: Record<string, string> = {
      size: limit.toString(),
    }

    // Add filters
    const mustClauses = [`tenantid:${TENANT_ID}`]

    if (status) {
      mustClauses.push(`event_status:${status}`)
    }

    if (minScore > 0) {
      mustClauses.push(`score:>=${minScore}`)
    }

    // Date range filter (configurable days back, default 7 days in UTC+7)
    const now = new Date()
    const tzOffset = 7 * 60 * 60 * 1000 // UTC+7
    const localTime = new Date(now.getTime() + tzOffset)
    const startDate = new Date(localTime.getTime() - daysBack * 24 * 60 * 60 * 1000) // N days ago

    mustClauses.push(`timestamp:[${startDate.toISOString()} TO ${localTime.toISOString()}]`)

    queryParams.q = mustClauses.join(" AND ")

    if (sort) {
      queryParams.sort = `${sort}:${order}`
    }

    const url = urlunparse({
      protocol: "https",
      hostname: HOST,
      pathname: "/connect/api/data/aella-ser-*/_search",
      search: new URLSearchParams(queryParams).toString(),
    })

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }

    console.log("Final request URL:", url)

    // Allow self-signed certs for on-prem Stellar Cyber
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    let data: any = null
    try {
      const response = await fetch(url, {
        method: "GET",
        headers,
      })

      console.log("Response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Failed to get alerts: ${response.status} ${response.statusText}`, errorText)
        return generateMockAlerts()
      }

      data = await response.json()

      if (!data.hits || !data.hits.hits) {
        console.warn("No hits in response.")
        return []
      }
    } finally {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    }

    // Process response data dengan field tambahan dari JSON yang diberikan
    // Helper function to map numeric severity to string
    const mapSeverityToString = (severity: any): string => {
      if (typeof severity === "string") {
        const lower = severity.toLowerCase()
        if (["critical", "high", "medium", "low"].includes(lower)) {
          return severity.charAt(0).toUpperCase() + severity.slice(1)
        }
      }

      const numSeverity = Number(severity) || 0
      if (numSeverity >= 80) return "Critical"
      if (numSeverity >= 60) return "High"
      if (numSeverity >= 40) return "Medium"
      return "Low"
    }

    const alerts: StellarCyberAlert[] = data.hits.hits.map((hit: any) => {
      const source = hit._source || {}
      const stellar = source.stellar || {}
      const user_action = source.user_action || {}
      const xdr_event = source.xdr_event || {}

      // Log alerts without MTTD data for debugging
      if (!user_action?.alert_to_first && user_action?.history?.length > 0) {
        console.log('[Stellar Cyber] Alert without MTTD despite history:', {
          alertId: hit._id,
          title: source.xdr_event?.display_name || source.event_name,
          hasUserAction: !!source.user_action,
          userActionKeys: Object.keys(user_action),
          historyCount: user_action?.history?.length,
          alert_to_first: user_action?.alert_to_first,
        })
      }

      // Helper function to handle timestamp conversion
      const convertTimestamp = (ts: any): string => {
        if (!ts) return ""
        if (typeof ts === "string" && ts.includes("T")) return ts

        const timestamp = typeof ts === "number" ? ts : Number.parseInt(ts)
        return new Date(timestamp).toISOString()
      }

      return {
        _id: hit._id || stellar.uuid || "",
        _index: hit._index || "",
        index: hit._index || "",
        cust_id: source.cust_id || source.customer_id || "",
        title: source.xdr_event?.display_name || source.event_name || "Unknown Alert",
        description: xdr_event.description || source.xdr_event?.description || "",
        severity: mapSeverityToString(source.severity),
        status: source.event_status || stellar.status || "New",
        created_at: convertTimestamp(source.timestamp),
        updated_at: convertTimestamp(source.write_time),
        timestamp: convertTimestamp(source.timestamp),
        source: source.msg_origin?.source || "Stellar Cyber",
        score: source.event_score || source.score || 0,
        metadata: {
          // Basic alert info
          alert_id: hit._id,
          alert_index: hit._index,
          cust_id: source.cust_id || source.customer_id || "",
          alert_time: convertTimestamp(stellar.alert_time),
          severity: mapSeverityToString(source.severity),
          event_status: source.event_status,
          alert_type: source.event_type,
          closed_time: convertTimestamp(user_action.last_timestamp),
          assignee: source.assignee,
          tenant_name: source.tenant_name,
          timestamp: convertTimestamp(source.timestamp),

          // Application info
          appid_family: source.appid_family,
          appid_name: source.appid_name,
          appid_stdport: source.appid_stdport,
          repeat_count: source.repeat_count || 1,

          // Network info - Source IP
          srcip: source.srcip,
          srcip_reputation: source.srcip_reputation,
          srcip_type: source.srcip_type,
          srcip_version: source.srcip_version,
          srcip_host: source.srcip_host,
          srcip_username: source.srcip_username,
          srcip_reputation_source: source.srcip_reputation_source,
          srcmac: source.srcmac,
          srcport: source.srcport,
          // Source IP Geo - Breakdown
          srcip_geo_city: source.srcip_geo?.city,
          srcip_geo_country_code: source.srcip_geo?.countryCode,
          srcip_geo_country_name: source.srcip_geo?.countryName,
          srcip_geo_region: source.srcip_geo?.region,
          srcip_geo_latitude: source.srcip_geo?.latitude,
          srcip_geo_longitude: source.srcip_geo?.longitude,
          srcip_geo_point: source.srcip_geo_point,
          srcip_geo_source: source.srcip_geo_source,

          // Network info - Destination IP
          dstip: source.dstip,
          dstip_reputation: source.dstip_reputation,
          dstip_type: source.dstip_type,
          dstip_version: source.dstip_version,
          dstip_host: source.dstip_host,
          dstmac: source.dstmac,
          dstport: source.dstport,
          // Destination IP Geo - Breakdown
          dstip_geo_city: source.dstip_geo?.city,
          dstip_geo_country_code: source.dstip_geo?.countryCode,
          dstip_geo_country_name: source.dstip_geo?.countryName,
          dstip_geo_region: source.dstip_geo?.region,
          dstip_geo_latitude: source.dstip_geo?.latitude,
          dstip_geo_longitude: source.dstip_geo?.longitude,
          dstip_geo_point: source.dstip_geo_point,

          // Protocol & Traffic info
          proto: source.proto,
          proto_name: source.proto_name,
          msg_class: source.msg_class,
          event_category: source.event_category,
          duration: source.duration,
          inbytes_total: source.inbytes_total,
          outbytes_total: source.outbytes_total,
          inpkts_delta: source.inpkts_delta,
          outpkts_delta: source.outpkts_delta,
          totalpackets: source.totalpackets,
          totalbytes: source.totalbytes,

          // Flow & Connection info
          state: source.state,
          tcp_rtt: source.tcp_rtt,
          end_reason: source.end_reason,
          // Message Origin - Breakdown
          msg_origin_source: source.msg_origin?.source,
          msg_origin_category: source.msg_origin?.category,
          msg_origin_processor_type: source.msg_origin?.processor?.type,
          event_source: source.event_source,

          // Engine & Deployment info
          engid: source.engid,
          engid_name: source.engid_name,
          engid_gateway: source.engid_gateway,
          port_name: source.port_name,
          netid: source.netid,
          netid_name: source.netid_name,
          locid: source.locid,

          // Organization & Tenant info
          org_id: source.org_id,
          org_name: source.org_name,
          tenantid: source.tenantid,

          // Detection & Deduplication info
          detection_id: source._detection_id,
          detected_fields: source.detected_fields,
          detected_values: source.detected_values,
          // ATH Deduplication - Breakdown
          ath_dedup_first_time_utc: source.ath_deduplication?.first_time_utc,
          ath_dedup_first_timestamp: source.ath_deduplication?.first_timestamp,
          ath_dedup_last_time_utc: source.ath_deduplication?.last_time_utc,
          ath_dedup_last_timestamp: source.ath_deduplication?.last_timestamp,
          ath_dedup_repeat_count: source.ath_deduplication?.repeat_count,
          // ATH Info - Breakdown
          ath_rule_name: source.ath_info?.rule_name,
          ath_scheduled_time_utc: source.ath_info?.scheduled_time_utc,
          ath_scheduled_timestamp: source.ath_info?.scheduled_timestamp,

          // Scoring info
          event_score: source.event_score,
          threat_score: source.threat_score,
          fidelity: source.fidelity,
          flow_score: source.flow_score,

          // XDR & Killchain info
          xdr_display_name: source.xdr_event?.display_name,
          xdr_name: source.xdr_event?.name,
          xdr_description: source.xdr_event?.description,
          xdr_framework_version: source.xdr_event?.framework_version,
          xdr_killchain_stage: source.xdr_event?.xdr_killchain_stage,
          xdr_killchain_version: source.xdr_event?.xdr_killchain_version,
          xdr_scope: source.xdr_event?.scope,
          xdr_tags: source.xdr_event?.tags,
          // XDR Tactic - Breakdown
          xdr_tactic_id: source.xdr_event?.tactic?.id,
          xdr_tactic_name: source.xdr_event?.tactic?.name,
          // XDR Technique - Breakdown
          xdr_technique_id: source.xdr_event?.technique?.id,
          xdr_technique_name: source.xdr_event?.technique?.name,

          // User Action & Timeline - Breakdown
          user_action_last_user: source.user_action?.last_user,
          user_action_last_action: source.user_action?.last_action,
          user_action_last_modified: convertTimestamp(source.user_action?.last_modified),
          // MTTD: Time from alert creation to first assignee change (in milliseconds)
          user_action_alert_to_first: source.user_action?.alert_to_first,
          user_action_alert_to_last: source.user_action?.alert_to_last,
          user_action_first_to_last: source.user_action?.first_to_last,
          user_action_first_timestamp: convertTimestamp(source.user_action?.first_timestamp),
          user_action_last_timestamp: convertTimestamp(source.user_action?.last_timestamp),
          user_action_history_count: source.user_action?.history?.length || 0,

          // Comments - Breakdown (array of comments)
          comment_count: source.comments?.length || 0,
          // First comment details (most recent)
          comment_latest_text: source.comments?.[0]?.comment,
          comment_latest_time: convertTimestamp(source.comments?.[0]?.comment_time),
          comment_latest_user: source.comments?.[0]?.comment_user,

          // Event Summary info
          event_name: source.event_name,
          event_type: source.event_type,
          event_summary: source.event_summary,
          msgtype: source.msgtype,
          msgtype_name: source.msgtype_name,
          // Preserve original metadata and ensure index is captured for status updates
          ...source.metadata,
          // IMPORTANT: Store full user_action object so SLA Dashboard can calculate MTTD from history
          user_action: source.user_action,
          index:
            (source as any).stellar_index ||
            (source as any).stellar_index_id ||
            (source as any).orig_index ||
            (source as any).index ||
            (source as any)._index ||
            (source.metadata && (source.metadata as any).index),
        },
      }
    })

    console.log(`✅ Total alerts fetched: ${alerts.length}`)
    return alerts
  } catch (error) {
    console.error("Error getting alerts:", error)
    return generateMockAlerts()
  }
}

// Fungsi untuk menghasilkan data dummy
function generateMockAlerts(): StellarCyberAlert[] {
  // Disable mock alerts - return empty array if connection fails
  return []
}

// Fungsi untuk mengupdate status alert
export async function updateAlertStatus(params: {
  index: string
  alertId: string
  status: AlertStatus
  comments?: string
  assignee?: string
  integrationId?: string
}): Promise<any> {
  const { index, alertId, status, comments = "", assignee, integrationId } = params
  const { HOST, USER_ID, REFRESH_TOKEN, API_KEY } = await getStellarCyberCredentials(integrationId)

  // Prefer API key auth (documented for update_ser). Fallback to bearer token if only refresh token exists.
  const hasBasicAuth = !!(USER_ID && API_KEY)
  const canFetchToken = !!(USER_ID && REFRESH_TOKEN)

  if (!HOST || HOST === "localhost" || (!hasBasicAuth && !canFetchToken)) {
    console.warn("Stellar Cyber credentials not properly configured. Using mock response.")
    return { success: true, message: "Status updated (mock)" }
  }

  try {
    const url = urlunparse({
      protocol: "https",
      hostname: HOST,
      pathname: "/connect/api/update_ser",
    })

    const headers = {
      "Content-Type": "application/json",
    } as Record<string, string>

    if (hasBasicAuth) {
      headers.Authorization = "Basic " + Buffer.from(`${USER_ID}:${API_KEY}`).toString("base64")
    } else {
      const token = await getAccessToken(integrationId)
      if (token === "dummy-access-token-for-development" || token === "error-token-for-fallback") {
        return { success: true, message: "Status updated (mock)" }
      }
      headers.Authorization = `Bearer ${token}`
    }

    const payload = {
      index,
      _id: alertId,
      status,
      ...(comments && { comments }),
      ...(assignee && { assignee }),
    }

    console.log("Updating alert status with payload:", payload)

    // Allow self-signed certs for this request
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })

      const responseText = await response.text()
      console.log("Update status response:", response.status, responseText)

      if (!response.ok) {
        console.error(`Failed to update alert status: ${response.status} ${response.statusText}`)
        return { success: false, message: responseText || "Failed to update status" }
      }

      try {
        return JSON.parse(responseText)
      } catch {
        return { success: true, message: responseText || "Status updated" }
      }
    } finally {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    }
  } catch (error) {
    console.error("Error updating alert status:", error)
    return { success: false, message: "Error updating status" }
  }
}
