/**
 * QRadar Notes Sync Audit Utility
 * 
 * Helps debug and audit inconsistency between:
 * - QRadarOffense.metadata.notes (primary cache from QRadar API)
 * - Alert.metadata.qradar.notes (secondary cache for alert table)
 */

import prisma from "@/lib/prisma"

export interface SyncAuditResult {
  alertId: string
  offenseId: number
  integrationId: string
  alertHasNotes: boolean
  alertNotesCount: number | null
  alertNotesLastSynced: string | null
  offenseHasNotes: boolean
  offenseNotesCount: number | null
  offenseNotesLastSynced: string | null
  isSyncConsistent: boolean
  source: "alert" | "offense" | "both" | "neither"
  issues: string[]
}

/**
 * Audit a specific QRadar alert for notes sync consistency
 */
export async function auditQRadarAlertNotes(
  alertId: string,
  offenseId: number,
  integrationId: string
): Promise<SyncAuditResult> {
  const issues: string[] = []

  // Fetch alert metadata
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    select: { metadata: true },
  })

  const alertMeta = (alert?.metadata as any) || {}
  const alertQradarMeta = alertMeta?.qradar || {}
  const alertNotes = alertQradarMeta?.notes
  const alertNotesCount = Array.isArray(alertNotes) ? alertNotes.length : null
  const alertHasNotes = alertNotesCount ? alertNotesCount > 0 : false
  const alertNotesLastSynced = alertQradarMeta?.notesLastSyncedAt

  // Fetch offense metadata
  const offense = await prisma.qRadarOffense.findFirst({
    where: { externalId: offenseId, integrationId },
    select: { metadata: true },
  })

  const offenseMeta = (offense?.metadata as any) || {}
  const offenseNotes = offenseMeta?.notes
  const offenseNotesCount = Array.isArray(offenseNotes) ? offenseNotes.length : null
  const offenseHasNotes = offenseNotesCount ? offenseNotesCount > 0 : false
  const offenseNotesLastSynced = offenseMeta?.notesLastSyncedAt

  // Determine consistency
  const isSyncConsistent =
    alertHasNotes === offenseHasNotes &&
    alertNotesCount === offenseNotesCount &&
    alertNotesLastSynced === offenseNotesLastSynced

  // Determine source
  let source: "alert" | "offense" | "both" | "neither" = "neither"
  if (alertHasNotes && offenseHasNotes) {
    source = "both"
  } else if (alertHasNotes) {
    source = "alert"
    issues.push(
      `Alert has ${alertNotesCount} notes but Offense cache is empty - sync may have failed on offense side`
    )
  } else if (offenseHasNotes) {
    source = "offense"
    issues.push(
      `Offense has ${offenseNotesCount} notes but Alert metadata is empty - notes not merged to alert table`
    )
  }

  // Check timestamp consistency
  if (alertNotesLastSynced && offenseNotesLastSynced) {
    if (alertNotesLastSynced !== offenseNotesLastSynced) {
      issues.push(
        `Timestamps don't match: Alert=${alertNotesLastSynced}, Offense=${offenseNotesLastSynced}`
      )
    }
  } else if (alertNotesLastSynced || offenseNotesLastSynced) {
    issues.push(
      `Only one cache has timestamp: Alert=${alertNotesLastSynced}, Offense=${offenseNotesLastSynced}`
    )
  }

  return {
    alertId,
    offenseId,
    integrationId,
    alertHasNotes,
    alertNotesCount,
    alertNotesLastSynced,
    offenseHasNotes,
    offenseNotesCount,
    offenseNotesLastSynced,
    isSyncConsistent,
    source,
    issues,
  }
}

/**
 * Audit multiple QRadar alerts for sync consistency
 */
export async function auditMultipleAlerts(
  auditConfigs: Array<{ alertId: string; offenseId: number; integrationId: string }>
): Promise<SyncAuditResult[]> {
  const results = await Promise.all(
    auditConfigs.map((config) =>
      auditQRadarAlertNotes(config.alertId, config.offenseId, config.integrationId).catch(
        (err) => {
          console.error(`[Audit] Failed to audit alert ${config.alertId}:`, err)
          return null
        }
      )
    )
  )

  return results.filter((r): r is SyncAuditResult => r !== null)
}

/**
 * Repair inconsistent sync by forcing merge from Offense to Alert
 * This ensures Alert.metadata.qradar.notes matches QRadarOffense.metadata.notes
 */
export async function repairInconsistentNotes(alertId: string, offenseId: number, integrationId: string) {
  try {
    // Get offense notes (source of truth)
    const offense = await prisma.qRadarOffense.findFirst({
      where: { externalId: offenseId, integrationId },
      select: { metadata: true },
    })

    if (!offense) {
      throw new Error(`QRadarOffense not found for offense ${offenseId}`)
    }

    const offenseMeta = (offense.metadata as any) || {}
    const offenseNotes = offenseMeta?.notes
    const offenseLastSynced = offenseMeta?.notesLastSyncedAt

    // Update alert to match offense
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      select: { metadata: true },
    })

    if (!alert) {
      throw new Error(`Alert not found for id ${alertId}`)
    }

    const alertMeta = (alert.metadata as any) || {}
    const qradarMeta = alertMeta?.qradar || {}

    await prisma.alert.update({
      where: { id: alertId },
      data: {
        metadata: {
          ...alertMeta,
          qradar: {
            ...qradarMeta,
            notes: offenseNotes,
            notesLastSyncedAt: offenseLastSynced,
          },
        },
      },
    })

    console.log(
      `[Repair] Alert ${alertId} notes sync repaired - synced ${
        Array.isArray(offenseNotes) ? offenseNotes.length : 0
      } notes`
    )

    return { success: true, notesCount: Array.isArray(offenseNotes) ? offenseNotes.length : 0 }
  } catch (err: any) {
    console.error(`[Repair] Failed to repair alert ${alertId}:`, err.message)
    throw err
  }
}

/**
 * Generate audit report for a batch of QRadar alerts
 */
export async function generateAuditReport(
  auditConfigs: Array<{ alertId: string; offenseId: number; integrationId: string }>
) {
  const results = await auditMultipleAlerts(auditConfigs)

  const inconsistent = results.filter((r) => !r.isSyncConsistent)
  const sourceDisparity = results.filter((r) => r.source !== "both" && r.offenseHasNotes)

  const report = {
    totalAudited: results.length,
    consistent: results.length - inconsistent.length,
    inconsistent: inconsistent.length,
    sourceDisparity: sourceDisparity.length,
    details: {
      inconsistent: inconsistent.map((r) => ({
        alertId: r.alertId,
        offenseId: r.offenseId,
        issues: r.issues,
      })),
      sourceDisparity: sourceDisparity.map((r) => ({
        alertId: r.alertId,
        offenseId: r.offenseId,
        source: r.source,
        alertCount: r.alertNotesCount,
        offenseCount: r.offenseNotesCount,
      })),
    },
  }

  return report
}
