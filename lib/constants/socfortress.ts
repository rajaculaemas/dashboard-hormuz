/**
 * Constants for SOCFortress users and assignees
 */

export const SOCFORTRESS_USERS = [
  { id: 1, username: "admin" },
  { id: 3, username: "nugi" },
  { id: 4, username: "demo" },
  { id: 13, username: "azamzami" },
  { id: 34, username: "sayid" },
  { id: 35, username: "fazzahrah" },
  { id: 36, username: "soc247" },
  { id: 194, username: "CRITICAL" },
  { id: 357, username: "haikalrahman" },
  { id: 358, username: "sultan" },
  { id: 359, username: "araffly" },
  { id: 360, username: "ambarfitri" },
  { id: 361, username: "fnurelia" },
  { id: 362, username: "fannisa" },
  { id: 363, username: "teguhalam" },
  { id: 399, username: "aalindra" },
  { id: 403, username: "scheduler" },
]

export const ALERT_TAGS = [
  "True Positive",
  "Benign True Positive", 
  "False Positive",
]

export const ALERT_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "CLOSED",
]

export const ALERT_SEVERITIES = [
  "Critical",
  "High",
  "Medium",
  "Low",
]

/**
 * Get user name by username (search helper)
 */
export function getSocfortressUserByUsername(username: string) {
  return SOCFORTRESS_USERS.find((u) => u.username === username)
}

/**
 * Get username list for UI dropdowns
 */
export function getSocfortressUsernames() {
  return SOCFORTRESS_USERS.map((u) => u.username)
}
