import * as mysql from "mysql2/promise"
import prisma from "@/lib/prisma"
import type { AlertStatus } from "@/lib/config/stellar-cyber"

/**
 * SOCFortress / Copilot MySQL Database Handler
 * Handles sync & update of alerts and cases from MySQL socfortress database
 */

/**
 * Helper: Convert various timestamp formats to milliseconds
 */
function toMs(v: any): number | null {
  if (!v && v !== 0) return null
  if (typeof v === "number") {
    // If > 1000000000000, assume it's already milliseconds (from year 2001 onwards)
    return v > 1e12 ? v : v * 1000
  }
  if (typeof v === "string") {
    const n = Number(v)
    if (!Number.isNaN(n) && String(v).trim() !== "") {
      return n > 1e12 ? n : n * 1000
    }
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  }
  if (v instanceof Date) return v.getTime()
  return null
}

/**
 * Helper: Compute metric time difference in milliseconds
 */
function computeMetricMs(startMs: number | null, endMs: number | null): number | null {
  if (!startMs || !endMs || startMs >= endMs) return null
  const diff = endMs - startMs
  return diff > 0 ? diff : null
}

/**
 * Helper: Convert ISO 8601 string or Date to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS.mmm)
 * MySQL DATETIME doesn't support the T separator and Z timezone indicator
 */
function toMySQLDatetime(isoOrDate: string | Date): string {
  try {
    const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date: ${isoOrDate}`)
      return new Date().toISOString().replace("T", " ").slice(0, 23) // Fallback format
    }
    
    // Format: YYYY-MM-DD HH:MM:SS.mmm
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(date.getUTCDate()).padStart(2, "0")
    const hours = String(date.getUTCHours()).padStart(2, "0")
    const minutes = String(date.getUTCMinutes()).padStart(2, "0")
    const seconds = String(date.getUTCSeconds()).padStart(2, "0")
    const ms = String(date.getUTCMilliseconds()).padStart(3, "0")
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`
  } catch (error) {
    console.error(`Error converting timestamp to MySQL format:`, error)
    return new Date().toISOString().replace("T", " ").slice(0, 23)
  }
}

/**
 * Calculate MTTD (Mean Time To Detect) for Socfortress/Copilot alerts
 * Uses 3-tier fallback:
 * Tier 1: alert_creation_time → first ASSIGNMENT_CHANGE in alert_history
 * Tier 2: alert_creation_time → alert.updatedAt
 * Tier 3: alert_creation_time → time_closed
 */
function calculateMttdForSocfortress(alert: any): number | null {
  const alertCreationMs = toMs(alert.alert_creation_time)
  if (!alertCreationMs) return null

  // Tier 1: Find first ASSIGNMENT_CHANGE in alert_history
  if (alert.alert_history && Array.isArray(alert.alert_history) && alert.alert_history.length > 0) {
    // Sort by changed_at descending to get oldest first (alerts are typically DESC from DB)
    const sortedHistory = [...alert.alert_history].reverse()
    
    // Prefer assignment change
    const assignmentChange = sortedHistory.find((h: any) => h.change_type === "ASSIGNMENT_CHANGE")
    if (assignmentChange && assignmentChange.changed_at) {
      const actionMs = toMs(assignmentChange.changed_at)
      const mttdMs = computeMetricMs(alertCreationMs, actionMs)
      if (mttdMs !== null) {
        console.log(`[MTTD] Alert ${alert.id}: Tier 1 (history) = ${Math.round(mttdMs / 60000)}m`)
        return mttdMs
      }
    }

    // Fallback to first action with any timestamp
    const firstAction = sortedHistory.find((h: any) => h.changed_at)
    if (firstAction && firstAction.changed_at) {
      const actionMs = toMs(firstAction.changed_at)
      const mttdMs = computeMetricMs(alertCreationMs, actionMs)
      if (mttdMs !== null) {
        console.log(`[MTTD] Alert ${alert.id}: Tier 1 (history-any) = ${Math.round(mttdMs / 60000)}m`)
        return mttdMs
      }
    }
  }

  // Tier 2: Use updatedAt if available
  if (alert.updatedAt || alert.updated_at) {
    const updateMs = toMs(alert.updatedAt || alert.updated_at)
    const mttdMs = computeMetricMs(alertCreationMs, updateMs)
    if (mttdMs !== null) {
      console.log(`[MTTD] Alert ${alert.id}: Tier 2 (updatedAt) = ${Math.round(mttdMs / 60000)}m`)
      return mttdMs
    }
  }

  // Tier 3: Use time_closed if available
  if (alert.time_closed) {
    const closedMs = toMs(alert.time_closed)
    const mttdMs = computeMetricMs(alertCreationMs, closedMs)
    if (mttdMs !== null) {
      console.log(`[MTTD] Alert ${alert.id}: Tier 3 (closed_time) = ${Math.round(mttdMs / 60000)}m`)
      return mttdMs
    }
  }

  console.log(`[MTTD] Alert ${alert.id}: Could not calculate MTTD (no history or closed_time)`)
  return null
}

