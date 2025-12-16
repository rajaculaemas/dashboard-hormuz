import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function POST(request: NextRequest) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    if (!hasPermission(user.role, 'view_integrations')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to sync offenses" }, { status: 403 })
    }
    
    const body = await request.json()
    const { integrationId } = body

    if (!integrationId) {
      return NextResponse.json({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    console.log("[v0] Starting QRadar offense sync for integration:", integrationId)

    // Get integration credentials
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    const creds = integration.credentials as any
    const qradarClient = new QRadarClient({
      host: creds.host,
      api_key: creds.api_key,
    })

    // Fetch offenses from last 96 hours
    const offenses = await qradarClient.getOffenses(96 * 60 * 60 * 1000, 100)

    console.log("[v0] Fetched", offenses.length, "offenses from QRadar")

    let syncedCount = 0

    for (const offense of offenses) {
      try {
        const offenseId = `qradar-${integrationId}-${offense.id}`

        // Check if offense already exists
        const existing = await sql`
          SELECT id FROM qradar_offenses WHERE id = ${offenseId}
        `

        if (existing.length > 0) {
          // Update existing
          await sql`
            UPDATE qradar_offenses 
            SET status = ${offense.status},
                assigned_to = ${offense.assigned_to || null},
                severity = ${offense.severity},
                magnitude = ${offense.magnitude},
                credibility = ${offense.credibility},
                relevance = ${offense.relevance},
                event_count = ${offense.event_count},
                device_count = ${offense.device_count},
                close_time = ${offense.close_time || null},
                closing_reason_id = ${offense.closing_reason_id || null},
                closing_user = ${offense.closing_user || null},
                last_persisted_time = ${offense.last_persisted_time},
                follow_up = ${offense.follow_up},
                metadata = ${JSON.stringify(offense)},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ${offenseId}
          `
        } else {
          // Create new
          await sql`
            INSERT INTO qradar_offenses (
              id, external_id, description, severity, magnitude, credibility, relevance,
              status, assigned_to, source_ip, offense_source, categories, rules, log_sources,
              device_count, event_count, flow_count, source_count, local_destination_count,
              remote_destination_count, username_count, security_category_count,
              policy_category_count, category_count, close_time, closing_reason_id,
              closing_user, start_time, last_updated_time, last_persisted_time,
              follow_up, protected, inactive, offense_type, domain_id,
              source_network, destination_networks, source_address_ids,
              local_destination_address_ids, metadata, integration_id, created_at, updated_at
            ) VALUES (
              ${offenseId}, ${offense.id}, ${offense.description}, ${offense.severity},
              ${offense.magnitude}, ${offense.credibility}, ${offense.relevance},
              ${offense.status}, ${offense.assigned_to || null}, ${offense.offense_source},
              ${offense.offense_source}, ${JSON.stringify(offense.categories)},
              ${JSON.stringify(offense.rules)}, ${JSON.stringify(offense.log_sources)},
              ${offense.device_count}, ${offense.event_count}, ${offense.flow_count},
              ${offense.source_count}, ${offense.local_destination_count},
              ${offense.remote_destination_count}, ${offense.username_count},
              ${offense.security_category_count}, ${offense.policy_category_count},
              ${offense.category_count}, ${offense.close_time || null},
              ${offense.closing_reason_id || null}, ${offense.closing_user || null},
              ${offense.start_time}, ${offense.last_updated_time},
              ${offense.last_persisted_time}, ${offense.follow_up},
              ${offense.protected}, ${offense.inactive}, ${offense.offense_type},
              ${offense.domain_id}, ${offense.source_network},
              ${JSON.stringify(offense.destination_networks)},
              ${JSON.stringify(offense.source_address_ids)},
              ${JSON.stringify(offense.local_destination_address_ids)},
              ${JSON.stringify(offense)}, ${integrationId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
          `
        }

        syncedCount++
      } catch (error) {
        console.error("[v0] Error syncing offense", offense.id, ":", error)
      }
    }

    // Update last sync time
    await sql`
      UPDATE integrations SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ${integrationId}
    `

    console.log("[v0] Synced", syncedCount, "offenses successfully")

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      total: offenses.length,
    })
  } catch (error) {
    console.error("[v0] QRadar sync error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to sync QRadar offenses",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
