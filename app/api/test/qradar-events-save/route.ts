import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"

export async function GET(request: NextRequest) {
  try {
    // Get QRadar integration
    const integration = await prisma.integration.findFirst({
      where: { source: "qradar" },
    })

    if (!integration) {
      return NextResponse.json({ error: "QRadar integration not found" }, { status: 404 })
    }

    const creds = integration.credentials as any
    const host = creds.host || creds.HOST
    const apiKey = creds.api_key || creds.apiKey

    if (!host || !apiKey) {
      return NextResponse.json({ error: "Missing QRadar credentials" }, { status: 400 })
    }

    console.log("[TEST] Creating QRadar client...")
    const qradarClient = new QRadarClient({ host, api_key: apiKey })

    // Test with first offense
    const offense = await prisma.qRadarOffense.findFirst({
      where: { integrationId: integration.id },
    })

    if (!offense) {
      return NextResponse.json({ error: "No offenses found" }, { status: 404 })
    }

    // Try to find an offense with events
    let targetOffense = offense
    let events: any[] = []
    let attempts = 0
    let duration = 0
    const maxAttempts = 10

    while (events.length === 0 && attempts < maxAttempts) {
      console.log(`[TEST] Attempt ${attempts + 1}: Fetching events for offense ${targetOffense.externalId}...`)
      const startTime = Date.now()
      events = await qradarClient.getRelatedEvents(targetOffense.externalId)
      duration = Date.now() - startTime
      console.log(`[TEST] Fetched ${events.length} events in ${duration}ms`)

      if (events.length === 0) {
        // Try next offense
        const nextOffense = await prisma.qRadarOffense.findFirst({
          where: {
            integrationId: integration.id,
            externalId: {
              gt: targetOffense.externalId,
            },
          },
        })
        if (!nextOffense) break
        targetOffense = nextOffense
        attempts++
      }
    }

    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No offenses found with related events",
        attempt: attempts,
        durationMs: 0,
      })
    }

    // Save to database
    console.log(`[TEST] Saving ${Math.min(events.length, 25)} events to database for offense ${targetOffense.externalId}...`)
    const saveStartTime = Date.now()
    await prisma.qRadarEvent.deleteMany({
      where: { offenseId: targetOffense.externalId },
    })

    const saved = await Promise.all(
      events.slice(0, 25).map((event: any, idx: number) =>
        prisma.qRadarEvent.create({
          data: {
            externalId: `test-${targetOffense.externalId}-${idx}-${Date.now()}`,
            offenseId: targetOffense.externalId,
            eventName: event.event_name || event.msg || `Event ${idx}`,
            eventType: event.event_type,
            sourceIp: event.sourceip,
            destinationIp: event.destinationip,
            sourcePort: event.sourceport ? Number(event.sourceport) : null,
            destinationPort: event.destinationport ? Number(event.destinationport) : null,
            protocol: event.protocol ? String(event.protocol) : null,
            severity: event.severity ? Number(event.severity) : null,
            eventTimestamp: event.starttime ? new Date(event.starttime) : new Date(),
            payload: event,
            metadata: {
              qid: event.qid,
              category: event.category,
              msg: event.msg,
            },
            qradarOffenseId: targetOffense.id,
          },
        }),
      ),
    )

    const saveDuration = Date.now() - saveStartTime
    console.log(`[TEST] Saved ${saved.length} events successfully in ${saveDuration}ms`)

    return NextResponse.json({
      success: true,
      offense: targetOffense.externalId,
      eventsFetched: events.length,
      eventsSaved: saved.length,
      fetchDurationMs: duration,
      saveDurationMs: saveDuration,
    })
  } catch (error) {
    console.error("[TEST] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
