import axios from "axios"
import https from "https"

interface QRadarOffenseResponse {
  id: number
  description: string
  offense_type: string
  severity: number
  status: string
  event_count: number
  last_updated_time: number
  start_time: number
  end_time?: number
  source_network: string
  destination_network: string
}

interface QRadarEventResponse {
  id: number
  event_id: string
  source_ip: string
  destination_ip: string
  protocol: string
  event_time: number
  payload: any
}

export class QRadarClient {
  private baseUrl: string
  private authToken: string
  private httpsAgent: https.Agent

  constructor(baseUrl: string, authToken: string) {
    this.baseUrl = baseUrl
    this.authToken = authToken
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    })
  }

  async getOffenses(params?: {
    filter?: string
    range?: string
    fields?: string
  }): Promise<QRadarOffenseResponse[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/siem/offenses`, {
        headers: {
          SEC: this.authToken,
          Accept: "application/json",
        },
        params,
        httpsAgent: this.httpsAgent,
      })
      return response.data
    } catch (error) {
      console.error("[v0] Failed to get offenses:", error)
      throw error
    }
  }

  async getOffenseDetails(offenseId: number): Promise<QRadarOffenseResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/siem/offenses/${offenseId}`, {
        headers: {
          SEC: this.authToken,
          Accept: "application/json",
        },
        httpsAgent: this.httpsAgent,
      })
      return response.data
    } catch (error) {
      console.error("[v0] Failed to get offense details:", error)
      throw error
    }
  }

  async getOffenseEvents(offenseId: number): Promise<QRadarEventResponse[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/siem/offenses/${offenseId}/events`, {
        headers: {
          SEC: this.authToken,
          Accept: "application/json",
        },
        httpsAgent: this.httpsAgent,
      })
      return response.data
    } catch (error) {
      console.error("[v0] Failed to get offense events:", error)
      throw error
    }
  }

  async updateOffenseStatus(offenseId: number, status: string): Promise<QRadarOffenseResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/siem/offenses/${offenseId}`,
        { status },
        {
          headers: {
            SEC: this.authToken,
            "Content-Type": "application/json",
          },
          httpsAgent: this.httpsAgent,
        },
      )
      return response.data
    } catch (error) {
      console.error("[v0] Failed to update offense status:", error)
      throw error
    }
  }

  async createTicket(offenseId: number, description: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/siem/offenses/${offenseId}/tickets`,
        { description },
        {
          headers: {
            SEC: this.authToken,
            "Content-Type": "application/json",
          },
          httpsAgent: this.httpsAgent,
        },
      )
      return response.data
    } catch (error) {
      console.error("[v0] Failed to create ticket:", error)
      throw error
    }
  }
}
