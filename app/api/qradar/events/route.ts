import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const offenseId = searchParams.get("offenseId")
    const integrationId = searchParams.get("integrationId")

    if (!offenseId || !integrationId) {
      return NextResponse.json(
        { success: false, error: "Missing offenseId or integrationId" },
        { status: 400 },
      )
    }

    const offenseIdNum = Number(offenseId)
    console.log("[v0] Fetching events for offense:", offenseIdNum, "integration:", integrationId)

    // First, check if events already exist in database
    let savedEvents = await prisma.qRadarEvent.findMany({
      where: { offenseId: offenseIdNum },
      orderBy: { eventTimestamp: "desc" },
      take: 50,
    })

    console.log("[v0] Found", savedEvents.length, "saved events in database")

    let events = savedEvents

    // If no saved events, fetch from QRadar and save to database
    if (events.length === 0) {
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

      // Fetch related events from QRadar (max 25)
      const qradarEvents = await qradarClient.getRelatedEvents(offenseIdNum, 24)
      console.log("[v0] Fetched", qradarEvents.length, "related events from QRadar")

      // Save events to database
      if (qradarEvents && qradarEvents.length > 0) {
        console.log("[v0] Saving", Math.min(qradarEvents.length, 25), "events to database")

        // Delete old events if any
        await prisma.qRadarEvent.deleteMany({
          where: { offenseId: offenseIdNum },
        })

        // Get or create offense record
        let qradarOffenseRecord = await prisma.qRadarOffense.findFirst({
          where: { externalId: offenseIdNum, integrationId },
        })

        if (!qradarOffenseRecord) {
          qradarOffenseRecord = await prisma.qRadarOffense.create({
            data: {
              externalId: offenseIdNum,
              title: `Offense ${offenseIdNum}`,
              status: "OPEN",
              severity: "0",
              startTime: new Date(),
              integrationId,
              metadata: {},
            },
          })
        }

        // Save all events
        const savePromises = qradarEvents.slice(0, 50).map((event: any, index: number) =>
          prisma.qRadarEvent.create({
            data: {
              externalId: `qradar-event-${offenseIdNum}-${index}-${Date.now()}`,
              offenseId: offenseIdNum,
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
        )

        try {
          const savedEventRecords = await Promise.all(savePromises)
          events = savedEventRecords
          console.log("[v0] Saved", savedEventRecords.length, "events to database")
        } catch (saveErr) {
          console.error("[v0] Error saving events to database:", saveErr)
          // Still return the events from QRadar even if saving fails
          events = qradarEvents
        }
      }
    }

    // Transform events to a meaningful format with intelligent field extraction
    const transformedEvents = events.map((event: any) => {
      // Parse payload to extract all fields
      let payloadObj: any = {}
      if (typeof event.payload === "object") {
        payloadObj = event.payload
      } else if (typeof event.payload === "string") {
        try {
          payloadObj = JSON.parse(event.payload)
        } catch {
          payloadObj = {}
        }
      }

      const payloadStr = JSON.stringify(payloadObj)
      const payloadSnippet = payloadStr ? (payloadStr.length > 300 ? payloadStr.substring(0, 300) + "..." : payloadStr) : null

      // Intelligently build summary from available meaningful fields
      const summaryParts: string[] = []

      // Event name/type - prioritize payload data
      const eventName = payloadObj?.event_name || event.event_name || payloadObj?.eventName || event.eventName || payloadObj?.msg || event.msg
      if (eventName) {
        summaryParts.push(`[${eventName}]`)
      }

      // Network flow from payload or event
      const srcIp = payloadObj?.sourceip || event.sourceip || event.sourceIp
      const dstIp = payloadObj?.destinationip || event.destinationip || event.destinationIp
      const srcPort = payloadObj?.sourceport || event.sourceport || event.sourcePort
      const dstPort = payloadObj?.destinationport || event.destinationport || event.destinationPort

      if (srcIp && dstIp) {
        summaryParts.push(
          `${srcIp}:${srcPort || "?"}→${dstIp}:${dstPort || "?"}`,
        )
      }

      // Fallback to first line of payload
      if (summaryParts.length === 0 && payloadStr) {
        const firstLine = payloadStr.split(/\r?\n/)[0]
        if (firstLine) summaryParts.push(firstLine)
      }

      const qid = payloadObj?.qid || event.qid || event.metadata?.qid
      const summary = summaryParts.join(" | ") || `Event ${qid || event.id}`

      return {
        id: qid || event.id,
        qid: qid,
        event_name: eventName,
        summary: summary,
        starttime: payloadObj?.starttime || event.starttime || event.eventTimestamp,
        endtime: payloadObj?.endtime || event.endtime,
        sourceip: srcIp,
        destinationip: dstIp,
        sourceport: srcPort,
        destinationport: dstPort,
        sourcemac: payloadObj?.sourcemac || event.sourcemac || event.metadata?.sourcemac,
        destinationmac: payloadObj?.destinationmac || event.destinationmac || event.metadata?.destinationmac,
        sourceaddress: payloadObj?.sourceaddress || srcIp,
        destinationaddress: payloadObj?.destinationaddress || dstIp,
        eventdirection: payloadObj?.eventdirection || payloadObj?.direction || event.eventdirection || event.direction || event.metadata?.eventdirection,
        protocol: payloadObj?.protocolid || payloadObj?.protocol || event.protocol,
        eventcount: payloadObj?.eventcount || event.eventcount,
        category: payloadObj?.category || event.category || event.metadata?.category,
        severity: payloadObj?.severity || event.severity,
        username: payloadObj?.username || event.username || event.metadata?.username,
        account_name: payloadObj?.account_name || event.account_name || event.metadata?.account_name,
        logon_account_name: payloadObj?.logon_account_name || event.logon_account_name || event.metadata?.logon_account_name,
        logon_account_domain: payloadObj?.logon_account_domain || event.logon_account_domain || event.metadata?.logon_account_domain,
        logon_type: payloadObj?.logon_type || event.logon_type || event.metadata?.logon_type,
        User: payloadObj?.User || event.User || event.metadata?.User,
        user: payloadObj?.user || event.user || event.metadata?.user,
        suser: payloadObj?.suser || event.suser || event.metadata?.suser,
        logsourceid: payloadObj?.logsourceid || event.logsourceid || event.metadata?.logsourceid,
        logsourceidentifier: payloadObj?.logsourceidentifier || event.logsourceidentifier || event.metadata?.logsourceidentifier,
        log_sources: payloadObj?.log_sources || event.log_sources || event.metadata?.log_sources,
        bytes: payloadObj?.bytes || event.bytes || event.metadata?.bytes,
        packets: payloadObj?.packets || event.packets || event.metadata?.packets,
        payload: payloadStr,
        payloadSnippet,
      }
    })

    return NextResponse.json({
      success: true,
      events: transformedEvents,
      eventCount: transformedEvents.length,
    })
  } catch (error) {
    console.error("[v0] Error fetching QRadar events:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch QRadar events",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
