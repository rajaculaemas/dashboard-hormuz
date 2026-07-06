import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
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

// SOAR artifact type ID → human-readable name
const ARTIFACT_TYPE_NAMES: Record<number, string> = {
  1: "IP Address",
  2: "DNS Name",
  3: "URL",
  4: "Email Sender",
  5: "Email Recipient",
  6: "Malware MD5 Hash",
  7: "Malware SHA-1 Hash",
  8: "Malware SHA-256 Hash",
  9: "Network Range",
  10: "Port",
  19: "File Path",
  20: "System Name",
  25: "String",
  26: "Port/Protocol",
  27: "Malware Family/Variant",
  28: "Certificate Thumbprint",
  29: "Log File",
}

// SOAR severity_code → label
const SEVERITY_NAMES: Record<number, string> = {
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Critical",
}

function normalizeArtifact(a: any) {
  return {
    id: a.id ?? null,
    type_id: a.type ?? null,
    type_name: ARTIFACT_TYPE_NAMES[a.type] ?? `Type ${a.type}`,
    value: a.value ?? null,
    description: a.description ?? null,
    location: a.location ?? null,
    ip_source: a.ip?.source ?? null,
    ip_destination: a.ip?.destination ?? null,
    hits: (a.hits ?? []).map((h: any) => ({
      id: h.id,
      value: h.value,
      threat_source_type: h.threat_source_type,
      active: h.active,
      created: h.created,
      properties: h.properties ?? {},
    })),
    playbooks: (a.playbooks ?? []).map((p: any) => ({
      handle: p.playbook_handle,
      name: p.display_name,
    })),
    actions: (a.actions ?? []).map((ac: any) => ({
      id: ac.id,
      name: ac.name,
      enabled: ac.enabled,
    })),
    related_incident_count: a.related_incident_count ?? null,
    last_modified_time: a.last_modified_time ?? null,
    creator: a.creator_principal?.display_name ?? a.last_modified_by?.display_name ?? null,
  }
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
    start_date: inc.start_date ?? null,
    due_date: inc.due_date ?? null,
    resolution_id: inc.resolution_id ?? null,
    resolution_summary: typeof inc.resolution_summary === "object"
      ? inc.resolution_summary?.content
      : (inc.resolution_summary ?? null),
    negative_pr_likely: inc.negative_pr_likely ?? null,
    confirmed: inc.confirmed ?? null,
    exposure: inc.exposure ?? null,
    vers: inc.vers ?? null,
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const alertId = searchParams.get("alertId")?.trim()

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

    const soarMeta = (alert.metadata as any)?.soar
    const incidentId = Number(soarMeta?.incident_id ?? 0)
    const orgId = String(soarMeta?.org_id ?? "").trim()

    if (!incidentId || !orgId) {
      return NextResponse.json(
        { success: false, error: "Alert has not been sent to SOAR yet" },
        { status: 400 },
      )
    }

    // Read SOAR credentials from integration
    const credentials = toCredentialsObject(alert.integration?.credentials)
    const host = String(
      credentials.soar_host || alert.integration?.soarHost || "",
    ).trim()
    const keyId = String(
      credentials.soar_key_id || alert.integration?.soarKeyId || "",
    ).trim()
    const keySecret = String(
      credentials.soar_key_secret || alert.integration?.soarKeySecret || "",
    ).trim()

    if (!host || !keyId || !keySecret) {
      return NextResponse.json(
        { success: false, error: "Missing SOAR credentials on integration" },
        { status: 400 },
      )
    }

    const soarClient = new SoarClient({ host, keyId, keySecret })

    // Fetch incident and artifacts in parallel
    const [incident, artifacts] = await Promise.all([
      soarClient.getIncident(orgId, incidentId),
      soarClient.getIncidentArtifacts(orgId, incidentId),
    ])

    const normalized = {
      incident: normalizeIncident(incident),
      artifacts: artifacts.map(normalizeArtifact),
      synced_at: new Date().toISOString(),
    }

    // Persist refreshed data into alert metadata
    const existingMetadata = (alert.metadata as any) || {}
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        metadata: {
          ...existingMetadata,
          soar: {
            ...(existingMetadata.soar || {}),
            incident_details: normalized.incident,
            artifacts: normalized.artifacts,
            last_synced_at: normalized.synced_at,
          },
        },
      },
    })

    return NextResponse.json({ success: true, data: normalized })
  } catch (error: any) {
    console.error("[SOAR Sync] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to sync with SOAR",
        details: error?.message || "Unknown error",
      },
      { status: 500 },
    )
  }
}
