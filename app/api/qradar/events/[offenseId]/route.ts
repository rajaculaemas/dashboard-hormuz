import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"
import { randomUUID } from "crypto"

export async function GET(request: NextRequest, { params }: { params: { offenseId: string } }) {
  const requestId = randomUUID()

  try {
    const offenseId = Number((await params).offenseId)
    const integrationId = request.nextUrl.searchParams.get("integrationId")

    if (isNaN(offenseId)) {
      return NextResponse.json(
        { success: false, error: "Invalid offenseId" },
        { status: 400 },
      )
    }

    console.log(`[${requestId}] Fetching events for offense ${offenseId}`)

    // First, try to get saved events from database
    let events = await prisma.qRadarEvent.findMany({
      where: { offenseId },
      orderBy: { eventTimestamp: "desc" },
      take: 50,
    })

    console.log(`[${requestId}] Found ${events.length} saved events in database`)

    // If no saved events and integrationId provided, fetch from QRadar on-demand
    if (events.length === 0 && integrationId) {
      console.log(`[${requestId}] No saved events found, fetching from QRadar on-demand`)
      
      try {
        // Get integration and credentials
        const integration = await prisma.integration.findUnique({
          where: { id: integrationId },
        })

        if (integration && integration.source?.toLowerCase().includes("qradar")) {
          const creds = integration.credentials as any
          const host = creds.host || creds.HOST
          const apiKey = creds.api_key || creds.apiKey

          if (host && apiKey) {
            const qradarClient = new QRadarClient({ host, api_key: apiKey })
            const qradarEvents = await qradarClient.getRelatedEvents(offenseId)

            console.log(`[${requestId}] Fetched ${qradarEvents.length} events from QRadar`)

            // Save events to database
            if (qradarEvents && qradarEvents.length > 0) {
              console.log(`[${requestId}] Saving ${Math.min(qradarEvents.length, 25)} events to database`)

              // Delete old events
              await prisma.qRadarEvent.deleteMany({
                where: { offenseId },
              })

              // Get the offense record to link events
              let qradarOffenseRecord = await prisma.qRadarOffense.findFirst({
                where: { externalId: offenseId, integrationId },
              })

              if (!qradarOffenseRecord) {
                // Create minimal offense record if not found
                qradarOffenseRecord = await prisma.qRadarOffense.create({
                  data: {
                    externalId: offenseId,
                    title: `Offense ${offenseId}`,
                    status: "OPEN",
                    severity: "0",
                    startTime: new Date(),
                    integrationId,
                    metadata: {},
                  },
                })
              }

              // Save events
              const savedEvents = await Promise.all(
                qradarEvents.slice(0, 50).map((event: any, index: number) =>
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
                        msg: event.msg,
                      },
                      qradarOffenseId: qradarOffenseRecord.id,
                    },
                  }),
                ),
              )

              events = savedEvents
              console.log(`[${requestId}] Saved ${savedEvents.length} events to database`)
            }
          }
        }
      } catch (qradarErr) {
        console.error(`[${requestId}] Error fetching from QRadar on-demand:`, qradarErr)
        // Continue anyway, return empty or cached results
      }
    }

    return NextResponse.json({
      success: true,
      data: events,
      count: events.length,
      cached: events.length > 0,
    })
  } catch (error) {
    console.error(`[${requestId}] Error fetching events:`, error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch events",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
