/**
 * Universal status mapping function
 * Converts raw database status values to consistent UI status values
 */

export function normalizeStatus(rawStatus: string | null | undefined, source?: string): string {
  if (!rawStatus) {
    return "New"
  }

  const status = rawStatus.toLowerCase().trim()

  // Wazuh status mapping
  if (source === "wazuh") {
    if (status === "open") return "New"
    if (status === "in_progress") return "In Progress"
    if (status === "resolved") return "Resolved"
  }

  // QRadar status mapping
  if (source === "qradar") {
    if (status === "open") return "New"
    if (status === "resolved") return "Resolved"
    if (status === "in_progress") return "In Progress"
  }

  // Default/Generic mapping
  if (status === "new" || status === "open" || status === "created") return "New"
  if (status === "in progress" || status === "in_progress" || status === "assigned") return "In Progress"
  if (status === "resolved" || status === "closed" || status === "done") return "Resolved"
  if (status === "cancelled" || status === "rejected") return "Cancelled"

  // If no mapping found, return as-is but capitalize first letter
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export type UIStatus = "New" | "In Progress" | "Resolved" | "Cancelled" | "Closed"

export function isValidUIStatus(status: string): status is UIStatus {
  return ["New", "In Progress", "Resolved", "Cancelled", "Closed"].includes(status)
}
