export const STELLAR_CYBER_CONFIG = {
  HOST: process.env.STELLAR_CYBER_HOST || "localhost",
  USER_ID: process.env.STELLAR_CYBER_USER_ID || "demo@example.com",
  REFRESH_TOKEN: process.env.STELLAR_CYBER_REFRESH_TOKEN || "demo-token",
  TENANT_ID: process.env.STELLAR_CYBER_TENANT_ID || "demo-tenant",
}

export type AlertStatus = "New" | "In Progress" | "Ignored" | "Closed"

// Menyesuaikan model data berdasarkan format respons API yang sebenarnya
export interface StellarCyberAlert {
  _id?: string
  _index?: string
  index?: string
  cust_id?: string
  title?: string
  description?: string
  severity?: string
  status?: AlertStatus
  created_at?: string
  updated_at?: string
  source?: string
  comments?: string
  score?: number
  metadata?: Record<string, any>

  // Tambahan field dari data asli
  stellar_uuid?: string
  event_name?: string
  event_score?: number
  event_status?: AlertStatus
  event_type?: string
  timestamp?: number | string
  xdr_event?: {
    description?: string
    display_name?: string
    name?: string
  }
  srcip?: string
  dstip?: string
  srcip_host?: string
  dstip_host?: string
  assignee?: string
}
