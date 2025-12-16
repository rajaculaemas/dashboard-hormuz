export interface StellarCyberCase {
  _id: string
  acknowledged?: number
  assignee?: string
  closed?: number
  created_at: number
  created_by: string
  cust_id: string
  modified_at: number
  modified_by: string
  name: string
  score: number
  size: number
  status: string
  severity: string
  tags: string[]
  ticket_id: number
  version: number
  start_timestamp?: number
  end_timestamp?: number
  created_by_name: string
  modified_by_name: string
  assignee_name?: string
  tenant_name: string
}

export interface DatabaseCase {
  id: string
  externalId: string
  ticketId: number
  name: string
  status: string
  severity: string
  assignee?: string
  assigneeName?: string
  description?: string
  createdAt: string
  updatedAt: string
  acknowledgedAt?: string
  closedAt?: string
  startTimestamp?: string
  endTimestamp?: string
  score?: number
  size?: number
  tags?: string[]
  version?: number
  createdBy?: string
  createdByName?: string
  modifiedBy?: string
  modifiedByName?: string
  custId?: string
  tenantName?: string
  metadata?: any
  mttd?: number
  integration?: any
  relatedAlerts?: any[]
  comments?: any[]
}

export interface CaseAlert {
  _id: string
  display_name?: string
  title?: string
  severity?: string
  status?: string
  alert_time: number
  timestamp?: number
  metadata?: any
}

export interface UpdateCaseRequest {
  caseId: string
  status?: string
  severity?: string
  assignee?: string
  comment?: string
}

export const CASE_STATUSES = ["New", "Escalated", "In Progress", "Resolved", "Canceled"] as const
export const CASE_SEVERITIES = ["Low", "Medium", "High", "Critical"] as const
export const CASE_ASSIGNEES = [
  "abimantara",
  "ahafiz",
  "ambarfitri",
  "araffly",
  "ariful",
  "asap",
  "azamzami",
  "bimarizki",
  "fannisa",
  "fazzahrah",
  "ffadhillah",
  "fnurelia",
  "gandarizky",
  "haikalrahman",
  "hnurjannah",
  "mrifqi",
  "mtaufik",
  "nabdurrahman",
  "radhitia",
  "rlazuardo",
  "shizbullah",
] as const

export type CaseStatus = (typeof CASE_STATUSES)[number]
export type CaseSeverity = (typeof CASE_SEVERITIES)[number]
export type CaseAssignee = (typeof CASE_ASSIGNEES)[number]
