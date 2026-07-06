import https from "https"

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

interface QRadarCredentials {
  host: string
  api_key: string
  domain_id?: number
}

interface OffenseResponse {
  id: number
  description: string
  severity: number
  magnitude: number
  credibility: number
  relevance: number
  status: string
  assigned_to: string | null
  offense_source: string
  categories: string[]
  rules: Array<{ id: number; type: string }>
  log_sources: Array<{ id: number; name: string; type_id: number; type_name: string }>
  device_count: number
  event_count: number
  flow_count: number
  source_count: number
  local_destination_count: number
  remote_destination_count: number
  username_count: number
  security_category_count: number
  policy_category_count: number
  category_count: number
  close_time: number | null
  closing_reason_id: number | null
  closing_user: string | null
  start_time: number
  last_updated_time: number
  last_persisted_time: number
  follow_up: boolean
  protected: boolean
  inactive: boolean
  offense_type: number
  domain_id: number
  source_network: string
  destination_networks: string[]
  source_address_ids: number[]
  local_destination_address_ids: number[]
}

interface EventResponse {
  starttime: number
  endtime: number
  sourceip: string
  destinationip: string
  sourceport: number
  destinationport: number
  protocolid: number
  eventcount: number
  magnitude: number
  identityip: string
  username: string | null
  logsourceid: number
  qid: number
  category: number
  severity: number
  credibility: number
  relevance: number
  domainid: number
  eventdirection: string
  postnatdestinationip: string
  postnatsourceip: string
  prenatdestinationip: string
  prenatsourceip: string
  payload: string
}

export class QRadarClient {
  private credentials: QRadarCredentials
  private baseUrl: string
  private domainId?: number

