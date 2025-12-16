import prisma from "@/lib/prisma"
import https from "https"
import axios from "axios"
import { v4 as uuidv4 } from "uuid"

// Create HTTPS agent that ignores self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

export class StellarCyberCaseClient {
  private host: string
  private userId: string
  private tenantId: string
  private refreshToken: string
  private baseUrl: string

  constructor(host: string, userId: string, tenantId: string, refreshToken: string) {
    // Ensure host has protocol
    this.host = host.startsWith("http") ? host : `https://${host}`
    this.userId = userId
    this.tenantId = tenantId
    this.refreshToken = refreshToken
    this.baseUrl = `${this.host}/connect/api/v1`
  }

  // Always get fresh token like Python does - no caching
  private async getAccessToken(): Promise<string> {
    // Create Basic auth header exactly like Python code

    const nonce = Date.now()
    const auth = Buffer.from(`${this.userId}:${this.refreshToken}:${nonce}`).toString("base64")

    console.log("Getting fresh access token from:", `${this.baseUrl}/access_token`)
    console.log("Using credentials:", {
      userId: this.userId,
      refreshToken: this.refreshToken.substring(0, 10) + "...",
    })

    // Set NODE_TLS_REJECT_UNAUTHORIZED at runtime for this fetch
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    if (this.host.startsWith("https://")) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }

