import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"
import { SoarClient } from "@/lib/api/soar"

function toCredentialsObject(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const out: Record<string, any> = {}
    for (const item of raw) {
      if (item && typeof item === "object" && "key" in item && "value" in item) {
        out[(item as any).key] = (item as any).value
      }
    }
    return out
  }
  if (typeof raw === "object") return raw as Record<string, any>
  return {}
}

const SEVERITY_NAMES: Record<number, string> = {
  2: "Low", 3: "Medium", 4: "High", 5: "Critical",
}

function normalizeIncident(inc: any) {
  return {
    id: inc.id ?? null,
    name: inc.name ?? null,
    description: typeof inc.description === "object" ? inc.description?.content : (inc.description ?? null),
    plan_status: inc.plan_status ?? null,
    severity_code: inc.severity_code ?? null,
    severity_name: SEVERITY_NAMES[inc.severity_code] ?? null,
    phase_id: inc.phase_id ?? null,
    owner_id: inc.owner_id ?? null,
    creator_principal: inc.creator_principal?.display_name ?? null,
    create_date: inc.create_date ?? null,
    discovered_date: inc.discovered_date ?? null,
    resolution_id: inc.resolution_id ?? null,
    resolution_summary: typeof inc.resolution_summary === "object"
      ? inc.resolution_summary?.content
      : (inc.resolution_summary ?? null),
    vers: inc.vers ?? null,
  }
}

/**
 * POST /api/qradar/soar/link
 *
 * Two modes:
 *  1. mode = "search"  — search SOAR by offense ID keyword, return candidates for user to pick
 *  2. mode = "link"    — link a specific incidentId to the alert (fetch full data and save)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    if (!hasPermission(user.role, "update_alert_status")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const alertId = String(body?.alertId || "").trim()
    const mode = String(body?.mode || "search").trim() // "search" | "link"
    const incidentId = body?.incidentId ? Number(body.incidentId) : null
    const orgId = body?.orgId ? String(body.orgId).trim() : null

    if (!alertId) {
      return NextResponse.json({ success: false, error: "Missing alertId" }, { status: 400 })
    }

    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
      include: { integration: true },
    })

    if (!alert) {
      return NextResponse.json({ success: false, error: "Alert not found" }, { status: 404 })
    }

    if (alert.integration?.source !== "qradar") {
      return NextResponse.json({ success: false, error: "SOAR link only supported for QRadar alerts" }, { status: 400 })
    }

    // Read SOAR credentials from integration
    const credentials = toCredentialsObject(alert.integration?.credentials)
    const host = String(credentials.soar_host || alert.integration?.soarHost || "").trim()
    const keyId = String(credentials.soar_key_id || alert.integration?.soarKeyId || "").trim()
    const keySecret = String(credentials.soar_key_secret || alert.integration?.soarKeySecret || "").trim()
    const defaultOrgId = String(credentials.soar_org_id || alert.integration?.soarOrgId || "").trim()

    if (!host || !keyId || !keySecret || !defaultOrgId) {
      return NextResponse.json(
        { success: false, error: "Missing SOAR credentials on integration" },
        { status: 400 },
      )
    }

    const soarClient = new SoarClient({ host, keyId, keySecret })

    // ── MODE: search ──────────────────────────────────────────────────────────
    if (mode === "search") {
      const offenseId = alert.metadata && typeof alert.metadata === "object"
        ? (alert.metadata as any)?.qradar?.id
        : null

      if (!offenseId) {
        return NextResponse.json(
          { success: false, error: "No QRadar offense ID found on this alert to search with" },
          { status: 400 },
        )
      }

      const keyword = `QRadar ID ${offenseId}`
      const results = await soarClient.searchIncidentsByName(defaultOrgId, keyword)

      return NextResponse.json({
        success: true,
        mode: "search",
        keyword,
        org_id: defaultOrgId,
        candidates: results.map((inc: any) => ({
          id: inc.id,
          name: inc.name,
          plan_status: inc.plan_status,
          severity_code: inc.severity_code,
          create_date: inc.create_date,
        })),
      })
    }

    // ── MODE: link ─────────────────────────────────────────────────────────────
    if (mode === "link") {
      if (!incidentId) {
        return NextResponse.json({ success: false, error: "Missing incidentId for link mode" }, { status: 400 })
      }

      const targetOrgId = orgId || defaultOrgId

      // Fetch full incident + artifacts in parallel
      const [incident, artifacts] = await Promise.all([
        soarClient.getIncident(targetOrgId, incidentId),
        soarClient.getIncidentArtifacts(targetOrgId, incidentId),
      ])

      const existingMetadata = (alert.metadata as any) || {}
      const now = new Date().toISOString()

      const soarMeta = {
        ...(existingMetadata.soar || {}),
        sent: true,
        incident_id: incidentId,
        org_id: targetOrgId,
        linked_manually: true,
        linked_at: now,
        last_synced_at: now,
        incident_details: normalizeIncident(incident),
        artifacts: artifacts,
      }

      await prisma.alert.update({
        where: { id: alertId },
        data: {
          metadata: { ...existingMetadata, soar: soarMeta },
        },
      })

      await prisma.alertTimeline.create({
        data: {
          alertId: alert.id,
          eventType: "soar_link",
          description: `Manually linked to SOAR incident ${incidentId} in org ${targetOrgId}`,
          oldValue: "",
          newValue: String(incidentId),
          changedBy: user.name || user.email || "System",
          changedByUserId: user.userId,
          timestamp: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        mode: "link",
        data: {
          incidentId,
          orgId: targetOrgId,
          incident: normalizeIncident(incident),
        },
      })
    }

    return NextResponse.json({ success: false, error: `Unknown mode: ${mode}` }, { status: 400 })
  } catch (error: any) {
    console.error("[SOAR Link]", error)
    return NextResponse.json(
      { success: false, error: "SOAR link failed", details: error?.message || "Unknown error" },
      { status: 500 },
    )
  }
}
