/**
 * Admin API for QRadar notes sync audit and repair
 * 
 * Endpoints:
 * POST /api/admin/qradar-notes-audit/audit - Audit specific alerts
 * POST /api/admin/qradar-notes-audit/repair - Repair inconsistent sync
 * POST /api/admin/qradar-notes-audit/report - Generate audit report for batch
 */

import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import {
  auditQRadarAlertNotes,
  repairInconsistentNotes,
  generateAuditReport,
} from "@/lib/services/qradar-notes-sync-audit"

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // TODO: Add permission check - only admin or authorized user
    // For now, just allow authenticated users
    const { action, alertId, offenseId, integrationId, auditConfigs } = await request.json()

    if (action === "audit") {
      if (!alertId || !offenseId || !integrationId) {
        return NextResponse.json(
          { error: "Missing required fields: alertId, offenseId, integrationId" },
          { status: 400 }
        )
      }

      const result = await auditQRadarAlertNotes(alertId, offenseId, integrationId)

      return NextResponse.json({
        success: true,
        data: result,
      })
    } else if (action === "repair") {
      if (!alertId || !offenseId || !integrationId) {
        return NextResponse.json(
          { error: "Missing required fields: alertId, offenseId, integrationId" },
          { status: 400 }
        )
      }

      const result = await repairInconsistentNotes(alertId, offenseId, integrationId)

      return NextResponse.json({
        success: true,
        message: `Alert ${alertId} notes sync repaired`,
        data: result,
      })
    } else if (action === "report") {
      if (!Array.isArray(auditConfigs)) {
        return NextResponse.json(
          { error: "auditConfigs must be an array" },
          { status: 400 }
        )
      }

      const report = await generateAuditReport(auditConfigs)

      return NextResponse.json({
        success: true,
        data: report,
      })
    } else {
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("[QRadar Notes Audit] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to perform audit",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