    try {
      const response = await fetch(`${this.baseUrl}/access_token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      })

      console.log("Access token response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Access token error:", errorText)
        throw new Error(`Failed to get access token: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log("Fresh access token obtained successfully")
      console.log("Full Access Token:\n", data.access_token) // tampilkan semua
      console.log("Token (first 10 chars):", data.access_token.substring(0, 10) + "...")
      return data.access_token
    } finally {
      // Restore original value
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
      }
    }
  }

  async getCases(params: {
    from?: number
    to?: number
    limit?: number
    status?: string
  }) {
    const token = await this.getAccessToken()

    // Build query params exactly like Python code
    const queryParams = new URLSearchParams({
      tenantid: this.tenantId,
      limit: (params.limit || 100).toString(),
    })

    if (params.from) {
      queryParams.append("FROM~created_at", params.from.toString())
    }

    if (params.to) {
      queryParams.append("TO~created_at", params.to.toString())
    }

    console.log("Getting cases with params:", queryParams.toString())

    const url = `${this.baseUrl}/cases?${queryParams.toString()}`
    console.log("Making request to:", url)

    // Set NODE_TLS_REJECT_UNAUTHORIZED at runtime
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    if (this.host.startsWith("https://")) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      console.log("Response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API error:", errorText)
        throw new Error(`Stellar Cyber API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log("Cases response received, processing...")

      // Log detailed case information
      if (result.data && result.data.cases) {
        console.log(`Total cases from API: ${result.data.cases.length}`)

        // Log status distribution
        const statusCounts = {}
        result.data.cases.forEach((c) => {
          statusCounts[c.status] = (statusCounts[c.status] || 0) + 1
        })
        console.log("Status distribution from Stellar Cyber:", statusCounts)

      // Log first few cases with details
      console.log("First 3 cases details:")
      result.data.cases.slice(0, 3).forEach((c, i) => {
        console.log(`  Case ${i + 1}:`)
        console.log(`    ID: ${c._id}`)
        console.log(`    Name: ${c.name}`)
        console.log(`    Status: ${c.status}`)
        console.log(`    Severity: ${c.severity}`)
        console.log(`    Assignee: ${c.assignee} (${c.assignee_name})`)
        console.log(`    Created: ${new Date(c.created_at).toISOString()}`)
        console.log(`    Modified: ${new Date(c.modified_at).toISOString()}`)
        console.log(`    Version: ${c.version}`)
      })
    }

      return result
    } finally {
      // Restore original value
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
      }
    }
  }

  // Implement exactly like Python getCases function but for alerts
  async getCaseAlerts(caseId: string) {
    const requestId = uuidv4()
    const token = await this.getAccessToken()

    const url = `${this.baseUrl}/cases/${caseId}/alerts?skip=0&limit=100`

    console.log(`[${requestId}] Final URL:`, url)

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Request-ID": requestId,
          Accept: "application/json",
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        // Tambahkan parameter untuk prevent caching
        params: {
          _: Date.now(), // Tambahkan timestamp sebagai query param
        },
      })

      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[${requestId}] Axios Error:`, {
          status: error.response?.status,
          data: error.response?.data,
          headers: error.response?.headers,
        })
      } else {
        console.error(`[${requestId}] Unknown Error:`, error)
      }
      return { data: { docs: [] } }
    }
  }

  async updateCase(
    caseId: string,
    updates: {
      status?: string
      assignee?: string
      severity?: string
      name?: string
      tags?: {
        delete?: string[]
        add?: string[]
      }
    },
  ) {
    console.log("Updating case:", caseId, "with:", updates)

    const token = await this.getAccessToken()
    const url = `${this.baseUrl}/cases/${caseId}`

    // Set NODE_TLS_REJECT_UNAUTHORIZED at runtime
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    if (this.host.startsWith("https://")) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API error:", errorText)
        throw new Error(`Stellar Cyber API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log("Case updated successfully:", result)

      // Return success format that our code expects
      return {
        success: true,
        data: result.data || result,
        message: "Case updated successfully",
      }
    } finally {
      // Restore original value
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
      }
    }
  }

  async getCase(caseId: string) {
    console.log("Fetching case:", caseId)

    const token = await this.getAccessToken()
    const url = `${this.baseUrl}/cases/${caseId}`

    // Set NODE_TLS_REJECT_UNAUTHORIZED at runtime
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    if (this.host.startsWith("https://")) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API error:", errorText)
        throw new Error(`Stellar Cyber API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log("Case fetched successfully:", result)

      // Return the case data
      return {
        success: true,
        data: result.data || result,
        message: "Case fetched successfully",
      }
    } finally {
      // Restore original value
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
      }
    }
  }

  async createCase(caseData: {
    name: string
    alerts: Array<{
      _id: string
      _index: string
    }>
    cust_id?: string
    severity?: string
    status?: string
    assignee?: string
    tags?: string[]
    comment?: string
  }) {
    console.log("Creating case with data:", caseData)

    const token = await this.getAccessToken()
    const url = `${this.baseUrl}/cases`

    // Set NODE_TLS_REJECT_UNAUTHORIZED at runtime
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
    if (this.host.startsWith("https://")) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: caseData.name,
          alerts: caseData.alerts || [],
          cust_id: caseData.cust_id || "",
          severity: caseData.severity || "Low",
          status: caseData.status || "New",
          assignee: caseData.assignee || "",
          tags: caseData.tags || [],
          comment: caseData.comment || "",
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error("API error:", errorText)
        throw new Error(`Stellar Cyber API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log("Case created successfully:", result)

      return {
        success: true,
        data: result.data || result,
        message: "Case created successfully",
      }
    } finally {
      // Restore original value
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized
      }
    }
  }

  static transformCase(stellarCase: any) {
    return {
      externalId: stellarCase._id,
      ticketId: stellarCase.ticket_id?.toString() || stellarCase._id,
      name: stellarCase.name,
      status: stellarCase.status,
      severity: stellarCase.severity,
      assignee: stellarCase.assignee,
      assigneeName: stellarCase.assignee_name,
      createdAt: new Date(stellarCase.created_at),
      updatedAt: new Date(stellarCase.modified_at),
      acknowledgedAt: stellarCase.acknowledged ? new Date(stellarCase.acknowledged) : null,
      closedAt: stellarCase.closed ? new Date(stellarCase.closed) : null,
      startTimestamp: stellarCase.start_timestamp ? new Date(stellarCase.start_timestamp) : null,
      endTimestamp: stellarCase.end_timestamp ? new Date(stellarCase.end_timestamp) : null,
      score: stellarCase.score,
      size: stellarCase.size,
      tags: stellarCase.tags,
      version: stellarCase.version,
      createdBy: stellarCase.created_by,
      createdByName: stellarCase.created_by_name,
      modifiedBy: stellarCase.modified_by,
      modifiedByName: stellarCase.modified_by_name,
      custId: stellarCase.cust_id,
      tenantName: stellarCase.tenant_name,
      metadata: stellarCase,
    }
  }
}

// Fungsi untuk mendapatkan kredensial dari database
async function getStellarCyberCredentials(integrationId?: string) {
  try {
    let integration

    if (integrationId) {
      integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      })
    } else {
      integration = await prisma.integration.findFirst({
        where: {
          source: "stellar-cyber",
          status: "connected",
        },
      })
    }

    if (!integration) {
      throw new Error("Stellar Cyber integration not found")
    }

    console.log("Found integration:", integration.name)

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

    console.log("Credentials keys:", Object.keys(credentials))

    return {
      HOST: credentials.host || credentials.STELLAR_CYBER_HOST || "",
      USER_ID: credentials.user_id || credentials.STELLAR_CYBER_USER_ID || "",
      REFRESH_TOKEN: credentials.refresh_token || credentials.STELLAR_CYBER_REFRESH_TOKEN || "",
      TENANT_ID: credentials.tenant_id || credentials.STELLAR_CYBER_TENANT_ID || "",
    }
  } catch (error) {
    console.error("Error getting Stellar Cyber credentials:", error)
    throw error
  }
}

// Helper function to get cases from Stellar Cyber
export async function getCases(params: { limit?: number; integrationId?: string }) {
  try {
    console.log("Getting cases with params:", params)

    const credentials = await getStellarCyberCredentials(params.integrationId)

    console.log("Using credentials:", {
      HOST: credentials.HOST,
      USER_ID: credentials.USER_ID,
      TENANT_ID: credentials.TENANT_ID,
      REFRESH_TOKEN: credentials.REFRESH_TOKEN ? "***" : "missing",
    })

    if (!credentials.HOST || !credentials.USER_ID || !credentials.TENANT_ID || !credentials.REFRESH_TOKEN) {
      throw new Error("Missing Stellar Cyber credentials")
    }

    const client = new StellarCyberCaseClient(
      credentials.HOST,
      credentials.USER_ID,
      credentials.TENANT_ID,
      credentials.REFRESH_TOKEN,
    )

    // Get cases from last 30 days to ensure we get some data
    const now = Date.now()
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000

    console.log("Fetching cases from:", new Date(thirtyDaysAgo), "to:", new Date(now))

    const response = await client.getCases({
      from: thirtyDaysAgo,
      to: now,
      limit: params.limit || 1000,
    })

    const cases = response.data?.cases || []
    console.log(`Found ${cases.length} cases from Stellar Cyber`)

    return cases
  } catch (error) {
    console.error("Error fetching cases from Stellar Cyber:", error)
    throw error
  }
}

// Helper function to get case alerts from Stellar Cyber
export async function getCaseAlerts(params: { caseId: string; integrationId?: string }) {
  try {
    const credentials = await getStellarCyberCredentials(params.integrationId)

    if (!credentials.HOST || !credentials.USER_ID || !credentials.TENANT_ID || !credentials.REFRESH_TOKEN) {
      throw new Error("Missing Stellar Cyber credentials")
    }

    console.log("Creating client with credentials for alerts...")

    const client = new StellarCyberCaseClient(
      credentials.HOST,
      credentials.USER_ID,
      credentials.TENANT_ID,
      credentials.REFRESH_TOKEN,
    )

    console.log(`Fetching alerts for case: ${params.caseId}`)

    const response = await client.getCaseAlerts(params.caseId)

    // Transform alerts data sesuai dengan struktur raw data yang diberikan
    const alerts = response.data?.docs || response.data?.alerts || response.data || []
    console.log(`Processing ${alerts.length} alerts for case ${params.caseId}`)

    if (!Array.isArray(alerts)) {
      console.log("Alerts data is not an array:", alerts)
      return []
    }

    return alerts.map((doc: any, idx: number) => {
      // Handle different response structures
      const source = doc._source || doc
      const xdr_event = source.xdr_event || {}
      const stellar = source.stellar || {}

      console.log(`Alert ${idx} source fields:`, {
        stellar_alert_time: stellar.alert_time,
        source_timestamp: source.timestamp,
        source_created_at: source.created_at,
        source_alert_time: source.alert_time,
        all_keys: Object.keys(source).slice(0, 20), // First 20 keys for debug
      })

      // Normalize alert_time to milliseconds
      // Try to find the actual alert timestamp field
      let alertTimeMs = source.alert_time || stellar.alert_time || source.timestamp || source.created_at || Date.now()
      
      // Convert to milliseconds if needed
      if (typeof alertTimeMs === "string") {
        alertTimeMs = new Date(alertTimeMs).getTime()
      } else if (typeof alertTimeMs === "number" && alertTimeMs < 1000000000000) {
        // If it's a number < year 2001 in ms, assume it's in seconds
        alertTimeMs = alertTimeMs * 1000
      }

      console.log(`Alert ${idx} alert_time: raw=${alertTimeMs}, ms=${alertTimeMs}, date=${new Date(alertTimeMs)}`)

      return {
        _id: doc._id || doc.id || `alert-${Date.now()}-${Math.random()}`,
        alert_name: xdr_event.display_name || source.event_name || source.name || "Unknown Alert",
        xdr_event: {
          display_name: xdr_event.display_name || source.event_name || source.name || "Unknown Alert",
        },
        severity: source.severity || "medium",
        alert_time: alertTimeMs, // Always in milliseconds
        status: source.event_status || stellar.status || source.status || "New",
        source_ip: source.srcip || source.source_ip,
        dest_ip: source.dstip || source.dest_ip,
        description: xdr_event.description || source.description || "",
        metadata: source,
      }
    })
  } catch (error) {
    console.error("Error fetching case alerts from Stellar Cyber:", error)

    // Return empty array instead of throwing to prevent UI breaking
    return []
  }
}

// Helper function to update case in Stellar Cyber
export async function updateCaseInStellarCyber(params: {
  caseId: string
  integrationId?: string
  updates: {
    status?: string
    assignee?: string
    severity?: string
  }
}) {
  try {
    const credentials = await getStellarCyberCredentials(params.integrationId)

    if (!credentials.HOST || !credentials.USER_ID || !credentials.TENANT_ID || !credentials.REFRESH_TOKEN) {
      throw new Error("Missing Stellar Cyber credentials")
    }

    const client = new StellarCyberCaseClient(
      credentials.HOST,
      credentials.USER_ID,
      credentials.TENANT_ID,
      credentials.REFRESH_TOKEN,
    )

    const response = await client.updateCase(params.caseId, params.updates)

    console.log("Case updated successfully in Stellar Cyber:", response)
    return response
  } catch (error) {
    console.error("Error updating case in Stellar Cyber:", error)
    throw error
  }
}

// Helper function to get single case from Stellar Cyber
export async function getSingleCaseFromStellarCyber(params: {
  caseId: string
  integrationId?: string
}) {
  try {
    const credentials = await getStellarCyberCredentials(params.integrationId)

    if (!credentials.HOST || !credentials.USER_ID || !credentials.TENANT_ID || !credentials.REFRESH_TOKEN) {
      throw new Error("Missing Stellar Cyber credentials")
    }

    const client = new StellarCyberCaseClient(
      credentials.HOST,
      credentials.USER_ID,
      credentials.TENANT_ID,
      credentials.REFRESH_TOKEN,
    )

    const response = await client.getCase(params.caseId)

    console.log("Case fetched from Stellar Cyber:", response)
    return response
  } catch (error) {
    console.error("Error fetching case from Stellar Cyber:", error)
    throw error
  }
}

export async function createCaseInStellarCyber(params: {
  name: string
  alerts: Array<{
    _id: string
    _index: string
  }>
  cust_id?: string
  severity?: string
  status?: string
  assignee?: string
  tags?: string[]
  comment?: string
  integrationId?: string
}) {
  try {
    const credentials = await getStellarCyberCredentials(params.integrationId)

    if (!credentials.HOST || !credentials.USER_ID || !credentials.TENANT_ID || !credentials.REFRESH_TOKEN) {
      throw new Error("Missing Stellar Cyber credentials")
    }

    const client = new StellarCyberCaseClient(
      credentials.HOST,
      credentials.USER_ID,
      credentials.TENANT_ID,
      credentials.REFRESH_TOKEN,
    )

    const response = await client.createCase({
      name: params.name,
      alerts: params.alerts,
      cust_id: params.cust_id,
      severity: params.severity,
      status: params.status,
      assignee: params.assignee,
      tags: params.tags,
      comment: params.comment,
    })

    console.log("Case created in Stellar Cyber:", response)
    return response
  } catch (error) {
    console.error("Error creating case in Stellar Cyber:", error)
    throw error
  }
}
