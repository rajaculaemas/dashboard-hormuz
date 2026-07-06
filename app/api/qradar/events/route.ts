import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"
import { enqueueQRadarRelatedEventsTask } from "@/lib/utils/qradar-related-events-queue"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const offenseId = searchParams.get("offenseId")
    const integrationId = searchParams.get("integrationId")
    const forceRefresh = searchParams.get("forceRefresh") === "true" // Support force refresh parameter
    const requestedHoursBack = Number(searchParams.get("hoursBack") || "12")
    const hoursBack = Number.isFinite(requestedHoursBack)
      ? Math.min(12, Math.max(1, Math.floor(requestedHoursBack)))
      : 12

    if (!offenseId || !integrationId) {
      return NextResponse.json(
        { success: false, error: "Missing offenseId or integrationId" },
        { status: 400 },
      )
    }

    const offenseIdNum = Number(offenseId)
    console.log("[v0] ===== START: Fetching events for offense:", offenseIdNum, "integration:", integrationId, "forceRefresh:", forceRefresh)

    // Helper function to extract public_remote_ip from event payload (defined early for scope)
    const extractPublicRemoteIp = (event: any): string | null => {
      // First: Check if QRadar returned the property directly (matches catalog "Public Remote IP")
      if (event && typeof event === "object") {
        if (event["Public Remote IP"]) return event["Public Remote IP"]
        if (event["public_remote_ip"]) return event["public_remote_ip"]
        if (event["publicRemoteIP"]) return event["publicRemoteIP"]
        if (event["PublicRemoteIP"]) return event["PublicRemoteIP"]
        if (event.metadata?.["Public Remote IP"]) return event.metadata["Public Remote IP"]
        if (event.metadata?.public_remote_ip) return event.metadata.public_remote_ip
      }

      // Second: Extract from payload using regex patterns
      let payloadMsg: string | null = null
      
      if (typeof event?.payload === "string") {
        // Try to parse as JSON first (nested payload structure)
        try {
          const parsed = JSON.parse(event.payload)
          if (typeof parsed?.payload === "string") {
            // Try to decode from base64
            try {
              payloadMsg = Buffer.from(parsed.payload, "base64").toString("utf-8")
            } catch {
              payloadMsg = parsed.payload
            }
          } else if (typeof parsed?.msg === "string") {
            payloadMsg = parsed.msg
          }
        } catch {
          // If not JSON, try direct base64 decode
          try {
            payloadMsg = Buffer.from(event.payload, "base64").toString("utf-8")
          } catch {
            payloadMsg = event.payload
          }
        }
      } else if (event?.payload && typeof event.payload === "object") {
        // If payload is already parsed object
        if (typeof event.payload.payload === "string") {
          try {
            payloadMsg = Buffer.from(event.payload.payload, "base64").toString("utf-8")
          } catch {
            payloadMsg = event.payload.payload
          }
        } else if (typeof event.payload.msg === "string") {
          payloadMsg = event.payload.msg
        }
      }
      
      if (payloadMsg) {
        const patterns = [
          /connected\s+from\s+([\d\.]+)/,
          /Peer\s+IP=\s*([\d\.]+)/,
          /reconnected\s+from\s+([\d\.]+)/,
          /Peer\s*\[([\d\.]+)\]/,
          /Peer\s*\[([\d\.]+)\.\d+\]/,
        ]
        for (const pattern of patterns) {
          const match = payloadMsg.match(pattern)
          if (match && match[1]) {
            return match[1]
          }
        }
      }
      return null
    }

    // Helper function to extract assigned_local_ip from event payload (defined early for scope)
    const extractAssignedLocalIp = (event: any): string | null => {
      // First: Check if QRadar returned the property directly
      if (event && typeof event === "object") {
        if (event["Assigned Local IP"]) return event["Assigned Local IP"]
        if (event["assigned_local_ip"]) return event["assigned_local_ip"]
        if (event["assignedLocalIP"]) return event["assignedLocalIP"]
        if (event["AssignedLocalIP"]) return event["AssignedLocalIP"]
        if (event.metadata?.["Assigned Local IP"]) return event.metadata["Assigned Local IP"]
        if (event.metadata?.assigned_local_ip) return event.metadata.assigned_local_ip
      }

      // Second: Extract from payload using regex patterns (fallback)
      let payloadMsg: string | null = null
      if (typeof event?.payload === "string") {
        try {
          const parsed = JSON.parse(event.payload)
          if (typeof parsed?.payload === "string") {
            try {
              payloadMsg = Buffer.from(parsed.payload, "base64").toString("utf-8")
            } catch {
              payloadMsg = parsed.payload
            }
          } else if (typeof parsed?.msg === "string") {
            payloadMsg = parsed.msg
          }
        } catch {
          try {
            payloadMsg = Buffer.from(event.payload, "base64").toString("utf-8")
          } catch {
            payloadMsg = event.payload
          }
        }
      } else if (event?.payload && typeof event.payload === "object") {
        if (typeof event.payload.payload === "string") {
          try {
            payloadMsg = Buffer.from(event.payload.payload, "base64").toString("utf-8")
          } catch {
            payloadMsg = event.payload.payload
          }
        } else if (typeof event.payload.msg === "string") {
          payloadMsg = event.payload.msg
        }
      }
      
      if (payloadMsg) {
        const patterns = [
          /local\s+ip\s+([\d\.]+)/i,
          /local_ip\s+([\d\.]+)/i,
          /local\s+ip:\s+([\d\.]+)/i,
        ]
        for (const pattern of patterns) {
          const match = payloadMsg.match(pattern)
          if (match && match[1]) {
            return match[1]
          }
        }
      }
      return null
    }

    // If forceRefresh=true, skip cache and always fetch from QRadar
    // Otherwise use cached events when available
    let savedEvents: any[] = []
    if (!forceRefresh) {
      savedEvents = await prisma.qRadarEvent.findMany({
        where: { offenseId: offenseIdNum },
        orderBy: { eventTimestamp: "desc" },
        take: 15,
      })
      console.log("[v0] DB CHECK: Found", savedEvents.length, "saved events in database for offense", offenseIdNum)
      if (savedEvents.length > 0) {
        console.log("[v0] ✓ USING CACHE - Returning", savedEvents.length, "cached events")
      }
    } else {
      console.log("[v0] forceRefresh=true, SKIPPING CACHE and fetching from QRadar")
    }

    let events = savedEvents

    // If no saved events or forceRefresh=true, fetch from QRadar and save to database
    if (events.length === 0 || forceRefresh) {
      // Get integration credentials
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      })

      if (!integration) {
        return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
      }

      const creds = integration.credentials as any
      const domainId = creds.domain_id ? Number(creds.domain_id) : undefined
      const qradarClient = new QRadarClient({
        host: creds.host,
        api_key: creds.api_key,
        domain_id: domainId,
      })

      // Serialize QRadar related-events fetch per integration to avoid request bursts/timeouts.
      events = await enqueueQRadarRelatedEventsTask(`qradar-related-events:${integrationId}`, async () => {
        console.log("[v0] QUEUE TASK START for offense", offenseIdNum)
        const queuedSavedEvents = await prisma.qRadarEvent.findMany({
          where: { offenseId: offenseIdNum },
          orderBy: { eventTimestamp: "desc" },
          take: 15,
        })

        if (queuedSavedEvents.length > 0) {
          console.log("[v0] ✓ QUEUE HIT: Found", queuedSavedEvents.length, "cached events inside queue task")
          return queuedSavedEvents
        }

        console.log("[v0] QUEUE MISS: No cached events inside queue, fetching from QRadar...")

        let qradarEvents: any[] = []
        try {
          qradarEvents = await qradarClient.getRelatedEvents(offenseIdNum, hoursBack)
        } catch (fetchError) {
          const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)
          if (fetchMessage.toLowerCase().includes("timeout")) {
            console.warn("[v0] QRadar related-events timeout (queued), returning empty result for offense", offenseIdNum)
            return []
          }
          throw fetchError
        }
        console.log("[v0] Fetched", qradarEvents.length, "related events from QRadar")

        if (!qradarEvents || qradarEvents.length === 0) {
          return []
        }

        console.log("[v0] Saving", Math.min(qradarEvents.length, 15), "events to database")

        // First pass: scan ALL events in the batch to find the best IP values.
        // This handles CRE-generated events (e.g. "MSIG - VPN Login from Outside Indonesia")
        // which have no payload. Their sibling raw log events (e.g. AnyConnect VPN RADIUS Auth)
        // DO contain the payload with the actual IPs. We extract once and reuse for all events.
        let batchPublicRemoteIp: string | null = null
        let batchAssignedLocalIp: string | null = null
        for (const ev of qradarEvents.slice(0, 15)) {
          if (!batchPublicRemoteIp) batchPublicRemoteIp = extractPublicRemoteIp(ev)
          if (!batchAssignedLocalIp) batchAssignedLocalIp = extractAssignedLocalIp(ev)
          if (batchPublicRemoteIp && batchAssignedLocalIp) break
        }
        if (batchPublicRemoteIp || batchAssignedLocalIp) {
          console.log(`[v0] Batch-extracted IPs for offense ${offenseIdNum}: public_remote_ip="${batchPublicRemoteIp}", assigned_local_ip="${batchAssignedLocalIp}"`)
        }

        console.log("[v0] Deleting old events for offense", offenseIdNum)
        const deleteResult = await prisma.qRadarEvent.deleteMany({
          where: { offenseId: offenseIdNum },
        })
        console.log("[v0] Deleted", deleteResult.count, "old events")

        let qradarOffenseRecord = await prisma.qRadarOffense.findFirst({
          where: { externalId: offenseIdNum, integrationId },
        })

        if (!qradarOffenseRecord) {
          console.log("[v0] Creating new offense record for offense", offenseIdNum)
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

        const savePromises = qradarEvents.slice(0, 15).map((event: any, index: number) => {
          // First priority: Direct fields from QRadar API response (e.g. "public_remote_ip", "Public Remote IP")
          let publicRemoteIp: string | null = null
          let assignedLocalIp: string | null = null

          // Try to get IPs from direct event properties (QRadar catalog fields)
          if (event && typeof event === "object") {
            publicRemoteIp = event["public_remote_ip"] || event["Public Remote IP"] || event["publicRemoteIP"] || event["PublicRemoteIP"] || null
            assignedLocalIp = event["assigned_local_ip"] || event["Assigned Local IP"] || event["assignedLocalIP"] || event["AssignedLocalIP"] || null
          }

          // Fall back to extraction from payload if not found directly
          if (!publicRemoteIp) publicRemoteIp = extractPublicRemoteIp(event)
          if (!assignedLocalIp) assignedLocalIp = extractAssignedLocalIp(event)

          // Last resort: use batch-extracted IPs for CRE events with no payload
          if (!publicRemoteIp) publicRemoteIp = batchPublicRemoteIp
          if (!assignedLocalIp) assignedLocalIp = batchAssignedLocalIp

          if (publicRemoteIp || assignedLocalIp) {
            console.log(
              `[v0] Got public_remote_ip="${publicRemoteIp}", assigned_local_ip="${assignedLocalIp}" for event ${event.qid || event.id}`,
            )
          }

          // Initialize metadata object
          const metadata: any = {
            qid: event.qid,
            event_name: event.event_name,
            category: event.category,
            credibility: event.credibility,
            relevance: event.relevance,
            magnitude: event.magnitude,
            username: event.username,
            logsourceid: event.logsourceid,
            msg: event.msg,
            protocolid: event.protocolid,
            public_remote_ip: publicRemoteIp,
            assigned_local_ip: assignedLocalIp,
          }

          return prisma.qRadarEvent.create({
            data: {
              externalId: `qradar-event-${offenseIdNum}-${index}-${Date.now()}`,
              offenseId: offenseIdNum,
              eventName: event.event_name || event.msg || `Event ${event.qid || index}`,
              eventType: event.event_type,
              sourceIp: event.sourceip || event.source_ip,
              destinationIp: event.destinationip || event.destination_ip,
              sourcePort: event.sourceport ? Number(event.sourceport) : null,
              destinationPort: event.destinationport ? Number(event.destinationport) : null,
              protocol: event.protocolid ? String(event.protocolid) : null,
              severity: event.severity ? Number(event.severity) : null,
              eventTimestamp: event.starttime ? new Date(event.starttime) : new Date(),
              payload: event,
              metadata,
              qradarOffenseId: qradarOffenseRecord.id,
            },
          })
        })

        console.log("[v0] Creating", qradarEvents.slice(0, 15).length, "event records in database")
        try {
          const savedEventRecords = await Promise.all(savePromises)
          console.log("[v0] ✓ SAVE SUCCESS: Saved", savedEventRecords.length, "events to database for offense", offenseIdNum)
          return savedEventRecords
        } catch (saveErr) {
          console.error("[v0] ✗ SAVE ERROR: Failed to save events to database:", saveErr)
          return qradarEvents
        }
      })
      console.log("[v0] QUEUE TASK END: Queue returned", events.length, "events for offense", offenseIdNum)
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
      // Try to get public_remote_ip: first from metadata, then from direct QRadar properties, then extract from payload
      let publicRemoteIp = event.metadata?.public_remote_ip || event.public_remote_ip || payloadObj?.public_remote_ip || payloadObj?.["Public Remote IP"]
      if (!publicRemoteIp) {
        publicRemoteIp = extractPublicRemoteIp(event)
      }
      // Try to get assigned_local_ip: first from metadata, then from direct QRadar properties, then extract from payload
      let assignedLocalIp = event.metadata?.assigned_local_ip || event.assigned_local_ip || payloadObj?.assigned_local_ip || payloadObj?.["Assigned Local IP"]
      if (!assignedLocalIp) {
        assignedLocalIp = extractAssignedLocalIp(event)
      }
      const peerIp = payloadObj?.peer_ip || event.peer_ip || event.metadata?.peer_ip || payloadObj?.["Peer IP (custom)"]
      const userCustom = payloadObj?.user_custom || event.user_custom || event.metadata?.user_custom || payloadObj?.["user (custom)"]
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
        public_remote_ip: publicRemoteIp,
        assigned_local_ip: assignedLocalIp,
        peer_ip: peerIp,
        user_custom: userCustom,
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
      source: savedEvents.length > 0 ? "cache" : "qradar",
      hoursBack,
    })
  } catch (error) {
    console.error("[v0] ✗ ERROR: Failed to fetch QRadar events:", error)
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
