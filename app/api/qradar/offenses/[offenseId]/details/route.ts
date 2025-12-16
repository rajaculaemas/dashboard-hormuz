import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"

export async function GET(request: NextRequest, { params }: { params: { offenseId: string } }) {
  try {
    const { offenseId } = params

    console.log("[v0] Fetching offense details for:", offenseId)

    // Get offense from database
    const offense = await prisma.qradarOffense.findUnique({
      where: { id: offenseId },
    })

    if (!offense) {
      return NextResponse.json({ success: false, error: "Offense not found" }, { status: 404 })
    }

    // Get integration credentials
    const integration = await prisma.integration.findUnique({
      where: { id: offense.integrationId },
    })

    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    const creds = integration.credentials as any
    const qradarClient = new QRadarClient({
      host: creds.host,
      api_key: creds.api_key,
    })

    // Fetch related events from QRadar
    const events = await qradarClient.getRelatedEvents(offenseData.external_id, 24)

    console.log("[v0] Fetched", events.length, "related events")

    // Store events in database
    for (const event of events) {
      const eventId = `qradar-${offenseData.integration_id}-${offenseData.external_id}-${event.qid}-${event.starttime}`

      // Check if event already exists
      const existing = await sql`
        SELECT id FROM qradar_events WHERE id = ${eventId}
      `

      if (existing.length === 0) {
        await sql`
          INSERT INTO qradar_events (
            id, offense_id, qid, starttime, endtime, sourceip, destinationip,
            sourceport, destinationport, protocolid, eventcount, magnitude,
            identityip, username, logsourceid, category, severity, credibility,
            relevance, domainid, eventdirection, postnatdestinationip,
            postnatsourceip, prenatdestinationip, prenatsourceip, payload,
            metadata, created_at
          ) VALUES (
            ${eventId}, ${offenseId}, ${event.qid}, ${event.starttime},
            ${event.endtime}, ${event.sourceip}, ${event.destinationip},
            ${event.sourceport}, ${event.destinationport}, ${event.protocolid},
            ${event.eventcount}, ${event.magnitude}, ${event.identityip},
            ${event.username}, ${event.logsourceid}, ${event.category},
            ${event.severity}, ${event.credibility}, ${event.relevance},
            ${event.domainid}, ${event.eventdirection},
            ${event.postnatdestinationip}, ${event.postnatsourceip},
            ${event.prenatdestinationip}, ${event.prenatsourceip},
            ${event.payload}, ${JSON.stringify(event)}, CURRENT_TIMESTAMP
          )
        `
      }
    }

    return NextResponse.json({
      success: true,
      offense: offenseData,
      events: events,
      eventCount: events.length,
    })
  } catch (error) {
    console.error("[v0] Error fetching offense details:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch offense details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
