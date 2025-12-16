import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    console.log("Fetching timeline for case:", id)

    // First, check if it's a Case (could be QRadar or Stellar Cyber)
    const caseRecord = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        externalId: true,
        createdAt: true,
        createdBy: true,
        createdByName: true,
        modifiedAt: true,
        modifiedBy: true,
        modifiedByName: true,
        closedAt: true,
        acknowledgedAt: true,
        assigneeName: true,
        assignee: true,
        integration: {
          select: {
            source: true,
          },
        },
      },
    })

    if (caseRecord) {
      const source = caseRecord.integration?.source
      
      // For Stellar Cyber cases, use raw timeline data from API
      if (source === "stellar_cyber" || source?.includes("stellar")) {
        const events: any[] = []

        // Event 1: Case Created
        if (caseRecord.createdAt) {
          events.push({
            id: `${id}-created`,
            caseId: id,
            eventType: "created",
            description: "Case created",
            changedBy: caseRecord.createdByName || "System",
            changedByUser: null,
            timestamp: caseRecord.createdAt,
            createdAt: caseRecord.createdAt,
          })
        }

        // Event 2: Case Acknowledged (if applicable)
        if (caseRecord.acknowledgedAt) {
          events.push({
            id: `${id}-acknowledged`,
            caseId: id,
            eventType: "acknowledged",
            description: "Case acknowledged",
            changedBy: caseRecord.assigneeName || "System",
            changedByUser: null,
            timestamp: caseRecord.acknowledgedAt,
            createdAt: caseRecord.acknowledgedAt,
          })
        }

        // Event 3: Case Modified/Updated (if different from creation time)
        if (caseRecord.modifiedAt && caseRecord.modifiedAt > caseRecord.createdAt) {
          events.push({
            id: `${id}-modified`,
            caseId: id,
            eventType: "modified",
            description: "Case modified",
            changedBy: caseRecord.modifiedByName || "System",
            changedByUser: null,
            timestamp: caseRecord.modifiedAt,
            createdAt: caseRecord.modifiedAt,
          })
        }

        // Event 4: Case Closed (if applicable)
        if (caseRecord.closedAt) {
          events.push({
            id: `${id}-closed`,
            caseId: id,
            eventType: "closed",
            description: "Case closed",
            changedBy: caseRecord.modifiedByName || "System",
            changedByUser: null,
            timestamp: caseRecord.closedAt,
            createdAt: caseRecord.closedAt,
          })
        }

        return NextResponse.json({
          success: true,
          data: events,
        })
      } else {
        // For QRadar cases (stored in Case table)
        // Return basic timeline with created and modified events
        const creator = caseRecord.createdByName || caseRecord.assigneeName || caseRecord.assignee || "System"
        const modifier = caseRecord.modifiedByName || caseRecord.assigneeName || caseRecord.assignee || creator

        const events = [
          {
            id: `${id}-created`,
            caseId: id,
            eventType: "created",
            description: "Case created",
            changedBy: creator,
            changedByUser: null,
            timestamp: caseRecord.createdAt,
            createdAt: caseRecord.createdAt,
          },
          {
            id: `${id}-updated`,
            caseId: id,
            eventType: "updated",
            description: "Case updated",
            changedBy: modifier,
            changedByUser: null,
            timestamp: caseRecord.modifiedAt || caseRecord.createdAt,
            createdAt: caseRecord.modifiedAt || caseRecord.createdAt,
          },
        ]

        if (caseRecord.closedAt) {
          events.push({
            id: `${id}-closed`,
            caseId: id,
            eventType: "closed",
            description: "Case closed",
            changedBy: modifier,
            changedByUser: null,
            timestamp: caseRecord.closedAt,
            createdAt: caseRecord.closedAt,
          })
        }

        return NextResponse.json({
          success: true,
          data: events,
        })
      }
    }

    // Try to get timeline events for Wazuh case
    const timelineEvents = await prisma.wazuhCaseTimeline.findMany({
      where: {
        caseId: id,
      },
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    })

    // Check if it's a Wazuh case
    const wazuhCase = await prisma.wazuhCase.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        title: true,
      },
    })

    if (wazuhCase) {
      // If no timeline events, create default ones for Wazuh
      if (timelineEvents.length === 0) {
        // Create initial "Case Created" event
        const createdEvent = await prisma.wazuhCaseTimeline.create({
          data: {
            caseId: id,
            eventType: "created",
            description: `Case created`,
            changedBy: "System",
            timestamp: wazuhCase.createdAt,
          },
          include: {
            changedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })

        // If resolved, add resolution event
        if (wazuhCase.resolvedAt) {
          const resolvedEvent = await prisma.wazuhCaseTimeline.create({
            data: {
              caseId: id,
              eventType: "resolved",
              description: `Case resolved`,
              changedBy: "System",
              timestamp: wazuhCase.resolvedAt,
            },
            include: {
              changedByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          })

          return NextResponse.json({
            success: true,
            data: [createdEvent, resolvedEvent],
          })
        }

        return NextResponse.json({
          success: true,
          data: [createdEvent],
        })
      }

      return NextResponse.json({
        success: true,
        data: timelineEvents,
      })
    }

    // Check if it's an Alert (for QRadar alerts)
    const alert = await prisma.alert.findUnique({
      where: { id },
      select: {
        id: true,
        timestamp: true,
        updatedAt: true,
        status: true,
        metadata: true,
        assigneeId: true,
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (alert) {
      // Return basic timeline for Alert (created, updated, and potentially closed events)
      const metadata = (alert.metadata as any) || {}
      const assigneeName = alert.assignee?.name || metadata.assignee || metadata?.qradar?.assigned_to || "System"

      const events = [
        {
          id: `${id}-created`,
          caseId: id,
          eventType: "created",
          description: "Alert created",
          changedBy: assigneeName,
          changedByUser: alert.assignee || null,
          timestamp: alert.timestamp,
          createdAt: alert.timestamp,
        },
        {
          id: `${id}-updated`,
          caseId: id,
          eventType: "updated",
          description: "Alert updated",
          changedBy: assigneeName,
          changedByUser: alert.assignee || null,
          timestamp: alert.updatedAt || alert.timestamp,
          createdAt: alert.updatedAt || alert.timestamp,
        },
      ]

      if (alert.status === "Closed") {
        events.push({
          id: `${id}-closed`,
          caseId: id,
          eventType: "closed",
          description: "Alert closed",
          changedBy: "System",
          changedByUser: null,
          timestamp: alert.updatedAt || alert.timestamp,
          createdAt: alert.updatedAt || alert.timestamp,
        })
      }

      return NextResponse.json({
        success: true,
        data: events,
      })
    }

    // Case not found in any table
    return NextResponse.json({
      success: false,
      error: "Case not found",
    })
  } catch (error) {
    console.error("Error fetching case timeline:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch case timeline",
      },
      { status: 500 }
    )
  }
}