interface SocfortressCredentials {
  host: string
  port: number
  user: string
  password: string
  database: string
}

interface SocfortressAlert {
  id: number
  alert_name: string
  alert_description: string
  status: string
  alert_creation_time: string
  customer_code: string
  time_closed?: string
  source: string
  assigned_to?: string
  severity: string
}

interface SocfortressCase {
  id: number
  case_name: string
  case_description: string
  case_creation_time: string
  case_status: string
  assigned_to?: string
  customer_code: string
  severity: string
}

/**
 * Get SOCFortress credentials from integration config
 */
async function getSocfortressCredentials(integrationId: string): Promise<SocfortressCredentials> {
  try {
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration || integration.source !== "socfortress") {
      throw new Error("SOCFortress integration not found")
    }

    let credentials: Record<string, any> = {}

    // Handle both array and object credential formats
    if (Array.isArray(integration.credentials)) {
      const credArray = integration.credentials as any[]
      credArray.forEach((cred) => {
        if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
          credentials[cred.key] = cred.value
        }
      })
    } else {
      credentials = (integration.credentials as Record<string, any>) || {}
    }

    return {
      host: credentials.host || credentials.mysql_host || "localhost",
      port: parseInt(credentials.port || credentials.mysql_port || "3306", 10),
      user: credentials.user || credentials.mysql_user || "root",
      password: credentials.password || credentials.mysql_password || "",
      database: credentials.database || credentials.mysql_database || "copilot",
    }
  } catch (error) {
    console.error("Error getting SOCFortress credentials:", error)
    throw error
  }
}

/**
 * Get MySQL connection pool
 */
async function getConnection(credentials: SocfortressCredentials) {
  return mysql.createConnection({
    host: credentials.host,
    port: credentials.port,
    user: credentials.user,
    password: credentials.password,
    database: credentials.database,
    connectTimeout: 10000,
  })
}

/**
 * Fetch all recent alerts (both linked and unlinked)
 * Changed from only unlinked alerts to capture all alerts in the system
 */
/**
 * Transform a raw alert from database to frontend format
 */
function transformAlert(alert: any, integrationId: string): any {
  const mappedStatus = mapStatusFromMySQL(alert.status)
  
  // Parse source_data if it's a string
  let sourceData = null
  if (alert.incident_event?.source_data) {
    const eventSourceData = alert.incident_event.source_data
    sourceData = typeof eventSourceData === "string" ? JSON.parse(eventSourceData) : eventSourceData
  }
  
  // Extract tag names from tags array
  const tagNames = alert.tags?.map((t: any) => t.tag || t.name || "").filter(Boolean) || []
  
  // Calculate MTTD (Mean Time To Detect)
  const mttdMs = calculateMttdForSocfortress(alert)
  
  return {
    externalId: String(alert.id),
    id: String(alert.id),
    title: alert.alert_name,
    description: alert.alert_description,
    status: mappedStatus,
    severity: alert.severity || "Medium",
    timestamp: new Date(alert.alert_creation_time),
    integrationId,
    metadata: {
      socfortress: {
        id: alert.id,
        customer_code: alert.customer_code,
        source: alert.source,
        assigned_to: alert.assigned_to,
        time_closed: alert.time_closed,
        alert_creation_time: alert.alert_creation_time,
      },
      incident_event: alert.incident_event
        ? {
            id: alert.incident_event.id,
            asset_name: alert.incident_event.asset_name,
            created_at: alert.incident_event.created_at,
            source_data: sourceData, // Parsed JSON data
          }
        : null,
      alert_history: alert.alert_history || [],
      tags: tagNames, // Add tags to metadata
      // Store MTTD in milliseconds for consistent formatting
      ...(mttdMs !== null && { socfortress_alert_to_first: mttdMs }),
    },
  }
}

/**
 * Fetch alerts linked to a specific case
 */