  constructor(credentials: QRadarCredentials) {
    // Normalize host: remove protocol and trailing slash
    const normalizedHost = credentials.host.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    this.credentials = { ...credentials, host: normalizedHost }
    this.domainId = credentials.domain_id
    this.baseUrl = `https://${normalizedHost}/api`
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    params?: Record<string, any>,
    customHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`)

    let body: string | undefined = undefined

    // For all requests, add params to query string (QRadar API preference)
    // POST with body will be handled separately if needed
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, String(value))
        }
      })
    }

    const headers: Record<string, string> = {
      SEC: this.credentials.api_key,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(customHeaders || {}),
    }

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body,
      })

      if (!response.ok) {
        let text = await response.text().catch(() => "")
        throw new Error(`QRadar API error: ${response.status} ${response.statusText} ${text}`)
      }

      // Some QRadar endpoints return plain text or empty bodies; try json but fall back to text
      const text = await response.text()
      try {
        return JSON.parse(text) as T
      } catch (e) {
        // @ts-ignore
        return (text as unknown) as T
      }
    } finally {
      // Reset environment variable
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
    }
  }

  async getOffenses(timeRangeMs: number, limit = 100): Promise<OffenseResponse[]> {
    const currentTimeMs = Date.now()
    const filterTimeMs = currentTimeMs - timeRangeMs

    console.log("[v0] QRadar: Fetching offenses with filter time:", filterTimeMs)

    const filter = `start_time>=${filterTimeMs}`

    return this.makeRequest<OffenseResponse[]>(
      "GET",
      "/siem/offenses",
      { filter },
      { Range: `items=0-${limit - 1}` },
    )
  }

  async getOffenseDetails(offenseId: number): Promise<OffenseResponse> {
    console.log("[v0] QRadar: Fetching offense details for ID:", offenseId)
    return this.makeRequest<OffenseResponse>("GET", `/siem/offenses/${offenseId}`)
  }

  async getRelatedEvents(offenseId: number, timeRangeHours = 24): Promise<EventResponse[]> {
    console.log("[v0] QRadar: Fetching related events for offense:", offenseId)

    const safeHours = Number.isFinite(timeRangeHours)
      ? Math.min(12, Math.max(1, Math.floor(timeRangeHours)))
      : 12

    const buildBaseRelatedEventsQuery = (hours: number) => `
      SELECT 
        starttime, endtime, sourceip, destinationip, sourceport, destinationport,
        protocolid, eventcount, magnitude, username, logsourceid, qid,
        category, severity, credibility, relevance, msg, payload
      FROM events
      WHERE INOFFENSE(${offenseId})
      LAST ${hours} HOURS
    `

    const buildEnrichedRelatedEventsQuery = (hours: number) => `
      SELECT
        starttime, endtime, sourceip, destinationip, sourceport, destinationport,
        protocolid, eventcount, magnitude, username, logsourceid, qid,
        category, severity, credibility, relevance, msg, payload,
        QIDNAME(qid) AS event_name
      FROM events
      WHERE INOFFENSE(${offenseId})
      LAST ${hours} HOURS
    `

    const executeRelatedEventsQuery = async (hours: number) => {
      try {
        // Try enriched query with QIDNAME first
        console.log(`[v0] QRadar: Attempting enriched query with QIDNAME for offense ${offenseId}`)
        return await this.executeAQL(buildEnrichedRelatedEventsQuery(hours), 15)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[v0] QRadar: Enriched QIDNAME query failed for offense ${offenseId}: ${message.substring(0, 200)}`)
        console.log(`[v0] QRadar: Falling back to base query without event_name`)
        try {
          return await this.executeAQL(buildBaseRelatedEventsQuery(hours), 15)
        } catch (baseError) {
          const baseMessage = baseError instanceof Error ? baseError.message : String(baseError)
          console.error(`[v0] QRadar: Base query also failed: ${baseMessage.substring(0, 100)}`)
          throw baseError
        }
      }
    }

    try {
      return await executeRelatedEventsQuery(safeHours)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("timeout") && safeHours > 3) {
        console.warn(`[v0] QRadar: related-events timeout for offense ${offenseId} at ${safeHours}h, retrying with 3h window`)
        return executeRelatedEventsQuery(3)
      }
      throw error
    }
  }

  async executeAQL(aqlQuery: string, maxResults = 50): Promise<any[]> {
    console.log("[v0] QRadar: Executing AQL:", aqlQuery.substring(0, 100) + "...")

    // Submit search
    const searchResponse = await this.makeRequest<{
      search_id: string
      record_count: number
      status: string
    }>("POST", "/ariel/searches", { query_expression: aqlQuery })

    const searchId = searchResponse.search_id
    console.log("[v0] QRadar: Search submitted with ID:", searchId)

    // Poll for completion (default max 8 minutes; configurable)
    let completed = false
    let attempts = 0
    const maxAttempts = Number(process.env.QRADAR_AQL_MAX_ATTEMPTS || 96)

    while (!completed && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000))

      const statusResponse = await this.makeRequest<{
        status: string
        progress: number
        record_count: number
        error_messages?: string[]
      }>("GET", `/ariel/searches/${searchId}`)

      console.log("[v0] QRadar: AQL status:", statusResponse.status, "Progress:", statusResponse.progress + "%")

      if (statusResponse.status === "COMPLETED") {
        completed = true
      } else if (statusResponse.status === "ERROR" || statusResponse.status === "CANCELED") {
        throw new Error(`QRadar AQL search failed: ${statusResponse.status}`)
      }

      attempts++
    }

    if (!completed) {
      throw new Error("QRadar AQL search timeout")
    }

    const resultsResponse = await this.makeRequest<{ events: any[] }>(
      "GET",
      `/ariel/searches/${searchId}/results`,
      undefined,
      { Range: `items=0-${maxResults - 1}` },
    )

    const events = resultsResponse.events || []
    console.log("[v0] QRadar: AQL returned", events.length, "results")
    
    // Log first event structure for debugging
    if (events.length > 0) {
      console.log("[v0] QRadar: First event structure:", JSON.stringify(events[0], null, 2))
    }
    
    return events.slice(0, maxResults)
  }

  async updateOffenseStatus(
    offenseId: number,
    status: "OPEN" | "FOLLOW_UP" | "CLOSED",
    assignedTo?: string,
    closingReasonId?: number,
  ): Promise<OffenseResponse> {
    console.log("[v0] QRadar: Updating offense", offenseId, "to status:", status, "with assignee:", assignedTo)

    const params: Record<string, any> = {
      status: status === "FOLLOW_UP" ? "OPEN" : status,
    }

    if (assignedTo) {
      params.assigned_to = assignedTo
    }

    if (status === "FOLLOW_UP") {
      params.follow_up = "true"
    }

    if (status === "CLOSED" && closingReasonId) {
      params.closing_reason_id = closingReasonId
    }

    // Include domain_id if configured
    if (this.domainId) {
      params.domain_id = this.domainId
    }

    console.log("[v0] QRadar: Request params:", JSON.stringify(params))

    return this.makeRequest<OffenseResponse>("POST", `/siem/offenses/${offenseId}`, params)
  }

  async getClosingReasons(): Promise<Array<{ id: number; text: string }>> {
    console.log("[v0] QRadar: Fetching closing reasons")
    return this.makeRequest<Array<{ id: number; text: string }>>("GET", "/siem/offense_closing_reasons")
  }

  async createNote(
    offenseId: number,
    noteText: string,
  ): Promise<{ id: number; create_time: number; username: string; note_text: string }> {
    console.log("[v0] QRadar: Creating note on offense", offenseId)

    const params = {
      note_text: noteText,
    }

    return this.makeRequest<{ id: number; create_time: number; username: string; note_text: string }>(
      "POST",
      `/siem/offenses/${offenseId}/notes`,
      params,
    )
  }

  async getOffenseNotes(
    offenseId: number,
  ): Promise<Array<{ id: number; create_time: number; username: string; note_text: string }>> {
    console.debug("[v0] QRadar: Fetching notes for offense", offenseId)

    return this.makeRequest<
      Array<{ id: number; create_time: number; username: string; note_text: string }>
    >("GET", `/siem/offenses/${offenseId}/notes`)
  }

  async getUsers(): Promise<Array<{ id: string; username: string }>> {
    console.log("[v0] QRadar: Fetching deployed users")
    
    interface QRadarUserResponse {
      id?: number
      username: string
      email?: string
      description?: string
      [key: string]: any
    }
    
    const users = await this.makeRequest<QRadarUserResponse[]>("GET", "/config/access/users")
    
    // Map QRadar users to simple id/username format (use username as ID)
    return users.map(user => ({
      id: user.username,
      username: user.username
    }))
  }
}
