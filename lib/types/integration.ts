export type IntegrationType = "alert" | "log"

export type IntegrationSource =
  | "stellar-cyber"
  | "firewall"
  | "edr"
  | "antivirus"
  | "qradar"
  | "wazuh"
  | "waf"
  | "endpoint"
  | "siem"
  | "custom"

export type IntegrationStatus = "connected" | "disconnected" | "pending" | "error"

export type IntegrationMethod = "api" | "agent" | "syslog" | "webhook" | "custom"

export interface IntegrationCredential {
  key: string
  value: string
  isSecret: boolean
}

export interface Integration {
  id: string
  name: string
  type: IntegrationType
  source: IntegrationSource
  status: IntegrationStatus
  method: IntegrationMethod
  credentials: IntegrationCredential[]
  createdAt: string
  updatedAt: string
  lastSyncAt?: string
  description?: string
  icon?: string
}
