import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { QRadarClient } from "@/lib/api/qradar"

export async function GET(request: NextRequest, { params }: { params: { offenseId: string } }) {
  try {
    const offenseId = Number((await params).offenseId)
    const integrationId = request.nextUrl.searchParams.get("integrationId")
    const forceRefresh = request.nextUrl.searchParams.get("forceRefresh") === "true"

    if (isNaN(offenseId)) {
      return NextResponse.json(
        { success: false, error: "Invalid offenseId" },
        { status: 400 },
      )
    }

    if (!integrationId) {
      return NextResponse.json(
        { success: false, error: "Missing integrationId" },
        { status: 400 },
      )
    }

    console.debug(`[QRadar Notes] Fetching notes for offense ${offenseId}`)

    const existingOffense = await prisma.qRadarOffense.findFirst({
      where: { externalId: offenseId, integrationId },
      select: { id: true, metadata: true },
    })

    const offenseMeta = (existingOffense?.metadata as any) || {}
    const cachedNotes = Array.isArray(offenseMeta.notes) ? offenseMeta.notes : []

    if (!forceRefresh && cachedNotes.length > 0) {
      return NextResponse.json({
        success: true,
        notes: cachedNotes,
        source: "local-cache",
      })
    }

    // Fallback: check alerts.metadata.qradar.notes if qradar_offenses has no cached notes
    if (!forceRefresh) {
      const alertExternalId = `qradar-${integrationId}-${offenseId}`
      const alertRecord = await prisma.alert.findUnique({
        where: { externalId: alertExternalId },
        select: { metadata: true },
      })
      const alertMeta = (alertRecord?.metadata as any) || {}
      const alertQradarNotes = alertMeta?.qradar?.notes
      if (Array.isArray(alertQradarNotes) && alertQradarNotes.length > 0) {
        return NextResponse.json({
          success: true,
          notes: alertQradarNotes,
          source: "alert-cache",
        })
      }
    }

    // Get integration and credentials
    const integration = await prisma.integration.findUnique({
      where: { id: integrationId },
    })

    if (!integration || !integration.source?.toLowerCase().includes("qradar")) {
      return NextResponse.json(
        { success: false, error: "Integration not found or not QRadar" },
        { status: 404 },
      )
    }

    const creds = integration.credentials as any
    const host = creds.host || creds.HOST
    const apiKey = creds.api_key || creds.apiKey
    const domainId = creds.domain_id ? Number(creds.domain_id) : undefined

    if (!host || !apiKey) {
      return NextResponse.json(
        { success: false, error: "Missing QRadar credentials" },
        { status: 400 },
      )
    }

    const qradarClient = new QRadarClient({ host, api_key: apiKey, domain_id: domainId })
    const notes = await qradarClient.getOffenseNotes(offenseId)
    const syncTimestamp = new Date().toISOString()

    if (existingOffense) {
      try {
        // Use transaction to atomically update both tables
        await prisma.$transaction(async (tx) => {
          // 1. Update QRadarOffense (primary cache)
          await tx.qRadarOffense.update({
            where: { id: existingOffense.id },
            data: {
              metadata: {
                ...offenseMeta,
                notes,
                notesLastSyncedAt: syncTimestamp,
              },
            },
          })
          console.debug(`[QRadar Notes] Updated QRadarOffense ${existingOffense.id} with ${notes.length} notes`)

          // 2. Update Alert.metadata.qradar.notes (secondary cache for alert table display)
          const alertExternalId = `qradar-${integrationId}-${offenseId}`
          const alertRecord = await tx.alert.findUnique({
            where: { externalId: alertExternalId },
            select: { id: true, metadata: true },
          })
          
          if (alertRecord) {
            const alertMeta = (alertRecord.metadata as any) || {}
            const qradarMeta = alertMeta.qradar || {}
            
            await tx.alert.update({
              where: { id: alertRecord.id },
              data: {
                metadata: {
                  ...alertMeta,
                  qradar: {
                    ...qradarMeta,
                    notes,
                    notesLastSyncedAt: syncTimestamp,
                  },
                },
              },
            })
            console.debug(`[QRadar Notes] Updated Alert ${alertRecord.id} metadata with ${notes.length} notes`)
          } else {
            console.warn(`[QRadar Notes] Alert record not found for externalId: ${alertExternalId}`)
          }
        })
      } catch (err: any) {
        console.error(
          `[QRadar Notes] Transaction failed to update both tables - Offense: ${offenseId}, Error: ${err.message}`,
          err
        )
        // Still return success for notes fetch even if cache update fails
        // The data came from API, just cache update failed
      }
    } else {
      console.warn(
        `[QRadar Notes] No existing QRadarOffense found for offenseId: ${offenseId}, integrationId: ${integrationId}`
      )
    }

    console.debug(`[QRadar Notes] Fetched ${notes.length} notes for offense ${offenseId}`)

    return NextResponse.json({
      success: true,
      notes,
      source: "qradar",
    })
  } catch (error: any) {
    console.error("[QRadar Notes] Error:", error.message)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch notes",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
