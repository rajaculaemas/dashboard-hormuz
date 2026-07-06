import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"
import { getAlerts } from "@/lib/api/stellar-cyber"
import { getAlerts as getWazuhAlerts, verifyConnection as verifyWazuhConnection } from "@/lib/api/wazuh"
import { getSocfortressAlerts } from "@/lib/api/socfortress"
import { enqueueQRadarRelatedEventsTask } from "@/lib/utils/qradar-related-events-queue"

export async function POST(request: NextRequest) {
  try {
    const { integrationId, resetCursor, hoursBack, since } = await request.json()
    const syncHoursWindow = 3

    if (!integrationId) {
      return NextResponse.json({ success: false, error: "Integration ID is required" }, { status: 400 })
    }

    console.log("Starting alert sync for integration:", integrationId)

    // Get integration details from database
    const integration = await prisma.integration.findUnique({ where: { id: integrationId } })

    if (!integration) {
      return NextResponse.json({ success: false, error: "Integration not found" }, { status: 404 })
    }

    console.log("Found integration:", integration.name)

    // Build credentials object (handle both array and object shapes)
    let credentials: Record<string, any> = {}
    if (Array.isArray(integration.credentials)) {
      const credentialsArray = integration.credentials as any[]
      credentialsArray.forEach((cred) => {
        if (cred && typeof cred === "object" && "key" in cred && "value" in cred) {
          credentials[cred.key] = cred.value
        }
      })
    } else {
      credentials = (integration.credentials as Record<string, any>) || {}
    }

    const source = (integration.source || "").toString().toLowerCase()

    // Wazuh path
    if (source === "wazuh") {
      console.log("[Wazuh] Starting sync for:", integrationId)
      try {
        const isConnected = await verifyWazuhConnection(integrationId)
        if (!isConnected) {
          return NextResponse.json(
            { success: false, error: "Wazuh connection failed" },
            { status: 500 }
          )
        }

        // Ambil opsi sync dari body jika ada, fallback ke header jika tidak ada (untuk backward compatibility)
        const resetCursorHeader = request.headers.get("X-Wazuh-Reset-Cursor")
        let resolvedResetCursor = false
        if (typeof resetCursor !== "undefined") {
          resolvedResetCursor = Boolean(resetCursor)
        } else if (resetCursorHeader !== null) {
          resolvedResetCursor = resetCursorHeader === "true"
        }

        // Force 3-hour window for all Wazuh sync pulls.
        const syncOptions: any = {
          resetCursor: resolvedResetCursor,
          hoursBack: syncHoursWindow,
        }

        const result = await getWazuhAlerts(integrationId, syncOptions)
        console.log(`[Wazuh] Synced ${result.count} alerts`)

        try {
          if (result && result.count && result.count > 0) {
            await prisma.integration.update({ where: { id: integrationId }, data: { lastSync: new Date() } })
            console.log(`[Wazuh] integration.lastSync updated for ${integrationId}`)
          } else {
            console.log(`[Wazuh] No alerts stored; skipping integration.lastSync update for ${integrationId}`)
          }
        } catch (e) {
          console.error('[Wazuh] Failed to update integration.lastSync:', e)
        }

        return NextResponse.json({
          success: true,
          synced: result.count,
          total: result.count,
          errors: 0,
        })
      } catch (err) {
        console.error("[Wazuh] Sync error:", err)
        return NextResponse.json(
          {
            success: false,
            error: "Wazuh sync failed",
            details: err instanceof Error ? err.message : String(err),
          },
          { status: 500 }
        )
      }
    }

    // QRadar path
    if (source.includes("qradar") || source.includes("siem")) {
      const qHost = credentials.host || credentials.QRADAR_HOST || ""
      const apiKey = credentials.api_key || credentials.QRADAR_API_KEY || credentials.apiKey || ""
      const domain = credentials.domain_id || credentials.domain || credentials.QRADAR_DOMAIN || undefined
      const autoFetchRelatedEventsRaw =
        credentials.auto_fetch_related_events ??
        credentials.qradar_auto_fetch_related_events
      const autoFetchRelatedEvents =
        autoFetchRelatedEventsRaw === undefined || autoFetchRelatedEventsRaw === null
          ? true
          : !["false", "0", "off", "no", "disabled"].includes(
              String(autoFetchRelatedEventsRaw).trim().toLowerCase(),
            )

      if (!qHost || !apiKey) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing QRadar integration credentials. Please check integration configuration (host, api_key).",
            details: { host: !qHost ? "missing" : "ok", api_key: !apiKey ? "missing" : "ok" },
          },
          { status: 400 },
        )
      }

      try {
        const qradarClient = new QRadarClient({ host: qHost, api_key: apiKey, domain_id: domain ? Number(domain) : undefined })
        const threeHoursMs = syncHoursWindow * 60 * 60 * 1000
        const offenses = await qradarClient.getOffenses(threeHoursMs, 50)

        const domainIdNum = domain ? Number(domain) : null
        console.log("[v0] QRadar: fetched", offenses.length, "offenses, filtering for domain_id:", domainIdNum || "none")

        // If domain_id is configured, filter offenses
        let filteredOffenses = offenses
        if (domainIdNum !== null) {
          const beforeFilter = offenses.length
          filteredOffenses = offenses.filter((off: any) => off.domain_id === domainIdNum)
          console.log(`[v0] QRadar: Filtered offenses by domain_id ${domainIdNum}: ${beforeFilter} → ${filteredOffenses.length}`)
        }

        const offenseIds = filteredOffenses
          .map((off: any) => Number(off.id))
          .filter((id: number) => Number.isFinite(id))

        const existingOffenses = offenseIds.length > 0
          ? await prisma.qRadarOffense.findMany({
              where: {
                externalId: { in: offenseIds },
                integrationId,
              },
              select: {
                externalId: true,
                metadata: true,
              },
            })
          : []

        const offenseMetadataByExternalId = new Map<number, any>(
          existingOffenses.map((row) => [row.externalId, (row.metadata as any) || {}]),
        )

        const offensesWithPrefetchMarker = new Set<number>(
          existingOffenses
            .filter((row) => Boolean(((row.metadata as any) || {}).relatedEventsPrefetchedAt))
            .map((row) => row.externalId),
        )

        const cachedEventOffenses = offenseIds.length > 0
          ? await prisma.qRadarEvent.findMany({
              where: { offenseId: { in: offenseIds } },
              select: { offenseId: true },
              distinct: ["offenseId"],
            })
          : []

        const offensesWithCachedEvents = new Set(cachedEventOffenses.map((row) => row.offenseId))
        const offensesToPrefetch: Array<{ offenseId: number; qradarOffenseId: string; domain: string | null; offenseMetadata: any }> = []

        let synced = 0
        let errors = 0

        for (const off of filteredOffenses) {
          try {
            const externalId = off.id
            const domainName = off.domain_name || (typeof domain === 'number' ? `Domain ${domain}` : domain) || null
            const existingOffenseMetadata = offenseMetadataByExternalId.get(externalId) || {}
            const mapped: any = {
              externalId: externalId,
              title: off.description || `Offense ${externalId}`,
              description: off.description || null,
              severity: String(off.severity || "0"),
              status: off.status || "OPEN",
              offenseType: off.offense_type ? String(off.offense_type) : null,
              eventCount: off.event_count || 0,
              lastUpdatedTime: off.last_updated_time ? new Date(off.last_updated_time) : null,
              startTime: off.start_time ? new Date(off.start_time) : new Date(),
              endTime: off.close_time ? new Date(off.close_time) : null,
              sourceIps: off.source_network ? [off.source_network] : [],
              destinationIps: Array.isArray(off.destination_networks) ? off.destination_networks : [],
              domain: domainName,
              metadata: {
                ...(existingOffenseMetadata && typeof existingOffenseMetadata === "object" ? existingOffenseMetadata : {}),
                ...off,
              },
              integrationId: integrationId,
            }

            const upsertedOffense = await prisma.qRadarOffense.upsert({
              where: { externalId: externalId },
              update: {
                title: mapped.title,
                description: mapped.description,
                severity: mapped.severity,
                status: mapped.status,
                offenseType: mapped.offenseType,
                eventCount: mapped.eventCount,
                lastUpdatedTime: mapped.lastUpdatedTime || undefined,
                startTime: mapped.startTime,
                endTime: mapped.endTime || undefined,
                sourceIps: mapped.sourceIps,
                destinationIps: mapped.destinationIps,
                domain: mapped.domain,
                metadata: mapped.metadata,
                integrationId: mapped.integrationId,
              },
              create: mapped,
            })

            if (autoFetchRelatedEvents && !offensesWithCachedEvents.has(externalId) && !offensesWithPrefetchMarker.has(externalId)) {
              offensesToPrefetch.push({
                offenseId: externalId,
                qradarOffenseId: upsertedOffense.id,
                domain: domainName,
                offenseMetadata: (upsertedOffense.metadata as any) || {},
              })
            }

            // Also upsert into generic alerts table so QRadar offenses appear in the unified alerts feed
            try {
              const alertExternalId = `qradar-${integrationId}-${externalId}`

              const mapSeverity = (sev: any) => {
                const n = Number(sev) || 0
                if (n >= 9) return "Critical"
                if (n >= 7) return "High"
                if (n >= 3) return "Medium"
                return "Low"
              }

              const mapStatus = (s: string) => {
                const st = (s || "").toString().toUpperCase()
                if (st === "OPEN") return "New"
                if (st === "FOLLOW_UP") return "In Progress"
                if (st === "CLOSED") return "Closed"
                return st || "New"
              }

              // Use start_time for alert timestamp (when offense was created), not last_persisted_time (when it was last updated)
              // This ensures dashboard shows same timestamp as QRadar UI
              const alertTimestamp = off.start_time ? new Date(off.start_time) : new Date()

              // ALWAYS sync status from QRadar - app status should match QRadar source of truth
              const mappedStatus = mapStatus(off.status)
              const statusToPersist = mappedStatus

              // Get existing alert to preserve metadata (but not status)
              const existingAlert = await prisma.alert.findUnique({ where: { externalId: alertExternalId } })

              // Merge existing QRadar metadata so local flags (e.g., follow_up, assignee) are not lost
              const mergedMetadata = (() => {
                const existingMetadata = (existingAlert?.metadata as any) || {}
                const existingQRadar = existingMetadata.qradar || {}
                
                // Extract username from offense_source (format: "user@domain" or "domain\user" or just "user")
                const offenseSource = off.offense_source || ""
                let username = "N/A"
                if (offenseSource) {
                  // Try pattern: domain\user or user@domain
                  const domainUserMatch = offenseSource.match(/\\([^\\]+)$|@/) // Matches \user at end or @
                  if (domainUserMatch) {
                    // Format: domain\user -> extract "user"
                    const backslashMatch = offenseSource.match(/\\([^\\]+)$/)
                    if (backslashMatch) {
                      username = backslashMatch[1]
                    } else {
                      // Format: user@domain -> extract "user"
                      const atMatch = offenseSource.match(/^([^@]+)@/)
                      if (atMatch) {
                        username = atMatch[1]
                      }
                    }
                  } else {
                    // No separator found, use whole offense_source as username
                    username = offenseSource
                  }
                }
                
                // Build QRadar metadata, ensuring assigned_to is always present
                const qradarMeta = { ...existingQRadar, ...off }
                
                // If assigned_to is missing/null, try to get it from existing data
                if (!qradarMeta.assigned_to && existingQRadar.assigned_to) {
                  qradarMeta.assigned_to = existingQRadar.assigned_to
                }
                
                // If still no assigned_to, set to "Unassigned"
                if (!qradarMeta.assigned_to) {
                  qradarMeta.assigned_to = "Unassigned"
                }
                
                return {
                  ...existingMetadata,
                  domain: domain,  // Add domain to top-level metadata
                  username: username,  // Add extracted username for easy access
                  offense_source: offenseSource,  // Keep original for reference
                  qradar: qradarMeta,
                }
              })()

              const alertUpsert = {
                externalId: alertExternalId,
                title: off.description || `QRadar Offense ${externalId}`,
                description: off.description || "",
                severity: mapSeverity(off.severity),
                status: statusToPersist,
                timestamp: alertTimestamp,
                integrationId: integrationId,
                metadata: mergedMetadata,
              }

              await prisma.alert.upsert({
                where: { externalId: alertUpsert.externalId },
                update: {
                  title: alertUpsert.title,
                  description: alertUpsert.description,
                  severity: alertUpsert.severity,
                  status: alertUpsert.status,
                  timestamp: alertUpsert.timestamp,
                  metadata: alertUpsert.metadata,
                },
                create: alertUpsert,
              })
            } catch (err) {
              console.error("[v0] QRadar: error upserting generic alert", off.id, err)
            }

            synced++
          } catch (err) {
            console.error("[v0] QRadar: error upserting offense", off.id, err)
            errors++
          }
        }

        let prefetchedOffenses = 0
        let prefetchedEvents = 0
        let prefetchErrors = 0
        const prefetchConcurrency = 1

        if (autoFetchRelatedEvents) {
          for (let i = 0; i < offensesToPrefetch.length; i += prefetchConcurrency) {
            const batch = offensesToPrefetch.slice(i, i + prefetchConcurrency)

            await Promise.all(
              batch.map(async (target) => {
                try {
                  const qradarEvents = await enqueueQRadarRelatedEventsTask(
                    `qradar-related-events:${integrationId}`,
                    () => qradarClient.getRelatedEvents(target.offenseId, 12),
                  )
                  const eventsToSave = qradarEvents.slice(0, 15)

                  if (eventsToSave.length > 0) {
                    await prisma.qRadarEvent.deleteMany({ where: { offenseId: target.offenseId } })

                    const savePromises = eventsToSave.map((event: any, index: number) =>
                      prisma.qRadarEvent.create({
                        data: {
                          externalId: `qradar-event-${target.offenseId}-${index}-${Date.now()}`,
                          offenseId: target.offenseId,
                          domain: target.domain,
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
                          metadata: {
                            qid: event.qid,
                            category: event.category,
                            credibility: event.credibility,
                            relevance: event.relevance,
                            magnitude: event.magnitude,
                            username: event.username,
                            logsourceid: event.logsourceid,
                            msg: event.msg,
                            protocolid: event.protocolid,
                          },
                          qradarOffenseId: target.qradarOffenseId,
                        },
                      }),
                    )

                    await Promise.all(savePromises)
                  }

                  await prisma.qRadarOffense.update({
                    where: { id: target.qradarOffenseId },
                    data: {
                      metadata: {
                        ...(target.offenseMetadata && typeof target.offenseMetadata === "object" ? target.offenseMetadata : {}),
                        relatedEventsPrefetchedAt: new Date().toISOString(),
                        relatedEventsPrefetchWindowHours: 12,
                        relatedEventsPrefetchCount: eventsToSave.length,
                      },
                    },
                  })

                  prefetchedOffenses++
                  prefetchedEvents += eventsToSave.length
                } catch (err) {
                  prefetchErrors++
                  console.error("[v0] QRadar: failed to prefetch related events", target.offenseId, err)
                }
              }),
            )
          }
        }

        await prisma.integration.update({ where: { id: integrationId }, data: { lastSync: new Date() } })

        return NextResponse.json({
          success: true,
          synced,
          total: offenses.length,
          errors,
          prefetchedOffenses,
          prefetchedEvents,
          prefetchErrors,
          prefetchWindowHours: 12,
          autoFetchRelatedEvents,
        })
      } catch (err) {
        console.error("[v0] QRadar sync error:", err)
        return NextResponse.json({ success: false, error: "Failed to sync QRadar offenses", details: err instanceof Error ? err.message : String(err) }, { status: 500 })
      }
    }

    // SOCFortress/Copilot MySQL path
    if (source === "socfortress" || source === "copilot") {
      console.log("[SOCFortress] Starting sync for:", integrationId)
      try {
        const fromDate = new Date(Date.now() - syncHoursWindow * 60 * 60 * 1000)
        const result = await getSocfortressAlerts(integrationId, { limit: 100, fromDate })

        console.log(`[SOCFortress] Fetched ${result.count} alerts`)

        let syncedCount = 0
        let errorCount = 0

        for (const alert of result.alerts) {
          try {
            const mappedAlert = {
              externalId: alert.externalId,
              title: alert.title,
              description: alert.description || "",
              severity: alert.severity,
              status: alert.status,
              timestamp: alert.timestamp,
              integrationId: alert.integrationId,
              metadata: alert.metadata || {},
            }

            console.log(`[SOCFortress] Upserting alert ${alert.externalId}: "${alert.title}" with status "${alert.status}" and ${alert.metadata?.tags?.length || 0} tags:`, alert.metadata?.tags)

            await prisma.alert.upsert({
              where: { externalId: alert.externalId },
              update: {
                title: mappedAlert.title,
                description: mappedAlert.description,
                severity: mappedAlert.severity,
                status: mappedAlert.status,
                timestamp: mappedAlert.timestamp,
                metadata: mappedAlert.metadata,
              },
              create: mappedAlert,
            })

            syncedCount++
          } catch (err) {
            console.error("[SOCFortress] Error syncing alert", alert.externalId, err)
            errorCount++
          }
        }

        await prisma.integration.update({ where: { id: integrationId }, data: { lastSync: new Date() } })

        console.log(`[SOCFortress] Sync complete: ${syncedCount} synced, ${errorCount} errors`)

        return NextResponse.json({
          success: true,
          message: `Successfully synced ${syncedCount} alerts`,
          synced: syncedCount,
          errors: errorCount,
          total: result.count,
        })
      } catch (err) {
        console.error("[SOCFortress] Sync error:", err)
        return NextResponse.json(
          {
            success: false,
            error: "Failed to sync SOCFortress alerts",
            details: err instanceof Error ? err.message : String(err),
          },
          { status: 500 },
        )
      }
    }

    // Stellar Cyber path (default, but now explicit check)
    if (source.includes("stellar-cyber") || source === "custom") {
      try {
        const endTime = new Date()
        const startTime = new Date(endTime.getTime() - syncHoursWindow * 60 * 60 * 1000)
        const alerts = await getAlerts({
          integrationId,
          limit: 150,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        })

      console.log("[v0] Stellar Cyber: fetched", alerts.length, "alerts")

      if (!alerts || alerts.length === 0) {
        await prisma.integration.update({ where: { id: integrationId }, data: { lastSync: new Date() } })
        return NextResponse.json({ success: true, message: "No alerts found in the specified time range", synced: 0, errors: 0 })
      }

      let syncedCount = 0
      let errorCount = 0

      for (const a of alerts) {
        try {
          const externalId = a._id
          const stellarMetadata = a.metadata || {}
          
          const mappedAlert = {
            externalId,
            title: a.title || "Unknown Alert",
            description: a.description || "",
            severity: String(a.severity || "0"),
            status: a.status || "New",
            timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
            integrationId: integrationId,
          }

          // Use atomic DB-level upsert that preserves local-only assignee
          // This avoids race conditions from application-level read-merge-write
          const existing = await prisma.alert.findUnique({ where: { externalId }, select: { id: true } })
          
          if (existing) {
            // UPDATE: merge Stellar data but atomically preserve local assignee if set
            await prisma.$executeRaw`
              UPDATE alerts
              SET
                title = ${mappedAlert.title},
                description = ${mappedAlert.description},
                severity = ${mappedAlert.severity},
                status = ${mappedAlert.status},
                timestamp = ${mappedAlert.timestamp},
                metadata = CASE
                  WHEN metadata->>'assignee' IS NOT NULL AND metadata->>'assignee' != ''
                  THEN ${JSON.stringify(stellarMetadata)}::jsonb || jsonb_build_object('assignee', metadata->>'assignee')
                  ELSE ${JSON.stringify(stellarMetadata)}::jsonb
                END,
                updated_at = NOW()
              WHERE external_id = ${externalId}
            `
          } else {
            // CREATE: new alert, no local assignee yet
            await prisma.alert.create({
              data: {
                ...mappedAlert,
                metadata: stellarMetadata,
              },
            })
          }

          syncedCount++
        } catch (err) {
          console.error("[v0] Error syncing alert", err)
          errorCount++
        }
      }

      await prisma.integration.update({ where: { id: integrationId }, data: { lastSync: new Date() } })

      return NextResponse.json({ success: true, message: `Successfully synced ${syncedCount} alerts`, synced: syncedCount, errors: errorCount, total: alerts.length })
    } catch (err) {
      console.error("[v0] Stellar sync error:", err)
      return NextResponse.json({ success: false, error: "Failed to sync Stellar Cyber alerts", details: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
    }

    // Unsupported integration type
    return NextResponse.json(
      { success: false, error: `Unsupported integration type: ${source}` },
      { status: 400 }
    )
  } catch (error) {
    console.error("? Error in alert sync:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error during alert sync",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
