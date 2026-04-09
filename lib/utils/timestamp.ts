/**
 * Timezone utilities for consistent timestamp handling across the app
 */

/**
 * Format a UTC timestamp to user's local timezone
 * @param timestamp - ISO string or Date object from database (stored in UTC)
 * @returns User's local time formatted string
 */
export function formatTimestampToLocal(timestamp: string | Date | null | undefined): string {
  if (!timestamp) return "N/A"

  try {
    // Ensure we have a Date object
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp)

    // Check if valid date
    if (isNaN(date.getTime())) {
      return "Invalid Date"
    }

    // Use browser's local timezone via toLocaleString
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  } catch (error) {
    console.error("Error formatting timestamp:", error)
    return "Error"
  }
}

/**
 * Format timestamp for display with timezone info
 * Shows: "2/11/2026, 19:10:07 (UTC+7)" or similar
 */
export function formatTimestampWithTimezone(timestamp: string | Date | null | undefined): string {
  if (!timestamp) return "N/A"

  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp)

    if (isNaN(date.getTime())) {
      return "Invalid Date"
    }

    // Get user's timezone offset in minutes
    // getTimezoneOffset() returns minutes, negative for east of UTC (UTC+7 = -420)
    const offsetMs = date.getTimezoneOffset()
    
    // Convert to hours: -(negative value) = positive for UTC+X
    const offsetHours = Math.round(-(offsetMs / 60))
    
    // Create proper sign and offset string
    // If offset is positive (e.g., 7), use "+", else use "-"
    const offsetSign = offsetHours >= 0 ? "+" : "-"
    const offsetStr = `UTC${offsetSign}${Math.abs(offsetHours)}`

    const localStr = date.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })

    return `${localStr} (${offsetStr})`
  } catch (error) {
    console.error("Error formatting timestamp with timezone:", error)
    return "Error"
  }
}

/**
 * Simple formatter: just local date and time
 */
export function formatDateTime(timestamp: string | Date | null | undefined): string {
  return formatTimestampToLocal(timestamp)
}

/**
 * Verify timezone handling (for debugging)
 * Returns object with UTC time, local time, and offset
 */
export function debugTimezone(timestamp: string | Date | null | undefined) {
  if (!timestamp) return null

  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp)

    if (isNaN(date.getTime())) {
      return null
    }

    const offsetMs = date.getTimezoneOffset()
    const offsetHours = -(offsetMs / 60)

    return {
      iso: date.toISOString(),
      utcTime: date.toUTCString(),
      localTime: date.toString(),
      offsetMs,
      offsetHours,
      formatted: formatTimestampWithTimezone(date),
    }
  } catch (error) {
    console.error("Error in debugTimezone:", error)
    return null
  }
}