async function fetchCaseAlertsFromDB(
  conn: mysql.Connection,
  caseId: number,
): Promise<any[]> {
  try {
    // Fetch alert IDs linked to this case from incident_management_casealertlink
    const linkQuery = `
      SELECT alert_id 
      FROM incident_management_casealertlink 
      WHERE case_id = ?
    `
    
    console.log(`[SOCFortress] Querying case alert links for case_id ${caseId}`)
    const [links] = await conn.execute<any[]>(linkQuery, [caseId])
    console.log(`[SOCFortress] Found ${links?.length || 0} alert links for case ${caseId}`)
    
    if (!links || links.length === 0) {
      console.log(`[SOCFortress] No alerts linked to case ${caseId}`)
      return []
    }
    
    // Fetch full alert data for each linked alert
    const enrichedAlerts: any[] = []
    for (const link of links) {
      try {
        const alertId = link.alert_id
        console.log(`[SOCFortress] Fetching alert ${alertId} for case ${caseId}`)
        
        // Fetch alert data
        const alertQuery = `SELECT * FROM incident_management_alert WHERE id = ?`
        const [alertRows] = await conn.execute<any[]>(alertQuery, [alertId])
        
        if (!alertRows || alertRows.length === 0) {
          console.warn(`[SOCFortress] Alert ${alertId} not found in database`)
          continue
        }
        
        const alert = alertRows[0]
        console.log(`[SOCFortress] Found alert: ${alert.alert_name} (id ${alertId})`)
        
        // Fetch first incident event for this alert
        const eventQuery = `SELECT * FROM incident_management_alertevent 
                          WHERE alert_id = ? 
                          ORDER BY created_at DESC 
                          LIMIT 1`
        const [events] = await conn.execute<any[]>(eventQuery, [alertId])
        
        // Parse source_data if it exists and is a string
        if (events && events.length > 0 && events[0].source_data) {
          try {
            events[0].source_data = JSON.parse(events[0].source_data)
          } catch (e) {
            // Keep as string if not valid JSON
          }
        }

        // Fetch alert history/changes
        const historyQuery = `SELECT * FROM incident_management_alert_history 
                            WHERE alert_id = ? 
                            ORDER BY changed_at DESC`
        const [history] = await conn.execute<any[]>(historyQuery, [alertId])
        
        // Fetch tags (join with tag table to get tag names)
        const tagsQuery = `
          SELECT t.id, t.tag
          FROM incident_management_alert_to_tag m
          JOIN incident_management_alerttag t ON m.tag_id = t.id
          WHERE m.alert_id = ?
        `
        let tags: any[] = []
        try {
          const [tagRows] = await conn.execute<any[]>(tagsQuery, [alertId])
          tags = tagRows || []
          console.log(`[SOCFortress] Case ${caseId} - Alert ${alertId} (${alert.alert_name}): Found ${tags.length} tags`)
        } catch (e) {
          console.warn(`Could not fetch tags for alert ${alertId}:`, e instanceof Error ? e.message : String(e))
        }
        
        enrichedAlerts.push({
          ...alert,
          incident_event: events?.[0] || null,
          alert_history: history || [],
          tags: tags || [],
        })
      } catch (error) {
        console.error(`Error fetching details for alert in case ${caseId}:`, error)
      }
    }
    
    console.log(`[SOCFortress] Case ${caseId}: Fetched ${enrichedAlerts.length} linked alerts`)
    return enrichedAlerts
  } catch (error) {
    console.error(`Error fetching case alerts for case ${caseId}:`, error)
    return []
  }
}

