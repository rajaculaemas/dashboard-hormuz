import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"

/**
 * Manual refresh endpoint for QRadar related events
 * - Timeout: 5 minutes (300000ms)
 * - Used when user manually clicks "Refresh" button
 * - Does NOT affect global sync - this is isolated
 * - Cancels gracefully if QRadar doesn't respond within timeout
 */
export async function GET(request: NextRequest) {
  const MANUAL_REFRESH_TIMEOUT = 5 * 60 * 1000 // 5 minutes

  // Helper function to get public_remote_ip from QRadar event
  // First try direct QRadar property, then fall back to payload extraction
  // Helper function to extract public_remote_ip from QRadar event
  const extractPublicRemoteIp = (event: any): string | null => {
    // First: Check if QRadar returned the property directly
    if (event && typeof event === "object") {
      if (event["Public Remote IP"]) return event["Public Remote IP"]
      if (event["public_remote_ip"]) return event["public_remote_ip"]
      if (event["publicRemoteIP"]) return event["publicRemoteIP"]
      if (event["PublicRemoteIP"]) return event["PublicRemoteIP"]
      if (event.metadata?.["Public Remote IP"]) return event.metadata["Public Remote IP"]
      if (event.metadata?.public_remote_ip) return event.metadata.public_remote_ip
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

  // Helper function to extract assigned_local_ip from QRadar event
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
        /local\s+ip\s+([\d\.]+)/i,  // "local ip 10.200.201.130"
        /local_ip\s+([\d\.]+)/i,    // "local_ip 10.200.201.130"
        /local\s+ip:\s+([\d\.]+)/i, // "Local IP: 10.200.201.130"
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

  try {
    const { searchParams } = new URL(request.url)
    const offenseId = searchParams.get("offenseId")
    const integrationId = searchParams.get("integrationId")
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
    console.log(
      `[Manual Refresh] Starting manual refresh for offense ${offenseIdNum}, integration ${integrationId}`,
    )

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

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => {
      controller.abort()
    }, MANUAL_REFRESH_TIMEOUT)

    try {
      // Fetch related events with timeout
      let qradarEvents: any[] = []
      
      try {
        // getRelatedEvents might need to be modified to accept AbortSignal
        // For now, we'll rely on the timeout handling
        qradarEvents = await Promise.race([
          qradarClient.getRelatedEvents(offenseIdNum, hoursBack),
          new Promise((_, reject) =>
            controller.signal.addEventListener("abort", () =>
              reject(new Error("Manual refresh timeout after 5 minutes - QRadar not responding")),
            ),
          ),
        ]) as any[]
      } catch (fetchError) {
        const fetchMessage = fetchError instanceof Error ? fetchError.message : String(fetchError)
        const isTimeout = fetchMessage.toLowerCase().includes("timeout")

        console.warn(
          `[Manual Refresh] Error fetching related events for offense ${offenseIdNum}:`,
          fetchMessage,
        )

        if (isTimeout || fetchMessage.includes("5 minutes")) {
          return NextResponse.json(
            {
              success: false,
              error: "Request timeout: QRadar did not respond within 5 minutes",
              isTimeout: true,
              offenseId: offenseIdNum,
            },
            { status: 504 },
          )
        }

        throw fetchError
      }

      console.log(
        `[Manual Refresh] Fetched ${qradarEvents.length} related events from QRadar for offense ${offenseIdNum}`,
      )

      if (!qradarEvents || qradarEvents.length === 0) {
        return NextResponse.json({
          success: true,
          events: [],
          message: "No events found for this offense",
          offenseId: offenseIdNum,
        })
      }

      // Save to database (replace old data)
      console.log(
        `[Manual Refresh] Saving ${Math.min(qradarEvents.length, 15)} events to database for offense ${offenseIdNum}`,
      )

      await prisma.qRadarEvent.deleteMany({
        where: { offenseId: offenseIdNum },
      })

      // Get or create QRadar offense record
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

      // Save events with extraction logic
      // First pass: scan ALL events to find IPs. CRE events (like "MSIG - VPN Login from Outside
      // Indonesia") have no payload, but sibling raw log events (AnyConnect VPN auth) do.
      let batchPublicRemoteIp: string | null = null
      let batchAssignedLocalIp: string | null = null
      for (const ev of qradarEvents.slice(0, 15)) {
        if (!batchPublicRemoteIp) batchPublicRemoteIp = extractPublicRemoteIp(ev)
        if (!batchAssignedLocalIp) batchAssignedLocalIp = extractAssignedLocalIp(ev)
        if (batchPublicRemoteIp && batchAssignedLocalIp) break
      }
      if (batchPublicRemoteIp || batchAssignedLocalIp) {
        console.log(`[Manual Refresh] Batch-extracted IPs for offense ${offenseIdNum}: public_remote_ip="${batchPublicRemoteIp}", assigned_local_ip="${batchAssignedLocalIp}"`)
      }

      const savePromises = qradarEvents.slice(0, 15).map((event: any, index: number) => {
        // First priority: Direct fields from QRadar API response
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
            `[Manual Refresh] QRadar: Got public_remote_ip="${publicRemoteIp}", assigned_local_ip="${assignedLocalIp}" for event ${event.qid || event.id} (offense ${offenseIdNum})`,
          )
        }

        // Initialize metadata with extraction results
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

      await Promise.all(savePromises)

      // Update offense metadata to mark manual refresh completion
      await prisma.qRadarOffense.update({
        where: { id: qradarOffenseRecord.id },
        data: {
          metadata: {
            ...(qradarOffenseRecord.metadata as any),
            manualRefreshAt: new Date().toISOString(),
            manualRefreshEventCount: Math.min(qradarEvents.length, 15),
          },
        },
      })

      // Retrieve saved events and transform to match main endpoint format
      const savedEvents = await prisma.qRadarEvent.findMany({
        where: { offenseId: offenseIdNum },
        orderBy: { eventTimestamp: "desc" },
        take: 15,
      })

      // Transform database records to match main endpoint format
      const transformedEvents = savedEvents.map((event: any) => {
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

        // Build summary intelligently
        const summaryParts: string[] = []
        const eventName = payloadObj?.event_name || event.eventName || payloadObj?.msg
        if (eventName) {
          summaryParts.push(`[${eventName}]`)
        }

        const srcIp = payloadObj?.sourceip || event.sourceIp
        const dstIp = payloadObj?.destinationip || event.destinationIp
        const srcPort = payloadObj?.sourceport || event.sourcePort
        const dstPort = payloadObj?.destinationport || event.destinationPort

        if (srcIp && dstIp) {
          summaryParts.push(`${srcIp}:${srcPort || "?"}→${dstIp}:${dstPort || "?"}`)
        }

        if (summaryParts.length === 0 && payloadStr) {
          const firstLine = payloadStr.split(/\r?\n/)[0]
          if (firstLine) summaryParts.push(firstLine)
        }

        const qid = payloadObj?.qid || event.metadata?.qid
        let publicRemoteIp = event.metadata?.public_remote_ip || payloadObj?.public_remote_ip
        if (!publicRemoteIp) {
          publicRemoteIp = extractPublicRemoteIp(payloadObj)
        }
        let assignedLocalIp = event.metadata?.assigned_local_ip || payloadObj?.assigned_local_ip
        if (!assignedLocalIp) {
          assignedLocalIp = extractAssignedLocalIp(payloadObj)
        }
        const peerIp = payloadObj?.peer_ip || event.metadata?.peer_ip
        const userCustom = payloadObj?.user_custom || event.metadata?.user_custom
        const summary = summaryParts.join(" | ") || `Event ${qid || event.id}`

        return {
          id: qid || event.id,
          qid: qid,
          event_name: eventName,
          summary: summary,
          starttime: payloadObj?.starttime || event.eventTimestamp,
          endtime: payloadObj?.endtime || event.eventTimestamp,
          sourceip: srcIp,
          destinationip: dstIp,
          sourceport: srcPort,
          destinationport: dstPort,
          sourcemac: payloadObj?.sourcemac || event.metadata?.sourcemac,
          destinationmac: payloadObj?.destinationmac || event.metadata?.destinationmac,
          sourceaddress: payloadObj?.sourceaddress || srcIp,
          destinationaddress: payloadObj?.destinationaddress || dstIp,
          eventdirection: payloadObj?.eventdirection || payloadObj?.direction || event.metadata?.eventdirection,
          protocol: payloadObj?.protocolid || payloadObj?.protocol || event.protocol,
          eventcount: payloadObj?.eventcount || event.metadata?.eventcount || 1,
          category: payloadObj?.category || event.metadata?.category,
          severity: payloadObj?.severity || event.severity,
          username: payloadObj?.username || event.metadata?.username,
          public_remote_ip: publicRemoteIp,
          assigned_local_ip: assignedLocalIp,
          peer_ip: peerIp,
          user_custom: userCustom,
          account_name: payloadObj?.account_name || event.metadata?.account_name,
          logon_account_name: payloadObj?.logon_account_name || event.metadata?.logon_account_name,
          logon_account_domain: payloadObj?.logon_account_domain || event.metadata?.logon_account_domain,
          logon_type: payloadObj?.logon_type || event.metadata?.logon_type,
          User: payloadObj?.User || event.metadata?.User,
          user: payloadObj?.user || event.metadata?.user,
          suser: payloadObj?.suser || event.metadata?.suser,
          logsourceid: payloadObj?.logsourceid || event.metadata?.logsourceid,
          logsourceidentifier: payloadObj?.logsourceidentifier || event.metadata?.logsourceidentifier,
          log_sources: payloadObj?.log_sources || event.metadata?.log_sources,
          bytes: payloadObj?.bytes || event.metadata?.bytes,
          packets: payloadObj?.packets || event.metadata?.packets,
          payload: payloadStr,
          payloadSnippet,
        }
      })

      console.log(`[Manual Refresh] ✓ Successfully refreshed and saved events for offense ${offenseIdNum}`)

      return NextResponse.json({
        success: true,
        events: transformedEvents,
        eventCount: transformedEvents.length,
        source: "qradar",
        hoursBack,
        fetchedAt: new Date().toISOString(),
        isManualRefresh: true,
      })
    } finally {
      // Clear timeout
      clearTimeout(timeoutHandle)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("[Manual Refresh] Error:", errorMessage)

    // Check if it's a timeout/abort error
    if (errorMessage.toLowerCase().includes("aborted") || errorMessage.toLowerCase().includes("timeout")) {
      return NextResponse.json(
        {
          success: false,
          error: "Request timeout: QRadar did not respond within 5 minutes. Please try again later.",
          isTimeout: true,
        },
        { status: 504 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch related events",
        details: errorMessage,
      },
      { status: 500 },
    )
  }
}
