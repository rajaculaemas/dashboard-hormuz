/**
 * Note/Comment Format Normalizer
 * 
 * Handles multiple note/comment formats across the application:
 * 1. QRadar API format: { id, username, note_text, create_time }
 * 2. Dashboard comment format: { comment, comment_user, comment_time }
 * 3. Legacy formats: { text, content, note, etc. }
 */

export interface NormalizedNote {
  id?: string | number
  text: string
  author: string
  timestamp: Date
  source: "qradar" | "dashboard" | "unknown"
  raw: any
}

/**
 * Normalize a single note from any format to standard format
 */
export function normalizeNote(note: any): NormalizedNote | null {
  if (!note || typeof note !== "object") {
    return null
  }

  // Try to detect QRadar format
  if (note.note_text !== undefined) {
    return {
      id: note.id,
      text: String(note.note_text || "").trim(),
      author: String(note.username || "Unknown").trim(),
      timestamp: new Date(note.create_time || 0),
      source: "qradar",
      raw: note,
    }
  }

  // Try to detect dashboard comment format
  if (note.comment !== undefined) {
    return {
      id: note.comment_id,
      text: String(note.comment || "").trim(),
      author: String(note.comment_user || "Unknown").trim(),
      timestamp: note.comment_time ? new Date(note.comment_time) : new Date(),
      source: "dashboard",
      raw: note,
    }
  }

  // Try fallback formats
  if (note.text !== undefined) {
    return {
      text: String(note.text || "").trim(),
      author: String(note.author || note.user || "Unknown").trim(),
      timestamp: note.timestamp ? new Date(note.timestamp) : new Date(),
      source: "unknown",
      raw: note,
    }
  }

  if (note.content !== undefined) {
    return {
      text: String(note.content || "").trim(),
      author: String(note.author || "Unknown").trim(),
      timestamp: new Date(),
      source: "unknown",
      raw: note,
    }
  }

  return null
}

/**
 * Normalize array of notes from any format
 */
export function normalizeNotes(notes: any): NormalizedNote[] {
  if (!Array.isArray(notes)) {
    if (notes && typeof notes === "object") {
      // Single note provided, treat as array
      const normalized = normalizeNote(notes)
      return normalized ? [normalized] : []
    }
    return []
  }

  return notes
    .map((n) => normalizeNote(n))
    .filter((n): n is NormalizedNote => n !== null)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

/**
 * Check if notes array has any content
 */
export function hasNotes(notes: any): boolean {
  if (!notes) return false
  if (Array.isArray(notes)) {
    return normalizeNotes(notes).length > 0
  }
  return normalizeNote(notes) !== null
}

/**
 * Extract text from notes for display
 * Returns single string with all note texts joined
 */
export function getNotesText(notes: any, separator = " | "): string {
  const normalized = normalizeNotes(notes)
  if (normalized.length === 0) return "-"
  return normalized.map((n) => n.text).filter(Boolean).join(separator)
}

/**
 * Format normalized note for display
 */
export function formatNoteForDisplay(note: NormalizedNote): string {
  const date = note.timestamp.toLocaleString()
  return `${note.author} - ${date}: ${note.text}`
}

/**
 * Format array of notes for display
 */
export function formatNotesForDisplay(notes: any): string[] {
  return normalizeNotes(notes).map((n) => formatNoteForDisplay(n))
}

/**
 * Check if metadata has ANY kind of notes/comments
 * Checks all possible locations: qradar.notes, comment, notes, analysisNotes, etc.
 */
export function hasAnyComments(metadata: any): boolean {
  if (!metadata || typeof metadata !== "object") return false

  // QRadar notes
  if (hasNotes(metadata.qradar?.notes)) return true

  // Dashboard comments
  if (hasNotes(metadata.comment)) return true

  // Legacy notes
  if (hasNotes(metadata.notes)) return true

  // Analysis notes (text field)
  if (typeof metadata.analysisNotes === "string" && metadata.analysisNotes.trim().length > 0) {
    return true
  }

  // Timeline (array of events)
  if (Array.isArray(metadata.timeline) && metadata.timeline.length > 0) return true

  // SOCFortress alert history
  if (
    Array.isArray(metadata.alert_history) &&
    metadata.alert_history.some((h: any) => h?.change_type === "COMMENT_ADDED")
  ) {
    return true
  }

  return false
}

/**
 * Collect all comments from metadata from all possible sources
 */
export function getAllComments(metadata: any): NormalizedNote[] {
  if (!metadata || typeof metadata !== "object") return []

  const allNotes: NormalizedNote[] = []

  // Collect QRadar notes
  allNotes.push(...normalizeNotes(metadata.qradar?.notes))

  // Collect dashboard comments
  allNotes.push(...normalizeNotes(metadata.comment))

  // Collect legacy notes
  allNotes.push(...normalizeNotes(metadata.notes))

  // Sort by timestamp (newest first)
  return allNotes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}