async function fetchUnlinkedAlerts(
  conn: mysql.Connection,
  limit: number = 50,
): Promise<any[]> {
  try {
    // Fetch ALL alerts sorted by creation time (not just unlinked ones)
    // This ensures we capture all alerts regardless of case association
    const limitInt = Math.floor(limit)
    const query = `
      SELECT a.*
      FROM incident_management_alert a
      ORDER BY a.alert_creation_time DESC
      LIMIT ${limitInt}
    `

    const [rows] = await conn.execute<any[]>(query)
    
    // For each alert, fetch its related incident events, history, and tags sequentially
    const enrichedAlerts: any[] = []
    for (const alert of (rows || [])) {
      try {
        // Fetch first incident event for this alert
        const eventQuery = `SELECT * FROM incident_management_alertevent 
                          WHERE alert_id = ? 
                          ORDER BY created_at DESC 
                          LIMIT 1`
        const [events] = await conn.execute<any[]>(eventQuery, [alert.id])
        
        // Parse source_data if it exists and is a string
        if (events && events.length > 0 && events[0].source_data) {
          try {
            events[0].source_data = JSON.parse(events[0].source_data)
          } catch (e) {
            // Keep as string if not valid JSON
          }
        }

        // Fetch alert history/changes
        const historyQuery = `SELECT * FROM incident_management_alert_history 
                            WHERE alert_id = ? 
                            ORDER BY changed_at DESC`
        const [history] = await conn.execute<any[]>(historyQuery, [alert.id])
        
        // Fetch tags (join with tag table to get tag names)
        // Use correct table names: incident_management_alert_to_tag (mapping) and incident_management_alerttag (tags)
        const tagsQuery = `
          SELECT t.id, t.tag
          FROM incident_management_alert_to_tag m
          JOIN incident_management_alerttag t ON m.tag_id = t.id
          WHERE m.alert_id = ?
        `
        let tags: any[] = []
        try {
          const [tagRows] = await conn.execute<any[]>(tagsQuery, [alert.id])
          tags = tagRows || []
          console.log(`[SOCFortress] Alert ${alert.id} (${alert.alert_name}): Found ${tags.length} tags:`, tags.map((t: any) => t.tag))
        } catch (e) {
          // Table might not exist or query failed, continue without tags
          console.warn(`Could not fetch tags for alert ${alert.id}:`, e instanceof Error ? e.message : String(e))
        }
        
        enrichedAlerts.push({
          ...alert,
          incident_event: events?.[0] || null,
          alert_history: history || [],
          tags: tags || [],
        })
      } catch (error) {
        console.error(`Error fetching events for alert ${alert.id}:`, error)
        enrichedAlerts.push({
          ...alert,
          incident_event: null,
          alert_history: [],
          tags: [],
        })
      }
    }
    
    return enrichedAlerts
  } catch (error) {
    console.error("Error fetching alerts:", error)
    return []
  }
}

/**
 * Fetch case history for a specific case
 */
async function fetchCaseHistoryFromDB(
  conn: mysql.Connection,
  caseId: number,
): Promise<any[]> {
  try {
    const historyQuery = `
      SELECT * FROM incident_management_case_history 
      WHERE case_id = ? 
      ORDER BY changed_at DESC
    `
    
    console.log(`[SOCFortress] fetchCaseHistoryFromDB: About to query case_id=${caseId}`)
    const [history] = await conn.execute<any[]>(historyQuery, [caseId])
    console.log(`[SOCFortress] Case ${caseId}: Fetched ${history?.length || 0} history entries`)
    if (history && history.length > 0) {
      console.log(`[SOCFortress] Case ${caseId}: First history entry change_type:`, history[0].change_type)
    }
    return history || []
  } catch (error) {
    console.error(`[SOCFortress] ERROR fetching case history for case ${caseId}:`, error instanceof Error ? error.message : String(error))
    console.error(`[SOCFortress] Full error:`, error)
    return []
  }
}

/**
 * Fetch recent cases
 */
async function fetchRecentCases(conn: mysql.Connection, limit: number = 50): Promise<SocfortressCase[]> {
  try {
    // Ensure limit is a positive integer
    const safeLimit = Math.max(1, Math.floor(limit))
    
    const query = `
      SELECT c.*
      FROM incident_management_case c
      ORDER BY c.case_creation_time DESC
      LIMIT ${safeLimit}
    `

    const [rows] = await conn.execute<any[]>(query)
    return rows || []
  } catch (error) {
    console.error("Error fetching recent cases:", error)
    return []
  }
}

/**
 * Fetch case with related alerts
 */
async function fetchCaseWithAlerts(conn: mysql.Connection, caseId: number) {
  try {
    // Get case details
    const [caseRows] = await conn.execute<any[]>(
      "SELECT * FROM incident_management_case WHERE id = ?",
      [caseId],
    )

    if (!caseRows || caseRows.length === 0) {
      return null
    }

    const caseData = caseRows[0]

    // Get linked alerts
    const [alertLinks] = await conn.execute<any[]>(
      "SELECT alert_id FROM incident_management_casealertlink WHERE case_id = ?",
      [caseId],
    )

    const alertIds = (alertLinks || []).map((link: any) => link.alert_id)

    // Get alert details
    let alerts: SocfortressAlert[] = []
    if (alertIds.length > 0) {
      const placeholders = alertIds.map(() => "?").join(",")
      const [alertRows] = await conn.execute<any[]>(
        `SELECT * FROM incident_management_alert WHERE id IN (${placeholders})`,
        alertIds,
      )
      alerts = alertRows || []
    }

    return {
      case: caseData,
      alertIds,
      alerts,
    }
  } catch (error) {
    console.error("Error fetching case with alerts:", error)
    return null
  }
}

