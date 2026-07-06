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
      try {
        // Get integration and credentials
        const integration = await prisma.integration.findUnique({
          where: { id: integrationId },
        })

        // Check if auto-fetch related events is enabled
        const autoFetchRaw = (integration?.config as any)?.auto_fetch_related_events
        const autoFetchEnabled = 
          autoFetchRaw === undefined || autoFetchRaw === null || autoFetchRaw === true
            ? true
            : !["false", "0", "off", "no", "disabled"].includes(String(autoFetchRaw).toLowerCase())
        
        console.log(`[${requestId}] Integration config:`, JSON.stringify(integration?.config))
        console.log(`[${requestId}] Auto-fetch setting value:`, autoFetchRaw)
        console.log(`[${requestId}] Auto-fetch enabled (final):`, autoFetchEnabled)
        
        if (!autoFetchEnabled) {
          console.log(`[${requestId}] Auto-fetch related events is disabled, skipping on-demand fetch`)
          return NextResponse.json({
            success: true,
            data: [],
            count: 0,
            cached: false,
            note: "Events not available. Auto-fetch is disabled.",
          })
        }

        console.log(`[${requestId}] No saved events found, fetching from QRadar on-demand`)

        if (integration && integration.source?.toLowerCase().includes("qradar")) {
          const creds = integration.credentials as any
          const host = creds.host || creds.HOST
          const apiKey = creds.api_key || creds.apiKey
          const domainId = creds.domain_id ? Number(creds.domain_id) : undefined
          const domain = typeof domainId === 'number' ? `Domain ${domainId}` : (creds.domain || creds.QRADAR_DOMAIN || null)

          if (host && apiKey) {
            const qradarClient = new QRadarClient({ host, api_key: apiKey, domain_id: domainId })
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
                    domain: domain,
                    metadata: {},
                  },
                })
              }

              // First pass: batch extract IPs from all events
              let batchPublicRemoteIp: string | null = null
              let batchAssignedLocalIp: string | null = null
              
              // Helper: extract from direct fields
              const getDirectIp = (event: any, field: string) => {
                return event[field] || event[field.toLowerCase()] || event[field.charAt(0).toUpperCase() + field.slice(1)] || null
              }

              for (const ev of qradarEvents.slice(0, 50)) {
                if (!batchPublicRemoteIp) batchPublicRemoteIp = getDirectIp(ev, "public_remote_ip")
                if (!batchAssignedLocalIp) batchAssignedLocalIp = getDirectIp(ev, "assigned_local_ip")
                if (batchPublicRemoteIp && batchAssignedLocalIp) break
              }

              if (batchPublicRemoteIp || batchAssignedLocalIp) {
                console.log(`[${requestId}] Batch-extracted IPs: public=${batchPublicRemoteIp}, local=${batchAssignedLocalIp}`)
              }

              // Save events
              const savedEvents = await Promise.all(
                qradarEvents.slice(0, 50).map((event: any, index: number) => {
                  // Get IPs from direct fields or use batch fallback
                  const publicRemoteIp = getDirectIp(event, "public_remote_ip") || batchPublicRemoteIp
                  const assignedLocalIp = getDirectIp(event, "assigned_local_ip") || batchAssignedLocalIp

                  return prisma.qRadarEvent.create({
                    data: {
                      externalId: `qradar-event-${offenseId}-${index}-${Date.now()}`,
                      offenseId,
                      domain: domain,
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
                        public_remote_ip: publicRemoteIp,
                        assigned_local_ip: assignedLocalIp,
                      },
                      qradarOffenseId: qradarOffenseRecord.id,
                    },
                  })
                }),
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

    // Transform events to include extracted IP fields from metadata
    const transformedEvents = events.map((event: any) => {
      const publicRemoteIp = event.metadata?.public_remote_ip || null
      const assignedLocalIp = event.metadata?.assigned_local_ip || null
      
      return {
        ...event,
        public_remote_ip: publicRemoteIp,
        assigned_local_ip: assignedLocalIp,
      }
    })

    return NextResponse.json({
      success: true,
      data: transformedEvents,
      count: transformedEvents.length,
      cached: transformedEvents.length > 0,
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
