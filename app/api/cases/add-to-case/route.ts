import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { createCaseInStellarCyber } from "@/lib/api/stellar-cyber-case"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      alertIds = [],  // Changed to support multiple alerts
      name,
      description,
      severity,
      status,
      assignee,
      comment,
      integrationId,
    } = body

    // Support both single alertId and multiple alertIds
    const idsToProcess = Array.isArray(alertIds) && alertIds.length > 0 
      ? alertIds 
      : body.alertId 
        ? [body.alertId]
        : []

    if (idsToProcess.length === 0) {
      return NextResponse.json(
        { success: false, error: "No alert IDs provided" },
        { status: 400 },
      )
    }

    console.log("[add-to-case] Creating case from alerts:", {
      alertCount: idsToProcess.length,
      name,
      integrationId,
    })

    // Fetch all alerts from database
    const alerts = await prisma.alert.findMany({
      where: {
        id: { in: idsToProcess },
      },
    })

    if (alerts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No alerts found" },
        { status: 404 },
      )
    }

    console.log("[add-to-case] Alerts found:", alerts.length)

    // Extract _index and cust_id from alerts metadata
    const alertsForCase = alerts.map((alert) => {
      const metadata = (alert.metadata as any) || {}
      const _index = metadata.alert_index || metadata.index || ""
      const cust_id = metadata.cust_id || ""

      if (!_index) {
        throw new Error(`Alert ${alert.id} missing index (_index) in metadata`)
      }

      return {
        _id: alert.externalId,
        _index,
        cust_id,
      }
    })

    // Get first alert for default case name and severity
    const firstAlert = alerts[0]
    const metadata = (firstAlert.metadata as any) || {}
    const cust_id = metadata.cust_id || ""

    console.log("[add-to-case] Extracted metadata from alerts")

    // Create case in Stellar Cyber
    const stellarResponse = await createCaseInStellarCyber({
      name: name || `Case for ${firstAlert.title}`,
      alerts: alertsForCase.map((a) => ({
        _id: a._id,
        _index: a._index,
      })),
      cust_id,
      severity: severity || firstAlert.severity,
      status: status || "New",
      assignee: assignee || "",
      tags: [],
      comment: comment || `Created from ${alerts.length} alert(s)`,
      integrationId,
    })

    console.log("[add-to-case] Stellar Cyber response:", stellarResponse)

    if (!stellarResponse.success) {
      return NextResponse.json(
        { success: false, error: "Failed to create case in Stellar Cyber", details: stellarResponse },
        { status: 500 },
      )
    }

    // Extract case data from Stellar Cyber response
    const caseData = stellarResponse.data
    const externalCaseId = caseData._id || caseData.id

    if (!externalCaseId) {
      return NextResponse.json(
        { success: false, error: "No case ID returned from Stellar Cyber" },
        { status: 500 },
      )
    }

    // Generate unique ticket ID for local tracking
    const ticketId = Math.floor(Math.random() * 1000000000)

    // Save case to local database
    const localCase = await prisma.case.create({
      data: {
        externalId: externalCaseId,
        name: caseData.name || name || `Case for ${firstAlert.title}`,
        status: caseData.status || status || "New",
        severity: caseData.severity || severity || firstAlert.severity,
        description: caseData.description || description || "",
        assignee: caseData.assignee || assignee || null,
        assigneeName: caseData.assignee_name || null,
        ticketId,
        integrationId,
        metadata: caseData,
      },
      include: {
        integration: true,
      },
    })

    console.log("[add-to-case] Case created locally:", localCase)

    // Create relationships between all alerts and the case
    for (const alert of alerts) {
      await prisma.caseAlert.create({
        data: {
          caseId: localCase.id,
          alertId: alert.id,
        },
      })
    }

    console.log("[add-to-case] Alert-Case relationships created for", alerts.length, "alerts")

    return NextResponse.json({
      success: true,
      data: localCase,
      message: `Case created successfully and linked to ${alerts.length} alert(s)`,
      alertCount: alerts.length,
    })
  } catch (error) {
    console.error("[add-to-case] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create case",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