/**
 * Update alert status in MySQL
 */
async function updateAlertStatusInMySQL(
  conn: mysql.Connection,
  alertId: number,
  newStatus: string,
  comments?: string,
  assignedTo?: string,
  severity?: string,
): Promise<boolean> {
  try {
    // Map generic status to MySQL status
    const mysqlStatus = mapStatusToMySQL(newStatus)

    // Map severity to MySQL format if provided
    const mysqlSeverity = severity ? mapSeverityToMySQL(severity) : undefined

    // Update main alert
    const updateQuery = mysqlSeverity
      ? "UPDATE incident_management_alert SET status = ?, assigned_to = ?, severity = ? WHERE id = ?"
      : "UPDATE incident_management_alert SET status = ?, assigned_to = ? WHERE id = ?"
    const updateParams = mysqlSeverity
      ? [mysqlStatus, assignedTo || null, mysqlSeverity, alertId]
      : [mysqlStatus, assignedTo || null, alertId]
    
    await conn.execute(updateQuery, updateParams)

    // Add comment if provided with explicit UTC timestamp in MySQL format
    if (comments) {
      const commentTimestamp = toMySQLDatetime(new Date())
      await conn.execute(
        "INSERT INTO incident_management_comment (alert_id, comment, user_name, created_at) VALUES (?, ?, ?, ?)",
        [alertId, comments, assignedTo || "system", commentTimestamp],
      )
    }

    // Add history entry with explicit UTC timestamp in MySQL format
    const utcNow = toMySQLDatetime(new Date())
    await conn.execute(
      `INSERT INTO incident_management_alert_history 
       (alert_id, change_type, field_name, old_value, new_value, changed_at, description)
       VALUES (?, 'STATUS_CHANGE', 'status', NULL, ?, ?, ?)`,
      [alertId, mysqlStatus, utcNow, `Status changed to ${mysqlStatus}`],
    )

    // Add severity history if severity was updated
    if (mysqlSeverity) {
      await conn.execute(
        `INSERT INTO incident_management_alert_history 
         (alert_id, change_type, field_name, old_value, new_value, changed_at, description)
         VALUES (?, 'SEVERITY_CHANGE', 'severity', NULL, ?, ?, ?)`,
        [alertId, mysqlSeverity, utcNow, `Severity changed to ${mysqlSeverity}`],
      )
    }

    return true
  } catch (error) {
    console.error("Error updating alert status in MySQL:", error)
    return false
  }
}

/**
 * Update case status in MySQL - Enhanced version with comments, severity, history
 */
async function updateCaseStatusInMySQL(
  conn: mysql.Connection,
  caseId: number,
  newStatus: string,
  assignedTo?: string,

  comments?: string,
  severity?: string,
): Promise<boolean> {
  try {
    // Map generic status to MySQL status
    const mysqlStatus = mapStatusToMySQL(newStatus)

    // Get current case details for history tracking
    const [currentCase] = await conn.execute(
      "SELECT case_status, assigned_to, severity FROM incident_management_case WHERE id = ?",
      [caseId],
    ) as any[]

    const current = currentCase[0] || {}

    // Update case
    await conn.execute(
      "UPDATE incident_management_case SET case_status = ?, assigned_to = ?, severity = ? WHERE id = ?",
      [mysqlStatus, assignedTo || null, severity || current.severity, caseId],
    )

    // Add comment if provided with explicit UTC timestamp in MySQL format
    if (comments) {
      const commentTimestamp = toMySQLDatetime(new Date())
      await conn.execute(
        "INSERT INTO incident_management_comment (case_id, comment, user_name, created_at) VALUES (?, ?, ?, ?)",
        [caseId, comments, assignedTo || "system", commentTimestamp],
      )
    }

    // Use explicit UTC timestamp in MySQL format to avoid timezone issues
    const utcNow = toMySQLDatetime(new Date())

    // Add history entry for status change
    if (current.case_status !== mysqlStatus) {
      await conn.execute(
        `INSERT INTO incident_management_case_history 
         (case_id, change_type, field_name, old_value, new_value, changed_at, description)
         VALUES (?, 'STATUS_CHANGE', 'case_status', ?, ?, ?, ?)`,
        [caseId, current.case_status || "OPEN", mysqlStatus, utcNow, `Status changed to ${mysqlStatus}`],
      )
    }

    // Add history entry for severity change
    if (severity && current.severity !== severity) {
      await conn.execute(
        `INSERT INTO incident_management_case_history 
         (case_id, change_type, field_name, old_value, new_value, changed_at, description)
         VALUES (?, 'SEVERITY_CHANGE', 'severity', ?, ?, ?, ?)`,
        [caseId, current.severity || "Not Set", severity, utcNow, `Severity changed to ${severity}`],
      )
    }

    // Add history entry for assignment change
    if (assignedTo && current.assigned_to !== assignedTo) {
      await conn.execute(
        `INSERT INTO incident_management_case_history 
         (case_id, change_type, field_name, old_value, new_value, changed_at, description)
         VALUES (?, 'ASSIGNMENT_CHANGE', 'assigned_to', ?, ?, ?, ?)`,
        [caseId, current.assigned_to || "(unassigned)", assignedTo, utcNow, `Assigned to ${assignedTo}`],
      )
    }

    return true
  } catch (error) {
    console.error("Error updating case status in MySQL:", error)
    return false
  }
}

