import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { updateCaseInStellarCyber } from "@/lib/api/stellar-cyber-case"
import { getCaseAlerts } from "@/lib/api/stellar-cyber-case"
import { randomUUID } from "crypto"
import { QRadarClient } from "@/lib/api/qradar"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const requestId = randomUUID()
  console.log(`[${requestId}] Starting request`)

  try {
    const caseId = (await params).id

    console.log(`[${requestId}] Case ID:`, caseId)

    // Try to find a Case row first
    let case_ = await prisma.case.findUnique({
      where: { id: caseId },
      include: { integration: true },
    })

    // If not found as Case, try to find an Alert with this id (we map QRadar tickets to alerts)
    let isAlertRecord = false
    if (!case_) {
      const alertRec = await prisma.alert.findUnique({ where: { id: caseId }, include: { integration: true } })
      if (alertRec) {
        isAlertRecord = true
        // Build a lightweight case-like object from alert
        case_ = {
          id: alertRec.id,
          externalId: alertRec.externalId || alertRec.id,
          name: alertRec.title,
          description: alertRec.description,
          status: alertRec.status,
          severity: alertRec.severity,
          createdAt: alertRec.timestamp,
          modifiedAt: alertRec.updatedAt,
          metadata: alertRec.metadata,
          integration: alertRec.integration,
          integrationId: alertRec.integrationId,
        } as any
      }
    }

    // If not found as Case or Alert, try to find a WazuhCase
    let isWazuhCase = false
    if (!case_) {
      const wazuhCaseRec = await prisma.wazuhCase.findUnique({
        where: { id: caseId },
        include: { 
          alerts: {
            include: {
              alert: {
                include: { integration: true }
              }
            }
          },
          assignee: true
        },
      })
      
      if (wazuhCaseRec) {
        isWazuhCase = true
        // Build a case-like object from WazuhCase
        case_ = {
          id: wazuhCaseRec.id,
          externalId: wazuhCaseRec.caseNumber,
          name: wazuhCaseRec.title,
          description: wazuhCaseRec.description,
          status: wazuhCaseRec.status,
          severity: wazuhCaseRec.severity,
          createdAt: wazuhCaseRec.createdAt,
          modifiedAt: wazuhCaseRec.updatedAt,
          metadata: {
            wazuh: true,
            assignee: wazuhCaseRec.assignee?.name,
            notes: wazuhCaseRec.notes,
          },
          integration: wazuhCaseRec.alerts[0]?.alert?.integration || null,
          integrationId: wazuhCaseRec.alerts[0]?.alert?.integrationId || null,
        } as any
      }
    }

    if (!case_) {
      console.log(`[${requestId}] Case/Alert not found`)
      return NextResponse.json({ success: false, error: "Case or Alert not found" }, { status: 404 })
    }

    console.log(`[${requestId}] Found case/alert:`, case_.name)
    console.log(`[${requestId}] External ID:`, case_.externalId)
    console.log(`[${requestId}] Integration ID:`, case_.integrationId)

    // If this case/alert belongs to a QRadar integration, fetch related events
    let alerts: any[] = []

    if (case_.integration?.source === "qradar") {
      try {
        const creds = case_.integration.credentials as any
        const host = creds.host || creds.HOST || creds.host_name || creds.hostname
        const apiKey = creds.api_key || creds.apiKey || creds.api_key

        if (!host || !apiKey) {
          console.warn(`[${requestId}] QRadar credentials missing for integration ${case_.integration.id}`)
        } else {
          const qradarClient = new QRadarClient({ host, api_key: apiKey })
          // Determine offenseId: prefer metadata.qradar.id, then case_.externalId
          let offenseId = NaN
          try {
            if (case_.metadata?.qradar?.id) offenseId = Number(case_.metadata.qradar.id)
            if (isNaN(offenseId) && case_.externalId) offenseId = Number(case_.externalId)
          } catch (err) {
            offenseId = Number(case_.externalId)
          }

          if (!isNaN(offenseId)) {
            // First, try to get saved events from database
            console.log(`[${requestId}] Checking for saved events for offense ${offenseId}`)
            const savedEvents = await prisma.qRadarEvent.findMany({
              where: { offenseId },
              orderBy: { eventTimestamp: "desc" },
              take: 50,
            })

            if (savedEvents.length > 0) {
              console.log(`[${requestId}] Found ${savedEvents.length} saved events in database`)
              // Map saved events from database
              const mapSeverity = (severity: number | null): string => {
                if (severity === null) return "Low"
                if (severity >= 8) return "Critical"
                if (severity >= 5) return "High"
                if (severity >= 3) return "Medium"
                return "Low"
              }
              
              // Helper to normalize object keys to lowercase
              const normalizeKeys = (obj: any): any => {
                if (!obj || typeof obj !== 'object') return obj
                if (Array.isArray(obj)) return obj.map(normalizeKeys)
                
                const normalized: any = {}
                for (const key in obj) {
                  if (obj.hasOwnProperty(key)) {
                    const lowerKey = key.toLowerCase()
                    normalized[lowerKey] = obj[key]
                  }
                }
                return normalized
              }
              
              alerts = savedEvents.map((e: any, idx: number) => {
                // Normalize the payload/metadata from database
                const rawData = e.payload || e.metadata || {}
                const normalized = normalizeKeys(rawData)
                
                // Merge saved metadata with normalized payload to ensure all fields are available
                const enrichedMetadata = {
                  ...normalized,
                  // Also include stored metadata fields
                  ...(e.metadata || {}),
                }
                
                // Build summary like API does
                const summaryParts: string[] = []
                const eventName = normalized.event_name || normalized.msg
                if (eventName) summaryParts.push(`[${eventName}]`)
                
                const srcIp = normalized.sourceip
                const dstIp = normalized.destinationip
                const srcPort = normalized.sourceport
                const dstPort = normalized.destinationport
                if (srcIp && dstIp) {
                  summaryParts.push(`${srcIp}:${srcPort || "?"}→${dstIp}:${dstPort || "?"}`)
                }
                const summary = summaryParts.length > 0 ? summaryParts.join(" | ") : normalized.msg || `Event ${normalized.qid || idx}`
                
                return {
                  _id: e.id,
                  alert_name: e.eventName || `Event ${normalized.qid || idx}`,
                  summary: summary,
                  severity: mapSeverity(e.severity),
                  alert_time: e.eventTimestamp?.getTime() || Date.now(),
                  status: "N/A",
                  source_ip: e.sourceIp,
                  dest_ip: e.destinationIp,
                  description: normalized.msg || "",
                  metadata: enrichedMetadata,
                  isQRadarEvent: true,  // Flag for frontend to use EventDetailDialog
                }
              })
            } else {
              // If no saved events, fetch from QRadar
              console.log(`[${requestId}] No saved events found, fetching from QRadar`)
              const events = await qradarClient.getRelatedEvents(offenseId)
              
              // Helper function to map QRadar numeric severity to labels
              const mapSeverity = (severity: number | string): string => {
                const num = typeof severity === "string" ? Number(severity) : severity
                if (num >= 8) return "Critical"
                if (num >= 5) return "High"
                if (num >= 3) return "Medium"
                return "Low"
              }
              
              // Helper to normalize object keys to lowercase
              const normalizeKeys = (obj: any): any => {
                if (!obj || typeof obj !== 'object') return obj
                if (Array.isArray(obj)) return obj.map(normalizeKeys)
                
                const normalized: any = {}
                for (const key in obj) {
                  if (obj.hasOwnProperty(key)) {
                    const lowerKey = key.toLowerCase()
                    normalized[lowerKey] = obj[key]
                  }
                }
                return normalized
              }
              
              alerts = (events || []).map((e: any, idx: number) => {
                const normalized = normalizeKeys(e)
                
                // Debug: Log first event to see structure
                if (idx === 0) {
                  console.log(`[${requestId}] FIRST EVENT STRUCTURE (normalized):`, JSON.stringify(normalized, null, 2).substring(0, 1000))
                  console.log(`[${requestId}] Network fields check: sourceip="${normalized.sourceip}", destinationip="${normalized.destinationip}", sourceport="${normalized.sourceport}", destinationport="${normalized.destinationport}"`)
                }
                
                // Build summary like API does
                const summaryParts: string[] = []
                const eventName = normalized.event_name || normalized.msg
                if (eventName) summaryParts.push(`[${eventName}]`)
                
                const srcIp = normalized.sourceip
                const dstIp = normalized.destinationip
                const srcPort = normalized.sourceport
                const dstPort = normalized.destinationport
                if (srcIp && dstIp) {
                  summaryParts.push(`${srcIp}:${srcPort || "?"}→${dstIp}:${dstPort || "?"}`)
                }
                const summary = summaryParts.length > 0 ? summaryParts.join(" | ") : normalized.msg || `Event ${normalized.qid || ""}`
                
                return {
                  _id: `${offenseId}-${idx}`,
                  alert_name: normalized.event_name || normalized.msg || `Event ${normalized.qid || ""}`,
                  summary: summary,
                  severity: mapSeverity(normalized.severity),
                  alert_time: normalized.starttime || normalized.timestamp || Date.now(),
                  status: "N/A",
                  source_ip: normalized.sourceip,
                  dest_ip: normalized.destinationip,
                  description: normalized.msg || "",
                  metadata: normalized,
                  isQRadarEvent: true,  // Flag for frontend to use EventDetailDialog
                }
              })

              // Save events to database synchronously
              if (alerts.length > 0) {
                console.log(`[${requestId}] Saving ${alerts.length} events to database`)
                try {
                  // First, find the QRadarOffense by externalId (which is the offenseId)
                  const qradarOffense = await prisma.qRadarOffense.findUnique({
                    where: { externalId: offenseId },
                  })

                  if (!qradarOffense) {
                    console.warn(`[${requestId}] QRadarOffense not found for externalId ${offenseId}, skipping event save`)
                  } else {
                    // Delete old events
                    await prisma.qRadarEvent.deleteMany({ where: { qradarOffenseId: qradarOffense.id } })
                    
                    // Save new events
                    const savedCount = await Promise.all(
                      (events || []).slice(0, 50).map((event: any, index: number) =>
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
                              event_name: event.event_name || event.msg,
                              category: event.category,
                              credibility: event.credibility,
                              relevance: event.relevance,
                              magnitude: event.magnitude,
                              username: event.username,
                              account_name: event.account_name,
                              logon_account_name: event.logon_account_name,
                              logon_account_domain: event.logon_account_domain,
                              logon_type: event.logon_type,
                              User: event.User,
                              user: event.user,
                              suser: event.suser,
                              logsourceid: event.logsourceid,
                              logsourceidentifier: event.logsourceidentifier,
                              log_sources: event.log_sources,
                              sourcemac: event.sourcemac,
                              destinationmac: event.destinationmac,
                              sourceaddress: event.sourceaddress,
                              destinationaddress: event.destinationaddress,
                              eventdirection: event.eventdirection || event.direction,
                              bytes: event.bytes,
                              packets: event.packets,
                              endtime: event.endtime,
                              eventcount: event.eventcount,
                            },
                            qradarOffenseId: qradarOffense.id,
                          },
                        }),
                      ),
                    )
                    console.log(`[${requestId}] Successfully saved ${savedCount.length} events to database`)
                  }
                } catch (saveErr) {
                  console.error(`[${requestId}] Error saving events to database:`, saveErr)
                }
              }
            }
          } else {
            console.warn(`[${requestId}] Invalid offense id in case.externalId/metadata: ${case_.externalId}`)
          }
        }
      } catch (error) {
        console.error(`[${requestId}] Error fetching related events from QRadar:`, error)
        alerts = []
      }
    } else if (isWazuhCase) {
      // Handle Wazuh case - fetch related alerts
      try {
        console.log(`[${requestId}] Fetching alerts for Wazuh case:`, caseId)
        
        const wazuhCaseRec = await prisma.wazuhCase.findUnique({
          where: { id: caseId },
          include: {
            alerts: {
              include: {
                alert: {
                  include: { integration: true }
                }
              }
            }
          },
        })

        if (wazuhCaseRec && wazuhCaseRec.alerts) {
          alerts = wazuhCaseRec.alerts.map((ca: any) => {
            const alert = ca.alert
            return {
              _id: alert.id,
              id: alert.id,
              alert_name: alert.title,
              title: alert.title,
              severity: alert.severity || "low",
              alert_time: alert.timestamp?.getTime ? alert.timestamp.getTime() : Date.now(),
              status: alert.status,
              description: alert.description,
              metadata: alert.metadata || {},
              externalId: alert.externalId,
              integrationId: alert.integrationId,
              timestamp: alert.timestamp,
              srcip: alert.metadata?.srcIp,
              dstip: alert.metadata?.dstIp,
              srcport: alert.metadata?.srcPort,
              dstport: alert.metadata?.dstPort,
            }
          })
          console.log(`[${requestId}] Successfully fetched ${alerts.length} alerts from Wazuh case`)
        }
      } catch (error) {
        console.error(`[${requestId}] Error fetching alerts from Wazuh case:`, error)
        alerts = []
      }
    } else {
      // Default: Stellar Cyber case alerts
      try {
        console.log(`[${requestId}] Fetching alerts for case:`, case_.externalId)
        alerts = await getCaseAlerts({
          caseId: case_.externalId, // Use external ID for Stellar Cyber API
          integrationId: case_.integrationId,
        })
        console.log(`[${requestId}] Successfully fetched ${alerts.length} alerts`)

        if (alerts.length > 0) {
          console.log(`[${requestId}] Sample alert:`, JSON.stringify(alerts[0], null, 2))
        }
      } catch (error) {
        console.error(`[${requestId}] Error fetching alerts from Stellar Cyber:`, error)
        alerts = []
      }
    }

    const response = {
      success: true,
      data: {
        alerts,
        case: case_,
      },
    }

    console.log(`[${requestId}] Sending response with ${alerts.length} alerts`)
    return NextResponse.json(response)
  } catch (error) {
    console.error(`[${requestId}] Error fetching case alerts:`, error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch case alerts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { status, severity, assignee, notes, closingReasonId, integrationSource } = body

    console.log("[PUT] Updating case:", id, { status, severity, assignee, notes, closingReasonId, integrationSource })

    // Strategy 1: If client specifies Wazuh, try Wazuh first
    if (integrationSource === "wazuh") {
      console.log("[PUT] Client indicated Wazuh case, attempting WazuhCase update")
      try {
        const wazuhCaseRecord = await prisma.wazuhCase.findUnique({
          where: { id },
          include: { assignee: true },
        })

        console.log("[PUT] Found WazuhCase record:", !!wazuhCaseRecord)

        if (wazuhCaseRecord) {
          console.log("[PUT] Updating Wazuh case (via integrationSource), status:", status)
          
          const updatedWazuhCase = await prisma.wazuhCase.update({
            where: { id },
            data: {
              status: status === "New" ? "open" : status === "In Progress" ? "in_progress" : "resolved",
              severity,
              assigneeId: assignee && assignee !== "unassigned" ? assignee : null,
              notes,
              updatedAt: new Date(),
            },
            include: { assignee: true },
          })

          console.log("[PUT] Wazuh case updated successfully:", updatedWazuhCase.title)

          return NextResponse.json({
            success: true,
            data: updatedWazuhCase,
          })
        }
      } catch (err) {
        console.error("[PUT] Error updating Wazuh case:", err)
      }
    }

    // Strategy 2: Try WazuhCase first (blind attempt)
    console.log("[PUT] Attempting to find WazuhCase with id:", id)
    const wazuhCaseRecord = await prisma.wazuhCase.findUnique({
      where: { id },
      include: { assignee: true },
    })

    if (wazuhCaseRecord) {
      console.log("[PUT] Found WazuhCase (blind attempt), updating...")
      
      const updatedWazuhCase = await prisma.wazuhCase.update({
        where: { id },
        data: {
          status: status === "New" ? "open" : status === "In Progress" ? "in_progress" : "resolved",
          severity,
          assigneeId: assignee && assignee !== "unassigned" ? assignee : null,
          notes,
          updatedAt: new Date(),
        },
        include: { assignee: true },
      })

      console.log("[PUT] Wazuh case updated successfully (blind attempt):", updatedWazuhCase.title)

      return NextResponse.json({
        success: true,
        data: updatedWazuhCase,
      })
    }

    // Strategy 3: Try Case record
    console.log("[PUT] WazuhCase not found, attempting to find Case with id:", id)
    let caseRecord = await prisma.case.findUnique({
      where: { id },
      include: { integration: true },
    })

    console.log("[PUT] Found Case record:", !!caseRecord)

    if (!caseRecord) {
      console.log("[PUT] ERROR: Case not found for id:", id)
      return NextResponse.json({
        success: false,
        error: "Case not found",
      }, { status: 404 })
    }

    // Update case in database
    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        status,
        severity,
        assignee,
        updatedAt: new Date(),
      },
      include: {
        integration: true,
      },
    })

    console.log("Case updated successfully:", updatedCase.name)

    // If this case belongs to QRadar, update the offense status in QRadar as well
    if (updatedCase.integration?.source === "qradar") {
      try {
        const creds = updatedCase.integration.credentials as any
        const host = creds.host || creds.HOST || creds.host_name || creds.hostname
        const apiKey = creds.api_key || creds.apiKey || creds.api_key

        if (!host || !apiKey) {
          console.warn(`QRadar credentials missing for integration ${updatedCase.integration.id}`)
        } else {
          const qradarClient = new QRadarClient({ host, api_key: apiKey })
          const offenseId = Number(updatedCase.externalId)
          if (!isNaN(offenseId)) {
            // Only support closing from ticketing UI for QRadar
            if (status === "Closed") {
              await qradarClient.updateOffenseStatus(offenseId, "CLOSED", undefined, closingReasonId)
              console.log(`Updated QRadar offense ${offenseId} to CLOSED`)
            } else {
              console.log(`Ignoring QRadar offense update for status: ${status}`)
            }
          }
        }
      } catch (error) {
        console.error("Error updating QRadar offense status:", error)
      }
    } else {
      // Update case in Stellar Cyber
      try {
        const stellarResult = await updateCaseInStellarCyber({
          caseId: updatedCase.externalId, // Use external ID for Stellar Cyber
          integrationId: updatedCase.integrationId,
          updates: {
            status,
            severity,
            assignee,
          },
        })

        if (!stellarResult.success) {
          console.warn("Failed to update case in Stellar Cyber:", stellarResult.message)
        } else {
          console.log("Successfully updated case in Stellar Cyber")
        }
      } catch (error) {
        console.error("Error updating case in Stellar Cyber:", error)
        // Continue even if Stellar Cyber update fails
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedCase,
    })
  } catch (error) {
    console.error("Error updating case:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to update case",
    })
  }
}
