import { Agent } from "undici"

interface SoarClientConfig {
  host: string
  keyId: string
  keySecret: string
  userAgent?: string
}

const insecureTlsDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
})

interface SoarCreateIncidentPayload {
  id?: number
  name: string
  description?: {
    format: "text" | "html" | "unknown"
    content: string
  }
  discovered_date?: number
  create_date?: number
  plan_status?: string
}

export interface SoarArtifact {
  /** SOAR artifact type name, e.g. "IP Address", "DNS Name", "String", "URL" */
  type: { name: string }
  value: string
  description?: { format: "text"; content: string }
}

function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//i, "").replace(/\/$/, "")
}

export class SoarClient {
  private readonly host: string
  private readonly keyId: string
  private readonly keySecret: string
  private readonly userAgent: string

  constructor(config: SoarClientConfig) {
    this.host = normalizeHost(config.host)
    this.keyId = config.keyId
    this.keySecret = config.keySecret
    this.userAgent = config.userAgent || "soar-app-soc-dashboard"
  }

  private buildHeaders(): Record<string, string> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": this.userAgent,
      Authorization: `Basic ${auth}`,
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, any> | any[],
  ): Promise<{ ok: boolean; status: number; data?: T; text?: string }> {
    const url = `https://${this.host}/rest${path}`
    const response = await fetch(url, {
      method,
      headers: this.buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      dispatcher: insecureTlsDispatcher,
    })

    const text = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        text,
      }
    }

    try {
      return {
        ok: true,
        status: response.status,
        data: text ? (JSON.parse(text) as T) : ({} as T),
      }
    } catch {
      return {
        ok: true,
        status: response.status,
        data: ({} as T),
      }
    }
  }

  async getOrganizations(): Promise<Array<{ id: string; name?: string }>> {
    const response = await this.request<any>("GET", "/orgs")
    if (!response.ok) {
      throw new Error(`SOAR list organizations failed: ${response.status} ${response.text || ""}`)
    }

    const raw = response.data
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.orgs)
        ? raw.orgs
        : Array.isArray(raw?.data)
          ? raw.data
          : []

    return candidates
      .map((item: any) => {
        const id = String(item?.id ?? item?.org_id ?? "").trim()
        if (!id) return null
        const name = item?.name ? String(item.name) : undefined
        return { id, name }
      })
      .filter(Boolean) as Array<{ id: string; name?: string }>
  }

  async getMaxIncidentIdForOrg(orgId: string): Promise<number> {
    // Query paged incidents ordered by id descending, take first result
    const queryBody = {
      start: 0,
      length: 1,
      sorts: [{ field_name: "id", type: "desc" }],
      filters: [],
      conditions: [],
    }

    const result = await this.request<any>(
      "POST",
      `/orgs/${encodeURIComponent(orgId)}/incidents/query_paged?want_closed=true`,
      queryBody,
    )

    if (!result.ok) {
      console.warn(`[SOAR] getMaxIncidentIdForOrg failed for org ${orgId}: ${result.status} ${result.text || ""}`)
      return 0
    }

    const data = result.data
    const items: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.incidents)
          ? data.incidents
          : []

    if (items.length === 0) return 0

    const ids = items.map((item: any) => Number(item?.id ?? item?.incident_id ?? 0)).filter((n) => n > 0)
    return ids.length > 0 ? Math.max(...ids) : 0
  }

  async getLatestIncidentIdGlobal(
    orgIds: string[],
    _startingFrom = 0,
  ): Promise<number> {
    if (orgIds.length === 0) return 0

    const results = await Promise.all(orgIds.map((orgId) => this.getMaxIncidentIdForOrg(orgId)))
    return Math.max(0, ...results)
  }

  async createIncident(orgId: string, payload: SoarCreateIncidentPayload): Promise<any> {
    const response = await this.request<any>(
      "POST",
      `/orgs/${encodeURIComponent(orgId)}/incidents?want_full_data=false&want_tasks=false`,
      payload,
    )

    if (!response.ok) {
      throw new Error(`SOAR create incident failed: ${response.status} ${response.text || ""}`)
    }

    return response.data
  }

  async addArtifacts(orgId: string, incidentId: number, artifacts: SoarArtifact[]): Promise<any> {    if (!artifacts || artifacts.length === 0) return null

    const response = await this.request<any>(
      "POST",
      `/orgs/${encodeURIComponent(orgId)}/incidents/${incidentId}/artifacts`,
      artifacts,
    )

    if (!response.ok) {
      // Non-fatal: log and continue — incident already created successfully
      console.warn(
        `[SOAR] addArtifacts failed for incident ${incidentId}: ${response.status} ${response.text || ""}`,
      )
      return null
    }

    return response.data
  }

  async getIncident(orgId: string, incidentId: number): Promise<any> {
    const response = await this.request<any>(
      "GET",
      `/orgs/${encodeURIComponent(orgId)}/incidents/${incidentId}`,
    )

    if (!response.ok) {
      throw new Error(`SOAR get incident failed: ${response.status} ${response.text || ""}`)
    }

    return response.data
  }

  async getIncidentArtifacts(orgId: string, incidentId: number): Promise<any[]> {
    // Use query_paged to get full artifact details including hits and location
    const queryBody = { start: 0, length: 100 }
    const response = await this.request<any>(
      "POST",
      `/orgs/${encodeURIComponent(orgId)}/incidents/${incidentId}/artifacts/query_paged`,
      queryBody,
    )

    if (!response.ok) {
      console.warn(
        `[SOAR] getIncidentArtifacts failed for incident ${incidentId}: ${response.status} ${response.text || ""}`,
      )
      return []
    }

    const data = response.data
    return Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.artifacts)
          ? data.artifacts
          : []
  }

  /**
   * Search incidents in an org that contain `keyword` in their name.
   * Used to find incidents created directly from QRadar (e.g. by offense ID "QRadar ID 10905").
   */
  async searchIncidentsByName(orgId: string, keyword: string): Promise<any[]> {
    const queryBody = {
      start: 0,
      length: 10,
      sorts: [{ field_name: "id", type: "desc" }],
      filters: [
        {
          conditions: [
            { field_name: "name", method: "contains", value: keyword },
          ],
        },
      ],
    }

    const response = await this.request<any>(
      "POST",
      `/orgs/${encodeURIComponent(orgId)}/incidents/query_paged?want_closed=true`,
      queryBody,
    )

    if (!response.ok) {
      throw new Error(`SOAR search incidents failed: ${response.status} ${response.text || ""}`)
    }

    const data = response.data
    return Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.incidents)
          ? data.incidents
          : []
  }
}