/**
 * Map generic status to MySQL/socfortress status
 */
function mapStatusToMySQL(status: string): string {
  const statusMap: Record<string, string> = {
    Open: "OPEN",
    "In Progress": "IN_PROGRESS",
    Closed: "CLOSED",
    Ignored: "CLOSED",
    Resolved: "CLOSED",
    New: "OPEN",
    OPEN: "OPEN",
    IN_PROGRESS: "IN_PROGRESS",
    CLOSED: "CLOSED",
    FOLLOW_UP: "IN_PROGRESS",
  }

  return statusMap[status] || "OPEN"
}

/**
 * Map MySQL status to generic status
 * Copilot uses simple OPEN/IN_PROGRESS/CLOSED status
 * Map to the actual status from database to maintain consistency
 */
function mapStatusFromMySQL(status: string): string {
  const statusMap: Record<string, string> = {
    OPEN: "New",
    IN_PROGRESS: "In Progress",
    CLOSED: "Closed",
    // Fallback for any other status
  }

  // If status exists in map, use mapped value; otherwise return "New" as default
  return statusMap[status?.toUpperCase()] || "New"
}

/**
 * Map generic severity to MySQL format
 * Frontend uses: "Low", "Medium", "High", "Critical"
 * MySQL stores the same format
 */
function mapSeverityToMySQL(severity: string): string {
  const severityMap: Record<string, string> = {
    Low: "Low",
    low: "Low",
    Medium: "Medium",
    medium: "Medium",
    High: "High",
    high: "High",
    Critical: "Critical",
    critical: "Critical",
    // Handle AlertSeverity.* format if needed
    "AlertSeverity.LOW": "Low",
    "AlertSeverity.MEDIUM": "Medium",
    "AlertSeverity.HIGH": "High",
    "AlertSeverity.CRITICAL": "Critical",
  }

  return severityMap[severity] || "Medium"
}

export async function getSocfortressAlerts(integrationId: string, options?: { limit?: number }) {
  try {
    const credentials = await getSocfortressCredentials(integrationId)
    const conn = await getConnection(credentials)

    console.log(`[SOCFortress] Connecting to ${credentials.host}:${credentials.port}/${credentials.database}`)
    
    const alerts = await fetchUnlinkedAlerts(conn, options?.limit || 500)
    
    console.log(`[SOCFortress] Raw query returned ${alerts.length} alerts`)

    // Close connection
    await conn.end()

    // Transform to frontend format
    const transformed = alerts.map((alert) => transformAlert(alert, integrationId))
    
    console.log(`[SOCFortress] Transformed to ${transformed.length} alerts with statuses:`, 
      transformed.slice(0, 3).map(a => ({ id: a.externalId, title: a.title, status: a.status })))

    return {
      count: transformed.length,
      alerts: transformed,
    }
  } catch (error) {
    console.error("[SOCFortress] Error getting alerts:", error)
    throw error
  }
}

/**
 * Get cases from SOCFortress with related alerts
 */
