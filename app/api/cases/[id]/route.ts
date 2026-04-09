import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { updateCaseInStellarCyber, getSingleCaseFromStellarCyber } from "@/lib/api/stellar-cyber-case"
import { updateSocfortressCaseStatus, getSocfortressCases } from "@/lib/api/socfortress"
import { getAssigneeName } from "@/lib/utils"
import { getCurrentUser } from "@/lib/auth/session"
import { hasPermission } from "@/lib/auth/password"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params

    console.log("Fetching case details for ID:", id)

    // Try to find as Case first
    let caseDetail: any = await prisma.case.findUnique({
      where: { id },
      include: {
        integration: {
          select: {
            id: true,
            name: true,
            source: true,
          },
        },
      },
    })

    // If not found as Case, try as WazuhCase
    if (!caseDetail) {
      const wazuhCase = await prisma.wazuhCase.findUnique({
        where: { id },
        include: {
          assignee: true,
        },
      })

      if (wazuhCase) {
        // Map WazuhCase to case-like structure
        // Map Wazuh database statuses to UI statuses
        let uiStatus = "New"
        if (wazuhCase.status === "in_progress") uiStatus = "In Progress"
        else if (wazuhCase.status === "resolved") uiStatus = "Resolved"

        caseDetail = {
          id: wazuhCase.id,
          externalId: wazuhCase.caseNumber || wazuhCase.id,
          ticketId: parseInt(wazuhCase.caseNumber) || 0,
          name: wazuhCase.title,
          description: wazuhCase.description,
          status: uiStatus,
          severity: wazuhCase.severity,
          assignee: wazuhCase.assigneeId,
          assigneeName: wazuhCase.assignee?.name,
          createdAt: wazuhCase.createdAt,
          modifiedAt: wazuhCase.updatedAt,
          acknowledgedAt: null,
          closedAt: wazuhCase.resolvedAt,
          integrationId: null,
          integration: { id: null, name: "Wazuh", source: "wazuh" },
          metadata: { wazuh: true },
          score: 0,
          size: wazuhCase.alertCount,
          tags: [],
          version: 1,
        }
      }
    }

    // If not found as Case or WazuhCase, try as Alert (for QRadar)
    if (!caseDetail) {
      const alert = await prisma.alert.findUnique({
        where: { id },
        include: {
          integration: {
            select: {
              id: true,
              name: true,
              source: true,
            },
          },
        },
      })

      if (alert) {
        // Map alert to case-like structure
        // For QRadar alerts, extract timing from metadata.qradar
        let createdAt = alert.timestamp || new Date()
        let closedAt = null

        if (alert.metadata?.qradar) {
          const qradar = alert.metadata.qradar as any
          // Use start_time for created timestamp
          if (qradar.start_time) {
            createdAt = new Date(qradar.start_time)
          }
          // Use close_time for closed timestamp (if exists and is valid)
          if (alert.status === "Closed" && qradar.close_time && qradar.close_time > 0) {
            closedAt = new Date(qradar.close_time)
          }
        } else {
          // For non-QRadar alerts, use status to determine closedAt
          closedAt = alert.status === "Closed" ? alert.timestamp : null
        }

        caseDetail = {
          id: alert.id,
          externalId: alert.externalId || alert.id,
          ticketId: null,
          name: alert.title,
          description: alert.description,
          status: alert.status,
          severity: alert.severity,
          assignee: alert.metadata?.assignee || alert.metadata?.qradar?.assigned_to || null,
          assigneeName: alert.metadata?.assignee || alert.metadata?.qradar?.assigned_to || null,
          createdAt: createdAt,
          modifiedAt: alert.updatedAt || createdAt,
          acknowledgedAt: null,
          closedAt: closedAt,
          integrationId: alert.integrationId,
          integration: alert.integration,
          metadata: alert.metadata,
          score: 0,
          size: 0,
          tags: [],
          version: 1,
        }
      }
    }

    // If not found anywhere yet, try SOCFortress as last resort
    // SOCFortress cases are stored in MySQL and fetched via getSocfortressCases
    if (!caseDetail) {
      console.log("Case not found in Prisma, trying SOCFortress...")
      
      // Try to find integrations with socfortress source
      const integrations = await prisma.integration.findMany({
        where: {
          source: {
            in: ["socfortress", "copilot"],
          },
        },
      })
      
      // Try to find the case in each SOCFortress integration
      for (const integration of integrations) {
        try {
          const result = await getSocfortressCases(integration.id, { limit: 500 })
          const foundCase = result.cases.find(
            (c: any) => c.externalId === id || String(c.ticketId) === id || String(c.id) === id
          )
          
          if (foundCase) {
            console.log(`Found SOCFortress case in integration ${integration.name}:`, foundCase.name)
            caseDetail = {
              id: foundCase.externalId,
              externalId: foundCase.externalId,
              ticketId: foundCase.ticketId,
              name: foundCase.name,
              description: foundCase.description,
              status: foundCase.status,
              severity: foundCase.severity,
              assignee: foundCase.metadata?.socfortress?.assigned_to || null,
              assigneeName: foundCase.metadata?.socfortress?.assigned_to || null,
              createdAt: foundCase.timestamp,
              updatedAt: foundCase.timestamp,
              acknowledgedAt: null,
              integrationId: foundCase.integrationId,
              integration: {
                id: foundCase.integrationId,
                name: integration.name,
                source: integration.source,
              },
              metadata: foundCase.metadata || {},
              alerts: foundCase.alerts || [],
              score: 0,
              size: foundCase.alerts?.length || 0,
              tags: [],
              version: 1,
            }
            break
          }
        } catch (error) {
          console.warn(`Error searching SOCFortress integration ${integration.name}:`, error)
          continue
        }
      }
    }

    if (!caseDetail) {
      return NextResponse.json({
        success: false,
        error: "Case not found",
      })
    }

    console.log("Found case/alert:", caseDetail.name)

    return NextResponse.json({
      success: true,
      data: caseDetail,
    })
  } catch (error) {
    console.error("Error fetching case details:", error)
    return NextResponse.json({
      success: false,
      error: "Failed to fetch case details",
    })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    if (!hasPermission(user.role, 'update_case')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to update cases" }, { status: 403 })
    }
    
    const { id } = await params
    const body = await request.json()
    const { status, severity, assignee, comment, integrationSource } = body

    console.log("Updating case:", id, { status, severity, assignee, comment, integrationSource })

    // Check if it's a Wazuh case update
    if (integrationSource === "wazuh") {
      const wazuhCase = await prisma.wazuhCase.findUnique({
        where: { id },
        include: {
          assignee: true,
        },
      })

      if (!wazuhCase) {
        console.error("WazuhCase not found:", id)
        return NextResponse.json(
          {
            success: false,
            error: "Wazuh case not found",
          },
          { status: 404 },
        )
      }

      // Map UI statuses to Wazuh database statuses
      let wazuhStatus = wazuhCase.status
      if (status === "New") wazuhStatus = "open"
      else if (status === "In Progress") wazuhStatus = "in_progress"
      else if (status === "Resolved") wazuhStatus = "resolved"

      // Find assignee ID if assignee name provided
      let assigneeId = wazuhCase.assigneeId
      if (assignee && assignee !== wazuhCase.assignee?.name) {
        // Look up user by name
        const user = await prisma.user.findFirst({
          where: {
            name: {
              equals: assignee,
              mode: "insensitive",
            },
          },
        })
        if (user) {
          assigneeId = user.id
        }
      }

      // Update Wazuh case
      const updatedWazuhCase = await prisma.wazuhCase.update({
        where: { id },
        data: {
          ...(wazuhStatus && { status: wazuhStatus }),
          ...(severity && { severity }),
          ...(assigneeId && { assigneeId }),
        },
        include: {
          assignee: true,
        },
      })

      console.log("Wazuh case updated successfully:", updatedWazuhCase.title)

      // Record timeline events for changes
      const timelineEvents = []

      // Use consistent timestamp for all events in this case update
      const eventTimestamp = new Date()

      // Status change
      if (wazuhStatus && wazuhStatus !== wazuhCase.status) {
        const statusMap: Record<string, string> = {
          open: "New",
          in_progress: "In Progress",
          resolved: "Resolved",
        }
        timelineEvents.push({
          caseId: id,
          eventType: "status_change",
          description: `Status changed from "${statusMap[wazuhCase.status] || wazuhCase.status}" to "${statusMap[wazuhStatus] || wazuhStatus}"`,
          oldValue: wazuhCase.status,
          newValue: wazuhStatus,
          changedBy: assignee || "System",
          changedByUserId: assigneeId,
          timestamp: eventTimestamp,
        })
      }

      // Severity change
      if (severity && severity !== wazuhCase.severity) {
        timelineEvents.push({
          caseId: id,
          eventType: "severity_change",
          description: `Severity changed from "${wazuhCase.severity || "Not Set"}" to "${severity}"`,
          oldValue: wazuhCase.severity,
          newValue: severity,
          changedBy: assignee || "System",
          changedByUserId: assigneeId,
          timestamp: eventTimestamp,
        })
      }

      // Assignee change
      if (assigneeId && assigneeId !== wazuhCase.assigneeId) {
        const oldAssignee = wazuhCase.assignee?.name || "Unassigned"
        const newAssignee = updatedWazuhCase.assignee?.name || "Unassigned"
        timelineEvents.push({
          caseId: id,
          eventType: "assignee_change",
          description: `Assignee changed from "${oldAssignee}" to "${newAssignee}"`,
          oldValue: wazuhCase.assigneeId || "unassigned",
          newValue: assigneeId,
          changedBy: newAssignee,
          changedByUserId: assigneeId,
          timestamp: eventTimestamp,
        })
      }

      // Save all timeline events
      if (timelineEvents.length > 0) {
        await Promise.all(
          timelineEvents.map((event) =>
            prisma.wazuhCaseTimeline.create({
              data: event,
            }),
          ),
        )
        console.log(`Recorded ${timelineEvents.length} timeline events`)
      }

      return NextResponse.json({
        success: true,
        data: updatedWazuhCase,
      })
    }

    // Check if it's a SOCFortress case update
    if (integrationSource === "socfortress" || integrationSource === "copilot") {
      let socfortressCase = await prisma.case.findUnique({
        where: { id },
        include: {
          integration: true,
        },
      })

      // If not found locally, search in SOCFortress MySQL
      if (!socfortressCase) {
        console.log("Case not found in local database, searching SOCFortress MySQL...")
        
        const integrations = await prisma.integration.findMany({
          where: {
            source: {
              in: ["socfortress", "copilot"],
            },
          },
        })
        
        for (const integration of integrations) {
          try {
            const result = await getSocfortressCases(integration.id, { limit: 500 })
            const foundCase = result.cases.find(
              (c: any) => c.externalId === id || String(c.ticketId) === id || String(c.id) === id
            )
            
            if (foundCase) {
              console.log(`Found SOCFortress case in integration ${integration.name}: ${foundCase.name}`)
              socfortressCase = {
                id: foundCase.externalId,
                externalId: foundCase.externalId,
                ticketId: foundCase.ticketId,
                name: foundCase.name,
                description: foundCase.description,
                status: foundCase.status,
                severity: foundCase.severity,
                assignee: foundCase.metadata?.socfortress?.assigned_to || null,
                integrationId: foundCase.integrationId,
                integration: {
                  id: foundCase.integrationId,
                  name: integration.name,
                  source: integration.source,
                },
                metadata: foundCase.metadata || {},
              } as any
              break
            }
          } catch (error) {
            console.warn(`Error searching SOCFortress integration ${integration.name}:`, error)
            continue
          }
        }
      }

      if (!socfortressCase) {
        console.error("SOCFortress case not found:", id)
        return NextResponse.json(
          {
            success: false,
            error: "SOCFortress case not found",
          },
          { status: 404 },
        )
      }

      // Update case in SOCFortress MySQL
      try {
        await updateSocfortressCaseStatus(
          socfortressCase.integrationId,
          socfortressCase.externalId || String(socfortressCase.ticketId),
          status,
          {
            assignedTo: assignee,
            comments: comment,
            severity: severity,
          },
        )

        console.log("Successfully updated case in SOCFortress")
      } catch (error) {
        console.error("Error updating case in SOCFortress:", error)
        return NextResponse.json(
          {
            success: false,
            error: "Failed to update case in SOCFortress: " + (error instanceof Error ? error.message : String(error)),
          },
          { status: 500 },
        )
      }

      // Try to update local cache if case exists
      let updatedCase = null
      try {
        const existingCase = await prisma.case.findUnique({ where: { id } })
        if (existingCase) {
          updatedCase = await prisma.case.update({
            where: { id },
            data: {
              status,
              severity,
              assignee,
              modifiedAt: new Date(),
            },
            include: {
              integration: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          })
          console.log("SOCFortress case updated in local database:", updatedCase.name)
        }
      } catch (error) {
        console.warn("Could not update case in local database:", error)
      }

      // Return the updated case data (prioritize local if available, otherwise return from SOCFortress)
      const responseData = updatedCase || socfortressCase
      return NextResponse.json({
        success: true,
        data: responseData,
      })
    }

    // Get current case data to track changes (for non-Wazuh cases)
    const currentCase = await prisma.case.findUnique({
      where: { id },
    })

    if (!currentCase) {
      return NextResponse.json(
        {
          success: false,
          error: "Case not found",
        },
        { status: 404 },
      )
    }

    // Update case in database
    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        status,
        severity,
        assignee,
        modifiedAt: new Date(),
      },
      include: {
        integration: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    console.log("Case updated successfully:", updatedCase.name)

    // Create comment entry for the update
    const changes = []
    if (status && status !== currentCase.status) {
      changes.push(`Status changed from "${currentCase.status}" to "${status}"`)
    }
    if (severity && severity !== currentCase.severity) {
      changes.push(`Severity changed from "${currentCase.severity}" to "${severity}"`)
    }
    if (assignee && assignee !== currentCase.assignee) {
      changes.push(`Assignee changed from "${currentCase.assignee || "Unassigned"}" to "${assignee}"`)
    }

    // Create the comment content
    let commentContent = ""
    if (changes.length > 0) {
      commentContent = changes.join(", ")
    }
    if (comment && comment.trim()) {
      if (commentContent) {
        commentContent += `\n\nComment: ${comment.trim()}`
      } else {
        commentContent = comment.trim()
      }
    }

    // Save comment to database if there are changes or user comment
    if (commentContent) {
      await prisma.caseComment.create({
        data: {
          content: commentContent,
          author: assignee || "system", // Use assignee as author, fallback to system
          caseId: id,
          createdAt: new Date(),
        },
      })
      console.log("Comment saved:", commentContent)
    }

    // Update case in Stellar Cyber
    try {
      const stellarResult = await updateCaseInStellarCyber({
        caseId: updatedCase.externalId, // Use external ID for Stellar Cyber
        integrationId: updatedCase.integrationId,
        userId: user.id,  // Pass user ID to use user's API key
        updates: {
          status,
          severity,
          assignee,
        },
      })

      console.log("Stellar Cyber update result:", stellarResult)

      if (!stellarResult.success) {
        console.warn("Failed to update case in Stellar Cyber:", stellarResult.message || "Unknown error")
      } else {
        console.log("Successfully updated case in Stellar Cyber")

        // Fetch the latest case data from Stellar Cyber to sync back to database
        try {
          console.log("Fetching latest case data from Stellar Cyber...")
          const latestCaseResult = await getSingleCaseFromStellarCyber({
            caseId: updatedCase.externalId,
            integrationId: updatedCase.integrationId,
          })

          if (latestCaseResult.success && latestCaseResult.data) {
            const stellarCaseData = latestCaseResult.data.data || latestCaseResult.data
            console.log("Latest case from Stellar Cyber:", {
              status: stellarCaseData.status,
              assignee: stellarCaseData.assignee,
              assignee_name: stellarCaseData.assignee_name,
              severity: stellarCaseData.severity,
            })

            // Update database with latest data from Stellar Cyber
            const syncedCase = await prisma.case.update({
              where: { id: updatedCase.id },
              data: {
                status: stellarCaseData.status || updatedCase.status,
                severity: stellarCaseData.severity || updatedCase.severity,
                assignee: stellarCaseData.assignee || updatedCase.assignee,
                // Prefer assignee_name from Stellar Cyber if valid
                assigneeName:
                  stellarCaseData.assignee_name && stellarCaseData.assignee_name.trim() && stellarCaseData.assignee_name !== "Unassigned"
                    ? stellarCaseData.assignee_name
                    : updatedCase.assigneeName,
                modifiedAt: new Date(),
                metadata: stellarCaseData,
              },
            })

            console.log("Database synced with Stellar Cyber data:", {
              status: syncedCase.status,
              assignee: syncedCase.assignee,
              assigneeName: syncedCase.assigneeName,
            })

            // Return synced case data to client
            return NextResponse.json({
              success: true,
              data: syncedCase,
            })
          }
        } catch (syncError) {
          console.error("Error syncing case data from Stellar Cyber:", syncError)
          // Continue - return the update that was already done locally
        }
      }
    } catch (error) {
      console.error("Error updating case in Stellar Cyber:", error)
      // Continue even if Stellar Cyber update fails
    }

    return NextResponse.json({
      success: true,
      data: updatedCase,
    })
  } catch (error) {
    console.error("Error updating case:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update case",
      },
      { status: 500 },
    )
  }
}
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    if (!hasPermission(user.role, 'update_case')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to update cases" }, { status: 403 })
    }
    
    const { id } = await params
    const body = await request.json()
    const { status, severity, assignedTo, comments } = body

    if (!id || !status) {
      return NextResponse.json({ error: "Missing required fields: id or status" }, { status: 400 })
    }

    // Validate status
    const validStatuses = ["New", "In Progress", "Closed"]
    if (!validStatuses.includes(status as string)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      )
    }

    // Find case in database
    const caseRecord = await prisma.case.findUnique({
      where: { id },
      include: {
        integration: true,
      },
    })

    if (!caseRecord) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 })
    }

    // Update case in Prisma
    const metadata = (caseRecord.metadata as any) || {}
    const updatedMetadata = {
      ...metadata,
      ...(assignedTo && { socfortress: { ...metadata.socfortress, assigned_to: assignedTo } }),
      ...(comments && {
        comment: [
          {
            comment_user: user.name || user.email || "system",
            comment_time: new Date().toISOString(),
            comment: comments,
          },
        ],
      }),
    }

    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        status,
        ...(severity && { severity }),
        modifiedAt: new Date(),
        metadata: updatedMetadata,
      },
      include: {
        integration: true,
      },
    })

    console.log(`[PATCH /api/cases/[id]] Case ${id} updated: status=${status}, severity=${severity}`)

    // Record timeline events
    const timelineEvents: any[] = []

    if (caseRecord.status !== status) {
      timelineEvents.push({
        caseId: id,
        eventType: "status_change",
        description: `Status changed from "${caseRecord.status}" to "${status}"`,
        oldValue: caseRecord.status,
        newValue: status,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    }

    if (severity && caseRecord.severity !== severity) {
      timelineEvents.push({
        caseId: id,
        eventType: "severity_change",
        description: `Severity changed from "${caseRecord.severity || "Not Set"}" to "${severity}"`,
        oldValue: caseRecord.severity || "",
        newValue: severity,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    }

    if (assignedTo) {
      timelineEvents.push({
        caseId: id,
        eventType: "assignment_change",
        description: `Assigned to ${assignedTo}`,
        oldValue: caseRecord.metadata?.socfortress?.assigned_to || "unassigned",
        newValue: assignedTo,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    }

    if (comments) {
      timelineEvents.push({
        caseId: id,
        eventType: "comment",
        description: comments,
        changedBy: user.name || user.email || "System",
        changedByUserId: user.id,
        timestamp: new Date(),
      })
    }

    if (timelineEvents.length > 0) {
      await prisma.caseTimeline.createMany({ data: timelineEvents })
    }

    // If SOCFortress case, update in MySQL as well
    if (caseRecord.integration?.source === "socfortress" || caseRecord.integration?.source === "copilot") {
      try {
        console.log(`[PATCH] Updating SOCFortress case ${caseRecord.externalId}...`)

        // Map UI status to SOCFortress status format
        const statusMap: Record<string, string> = {
          "New": "OPEN",
          "In Progress": "IN_PROGRESS",
          "Closed": "CLOSED",
        }

        const socfortressStatus = statusMap[status as string] || (status as string)

        // Update in SOCFortress MySQL
        await updateSocfortressCaseStatus(
          caseRecord.integrationId,
          caseRecord.externalId,
          socfortressStatus,
          {
            assignedTo,
            comments,
            severity,
          }
        )

        console.log(`[PATCH] Updated SOCFortress case ${caseRecord.externalId} in MySQL`)
      } catch (error) {
        console.error("Error updating case status in SOCFortress:", error)
        // Continue even if update in SOCFortress fails
      }
    }

    return NextResponse.json({
      success: true,
      message: "Case updated successfully",
      data: updatedCase,
    })
  } catch (error) {
    console.error("Error in PATCH /api/cases/[id]:", error)
    return NextResponse.json({ error: "Failed to update case" }, { status: 500 })
  }
}