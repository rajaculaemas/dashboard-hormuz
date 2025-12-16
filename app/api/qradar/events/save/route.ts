import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { randomUUID } from "crypto"

export async function POST(request: NextRequest) {
  const requestId = randomUUID()
  
  try {
    const body = await request.json()
    const { offenseId, events } = body

    if (!offenseId || !Array.isArray(events)) {
      return NextResponse.json(
        { success: false, error: "offenseId and events array are required" },
        { status: 400 },
      )
    }

    console.log(`[${requestId}] Saving ${events.length} events for offense ${offenseId}`)

    // First, delete old events for this offense to keep only latest 25
    await prisma.qRadarEvent.deleteMany({
      where: { offenseId },
    })

    // Save new events
    const savedEvents = await Promise.all(
      events.map((event: any, index: number) =>
        prisma.qRadarEvent.create({
          data: {
            externalId: `qradar-event-${offenseId}-${index}-${Date.now()}`,
            offenseId,
            eventName: event.event_name || event.msg || `Event ${event.qid || index}`,
            eventType: event.event_type,
            sourceIp: event.sourceip || event.source_ip,
            destinationIp: event.destinationip || event.destination_ip,
            sourcePort: event.sourceport ? Number(event.sourceport) : null,
            destinationPort: event.destinationport ? Number(event.destinationport) : null,
            protocol: event.protocol ? String(event.protocol) : null,
            severity: event.severity ? Number(event.severity) : null,
            eventTimestamp: event.starttime ? new Date(event.starttime) : new Date(),
            payload: event,
            metadata: {
              qid: event.qid,
              category: event.category,
              credibility: event.credibility,
              relevance: event.relevance,
              magnitude: event.magnitude,
              username: event.username,
              logsourceid: event.logsourceid,
            },
          },
        }),
      ),
    )

    console.log(`[${requestId}] Successfully saved ${savedEvents.length} events`)

    return NextResponse.json({
      success: true,
      message: `Saved ${savedEvents.length} events`,
      data: {
        offenseId,
        eventCount: savedEvents.length,
      },
    })
  } catch (error) {
    console.error(`[${requestId}] Error saving events:`, error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save events",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