export async function getSocfortressCases(integrationId: string, options?: { limit?: number }) {
  try {
    const credentials = await getSocfortressCredentials(integrationId)
    const conn = await getConnection(credentials)

    const cases = await fetchRecentCases(conn, options?.limit || 50)

    console.log(`[SOCFortress] Fetched ${cases.length} cases`)

    // For each case, fetch related alerts and history while connection is still open
    const casesWithAlerts = await Promise.all(cases.map(async (caseData) => {
      try {
        // Fetch case alert links for this case
        const rawAlerts = await fetchCaseAlertsFromDB(conn, caseData.id)
        console.log(`[SOCFortress] Case ${caseData.id}: Got ${rawAlerts.length} raw alerts from DB`)
        
        // Transform alerts to frontend format
        const caseAlerts = rawAlerts.map((alert) => transformAlert(alert, integrationId))
        console.log(`[SOCFortress] Case ${caseData.id}: Transformed to ${caseAlerts.length} frontend alerts`)
        
        // Fetch case history
        const caseHistory = await fetchCaseHistoryFromDB(conn, caseData.id)
        console.log(`[SOCFortress] Case ${caseData.id}: Fetched ${caseHistory.length} history entries`)
        
        // Calculate MTTR: case_creation_time - latest_alert_time
        let mttrMinutes: number | null = null
        if (caseAlerts && caseAlerts.length > 0) {
          const caseCreatedMs = toMs(caseData.case_creation_time)
          console.log(`[MTTR-DEBUG] Case ${caseData.id}: case_creation_time="${caseData.case_creation_time}" → ${caseCreatedMs}ms`)
          
          // Find latest alert timestamp
          const alertTimestamps = caseAlerts
            .map((alert: any) => {
              const ts = alert.timestamp || alert.metadata?.socfortress?.alert_creation_time
              const ms = toMs(ts)
              if (caseAlerts.length <= 3) {
                console.log(`[MTTR-DEBUG] Case ${caseData.id} - Alert ${alert.id}: "${ts}" → ${ms}ms`)
              }
              return ms
            })
            .filter((ts: number | null) => ts !== null && ts > 0)
          
          if (alertTimestamps.length > 0 && caseCreatedMs) {
            const latestAlertMs = Math.max(...alertTimestamps)
            const mttrMs = computeMetricMs(latestAlertMs, caseCreatedMs)
            if (mttrMs !== null) {
              mttrMinutes = Math.round(mttrMs / 60000)
              console.log(`[MTTR] Case ${caseData.id}: ${mttrMinutes} minutes (from ${new Date(latestAlertMs).toISOString()} to ${new Date(caseCreatedMs).toISOString()})`)
            } else {
              console.log(`[MTTR] Case ${caseData.id}: Invalid MTTR - latestAlert=${latestAlertMs}, caseCreated=${caseCreatedMs}`)
            }
          } else {
            console.log(`[MTTR] Case ${caseData.id}: No valid timestamps - ${alertTimestamps.length} alerts, caseCreatedMs=${caseCreatedMs}`)
          }
        }
        
        const builtMetadata = {
          socfortress: {
            id: caseData.id,
            customer_code: caseData.customer_code,
            assigned_to: caseData.assigned_to,
            case_creation_time: caseData.case_creation_time,
            case_status: caseData.case_status,
          },
          case_history: caseHistory, // Include case history
          // Store MTTR metrics
          ...(mttrMinutes !== null && { mttrMinutes }),
        }
        console.log(`[SOCFortress] Case ${caseData.id}: Built metadata with fields: socfortress, case_history (${caseHistory.length} items)${mttrMinutes !== null ? `, mttrMinutes=${mttrMinutes}` : ''}`)
        
        return {
          externalId: String(caseData.id),
          name: caseData.case_name,
          description: caseData.case_description || "",
          status: mapStatusFromMySQL(caseData.case_status),
          severity: caseData.severity || "Medium",
          ticketId: caseData.id,
          timestamp: new Date(caseData.case_creation_time),
          integrationId,
          mttrMinutes: mttrMinutes || undefined, // Add to top-level for easier access
          alerts: caseAlerts, // Include related alerts (transformed to frontend format)
          metadata: builtMetadata,
        }
      } catch (error) {
        console.error(`Error processing case ${caseData.id}:`, error)
        // Return case data even if alert fetching fails
        const fallbackMetadata = {
          socfortress: {
            id: caseData.id,
            customer_code: caseData.customer_code,
            assigned_to: caseData.assigned_to,
            case_creation_time: caseData.case_creation_time,
            case_status: caseData.case_status,
          },
          case_history: [], // Include empty case history
        }
        return {
          externalId: String(caseData.id),
          name: caseData.case_name,
          description: caseData.case_description || "",
          status: mapStatusFromMySQL(caseData.case_status),
          severity: caseData.severity || "Medium",
          ticketId: caseData.id,
          timestamp: new Date(caseData.case_creation_time),
          integrationId,
          alerts: [],
          metadata: fallbackMetadata,
        }
      }
    }))

    // Close connection only after all alerts are fetched
    await conn.end()

    return {
      count: casesWithAlerts.length,
      cases: casesWithAlerts,
    }
  } catch (error) {
    console.error("[SOCFortress] Error getting cases:", error)
    throw error
  }
}

