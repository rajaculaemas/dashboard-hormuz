import https from "https"

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

interface QRadarCredentials {
  host: string
  api_key: string
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

  constructor(credentials: QRadarCredentials) {
    // Normalize host: remove protocol and trailing slash
    const normalizedHost = credentials.host.replace(/^https?:\/\//i, "").replace(/\/$/, "")
    this.credentials = { ...credentials, host: normalizedHost }
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

    // Submit AQL query with comprehensive field selection
    const query = `
      SELECT 
        starttime, endtime, sourceip, destinationip, sourceport, destinationport,
        protocolid, eventcount, magnitude, identityip, username, 
        logsourceid, qid, category, severity, credibility, relevance,
        domainid, eventdirection, postnatdestinationip, postnatsourceip,
        prenatdestinationip, prenatsourceip, UTF8(payload) as payload,
        EventID, QIDNAME(qid) as event_name,
        logsourceidentifier,
        highlevelcategory,
        msg,
        AccountName,
        Command,
        Description,
        "EC File Path",
        "EC Filename",
        "EC Image",
        "EC ImageName", 
        "EC ImageTempPath",
        "EC MD5 Hash",
        "PS Encoded Command",
        "EC ParentImage",
        "EC ParentImageName",
        "EC Process Id",
        "Process ID",
        EventCategory,
        EventType,
        "@type",
        "File Directory",
        "File Path",
        Filename,
        "Logon Account Domain",
        "Logon Account Name", 
        "Logon Type",
        "Object Name",
        ObjectName,
        "Object Type",
        ObjectType,
        "Parent Command",
        "Parent Process Name",
        "Parent Process Path",
        "Process Name",
        "Process Path",
        Product,
        "CEF Product Name",
        "SHA1 Hash",
        "SHA256 Hash",
        Source,
        "Source Workstation",
        "Status Code",
        "Subject Account Name",
        "Target Username",
        "Target User Name",
        User,
        "User Domain",
        "malware family",
        "Threat Family",
        FwdDomain,
        sourceaddress,
        callerIp,
        "Source Asset",
        "Destination Asset",
        sourcemac,
        destinationmac,
        Application,
        App,
        "Effective User ID",
        "Parent Process ID",
        "User ID",
        ActionFlags,
        Bytes,
        "Bytes Received",
        BytesReceived,
        "Bytes Sent", 
        BytesSent,
        "Content Type",
        "Destination Zone",
        DestinationZone,
        "Device Name",
        DeviceName,
        "Elapsed Time",
        ElapsedTime,
        Flags,
        IngressInterface,
        EgressInterface,
        "LEEF Event ID",
        Packets,
        "Packets Received",
        "Packets Sent",
        "Paloalto Log Type",
        "Paloalto RuleID",
        "Paloalto Rule ID",
        ParentSessionID,
        RepeatCount,
        "Rule Name",
        RuleName,
        SessionID,
        "Source Zone",
        SourceZone,
        TunnelID,
        URL,
        URLCategory,
        "Web Category",
        dstBytes,
        dstPackets,
        proto,
        srcBytes,
        srcPackets,
        totalBytes,
        totalPackets,
        storedforperformance,
        devicetime,
        timestamp,
        suser
      FROM events 
      WHERE INOFFENSE(${offenseId}) 
      ORDER BY starttime DESC
      LAST 7 DAYS
    `

    // Submit search
    const searchResponse = await this.makeRequest<{
      search_id: string
      record_count: number
      status: string
    }>("POST", "/ariel/searches", { query_expression: query })

    const searchId = searchResponse.search_id
    console.log("[v0] QRadar: Search submitted with ID:", searchId)

    // Poll for completion
    let completed = false
    let attempts = 0
    const maxAttempts = 60 // 5 minutes with 5-second intervals (was 120 = 10 minutes)

    while (!completed && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)) // Wait 5 seconds

      const statusResponse = await this.makeRequest<{
        status: string
        progress: number
        record_count: number
        processed_record_count: number
        error_messages?: string[]
      }>("GET", `/ariel/searches/${searchId}`)

      console.log("[v0] QRadar: Search status:", statusResponse.status, "Progress:", statusResponse.progress + "%")

      if (statusResponse.status === "COMPLETED") {
        completed = true
      } else if (statusResponse.status === "ERROR" || statusResponse.status === "CANCELED") {
        throw new Error(`QRadar search failed: ${statusResponse.status}`)
      }

      attempts++
    }

    if (!completed) {
      throw new Error("QRadar search timeout")
    }

    // Get results - limit to 50 events (0-49)
    const resultsResponse = await this.makeRequest<{
      events: EventResponse[]
    }>("GET", `/ariel/searches/${searchId}/results`, undefined, {
      Range: "items=0-49",
    })

    const events = resultsResponse.events || []
    console.log("[v0] Fetched", events.length, "related events (limited to 25)")
    return events.slice(0, 50)
  }

  async updateOffenseStatus(
    offenseId: number,
    status: "OPEN" | "FOLLOW_UP" | "CLOSED",
    assignedTo?: string,
    closingReasonId?: number,
  ): Promise<OffenseResponse> {
    console.log("[v0] QRadar: Updating offense", offenseId, "to status:", status)

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

    return this.makeRequest<OffenseResponse>("POST", `/siem/offenses/${offenseId}`, params)
  }

  async getClosingReasons(): Promise<Array<{ id: number; text: string }>> {
    console.log("[v0] QRadar: Fetching closing reasons")
    return this.makeRequest<Array<{ id: number; text: string }>>("GET", "/siem/offense_closing_reasons")
  }
}
