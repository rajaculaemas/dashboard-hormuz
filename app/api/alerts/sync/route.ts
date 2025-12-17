import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"
import { getAlerts } from "@/lib/api/stellar-cyber"
import { getAlerts as getWazuhAlerts, verifyConnection as verifyWazuhConnection } from "@/lib/api/wazuh"

export async function POST(request: NextRequest) {
  try {
    const { integrationId } = await request.json()

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

        const resetCursorHeader = request.headers.get("X-Wazuh-Reset-Cursor")
        const hoursBackHeader = request.headers.get("X-Wazuh-Hours-Back")
        const sinceHeader = request.headers.get("X-Wazuh-Since")
        const hoursBack = hoursBackHeader ? parseInt(hoursBackHeader, 10) : undefined

        const result = await getWazuhAlerts(integrationId, {
          resetCursor: resetCursorHeader === "true",
          hoursBack,
          since: sinceHeader || undefined,
        })
        console.log(`[Wazuh] Synced ${result.count} alerts`)

        await prisma.integration.update({
          where: { id: integrationId },
          data: { lastSync: new Date() },
        })

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
        const qradarClient = new QRadarClient({ host: qHost, api_key: apiKey })
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
        const offenses = await qradarClient.getOffenses(sevenDaysMs, 100)

        console.log("[v0] QRadar: fetched", offenses.length, "offenses")

        let synced = 0
        let errors = 0

        for (const off of offenses) {
          try {
            const externalId = off.id
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
              metadata: off,
              integrationId: integrationId,
            }

            await prisma.qRadarOffense.upsert({
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
                metadata: mapped.metadata,
                integrationId: mapped.integrationId,
              },
              create: mapped,
            })

            // NOTE: Related events are now fetched on-demand when user clicks Related Events tab
            // This improves alert panel loading performance and reduces unnecessary API calls

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

              const alertTimestamp = off.last_persisted_time ? new Date(off.last_persisted_time) : off.start_time ? new Date(off.start_time) : new Date()

              // Preserve manual status changes (e.g., In Progress/Closed) so QRadar sync doesn't downgrade them
              const existingAlert = await prisma.alert.findUnique({ where: { externalId: alertExternalId } })
              const mappedStatus = mapStatus(off.status)
              const statusToPersist = existingAlert
                ? (() => {
                    const current = existingAlert.status
                    const downgradeToNew = current === "In Progress" && mappedStatus === "New"
                    const reopenFromClosed = current === "Closed" && mappedStatus !== "Closed"
                    return downgradeToNew || reopenFromClosed ? current : mappedStatus
                  })()
                : mappedStatus

              // Merge existing QRadar metadata so local flags (e.g., follow_up, assignee) are not lost
              const mergedMetadata = (() => {
                const existingMetadata = (existingAlert?.metadata as any) || {}
                const existingQRadar = existingMetadata.qradar || {}
                return {
                  ...existingMetadata,
                  qradar: { ...existingQRadar, ...off },
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

        await prisma.integration.update({ where: { id: integrationId }, data: { lastSync: new Date() } })

        return NextResponse.json({ success: true, synced, total: offenses.length, errors })
      } catch (err) {
        console.error("[v0] QRadar sync error:", err)
        return NextResponse.json({ success: false, error: "Failed to sync QRadar offenses", details: err instanceof Error ? err.message : String(err) }, { status: 500 })
      }
    }

    // Stellar Cyber path (default, but now explicit check)
    if (source.includes("stellar-cyber") || source === "custom") {
      try {
        // Check if specific daysBack is requested (for historical syncs)
        const daysBackParam = request.headers.get("X-Days-Back")
        const daysBack = daysBackParam ? parseInt(daysBackParam, 10) : undefined
        
        // Use higher limit for syncing (Stellar Cyber API supports up to 10000)
        const alerts = await getAlerts({ integrationId, limit: 10000, daysBack })

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
          const mappedAlert = {
            externalId,
            title: a.title || "Unknown Alert",
            description: a.description || "",
            severity: String(a.severity || "0"),
            status: a.status || "New",
            timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
            integrationId: integrationId,
            metadata: a.metadata || {},
          }

          await prisma.alert.upsert({
            where: { externalId },
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