/**
 * Update alert status in SOCFortress
 */
export async function updateSocfortressAlertStatus(
  integrationId: string,
  alertId: string,
  status: string,
  options?: {
    comments?: string
    assignedTo?: string
    severity?: string
  },
): Promise<boolean> {
  try {
    const credentials = await getSocfortressCredentials(integrationId)
    const conn = await getConnection(credentials)

    const result = await updateAlertStatusInMySQL(
      conn,
      parseInt(alertId, 10),
      status,
      options?.comments,
      options?.assignedTo,
      options?.severity,
    )

    // Close connection
    await conn.end()

    return result
  } catch (error) {
    console.error("[SOCFortress] Error updating alert status:", error)
    throw error
  }
}

/**
 * Update case status in SOCFortress
 */
export async function updateSocfortressCaseStatus(
  integrationId: string,
  caseId: string,
  status: string,
  options?: {
    assignedTo?: string
    comments?: string
    severity?: string
  },
): Promise<boolean> {
  try {
    const credentials = await getSocfortressCredentials(integrationId)
    const conn = await getConnection(credentials)

    const result = await updateCaseStatusInMySQL(
      conn,
      parseInt(caseId, 10),
      status,
      options?.assignedTo,
      options?.comments,
      options?.severity,
    )

    // Close connection
    await conn.end()

    return result
  } catch (error) {
    console.error("[SOCFortress] Error updating case status:", error)
    throw error
  }
}

/**
 * Create a new case and link alerts to it
 */
export async function createSocfortressCase(
  integrationId: string,
  caseData: {
    caseName: string
    caseDescription: string
    customerCode: string
    assignedTo?: string
    severity?: string
    alertIds: number[]
  },
): Promise<{ caseId: number; caseExternalId: string }> {
  try {
    const credentials = await getSocfortressCredentials(integrationId)
    const conn = await getConnection(credentials)

    // Create case in incident_management_case table with explicit UTC timestamp in MySQL format
    const utcCreationTime = toMySQLDatetime(new Date())
    const [result] = await conn.execute(
      `INSERT INTO incident_management_case 
       (case_name, case_description, case_status, assigned_to, severity, customer_code, case_creation_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        caseData.caseName,
        caseData.caseDescription,
        "OPEN", // Default status
        caseData.assignedTo || null,
        caseData.severity || "Low",
        caseData.customerCode,
        utcCreationTime,
      ],
    ) as any

    const caseId = result.insertId

    console.log(`[SOCFortress] Created case ${caseId} with name "${caseData.caseName}"`)

    // Link alerts to case
    if (caseData.alertIds && caseData.alertIds.length > 0) {
      for (const alertId of caseData.alertIds) {
        await conn.execute(
          `INSERT INTO incident_management_case_alert_link (case_id, alert_id)
           VALUES (?, ?)`,
          [caseId, alertId],
        )
      }
      console.log(`[SOCFortress] Linked ${caseData.alertIds.length} alerts to case ${caseId}`)
    }

    // Add creation history entry with explicit UTC timestamp in MySQL format
    const creationTimestamp = toMySQLDatetime(new Date())
    await conn.execute(
      `INSERT INTO incident_management_case_history 
       (case_id, change_type, field_name, old_value, new_value, changed_at, description)
       VALUES (?, 'CASE_CREATED', 'case_status', NULL, 'OPEN', ?, ?)`,
      [caseId, creationTimestamp, `Case created: ${caseData.caseName}`],
    )

    // Close connection
    await conn.end()

    return {
      caseId,
      caseExternalId: String(caseId),
    }
  } catch (error) {
    console.error("[SOCFortress] Error creating case:", error)
    throw error
  }
}

