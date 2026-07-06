import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth/session"
import { getUserAccessibleIntegrations } from "@/lib/auth/password"

/**
 * Global integration settings endpoint
 * PATCH (Update): Only ADMINISTRATOR can change global settings that apply to all users
 * GET (Read): All authenticated users can view settings
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const currentUser = await getCurrentUser()
    
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Only ADMINISTRATOR can update global settings
    if (currentUser.role !== "administrator") {
      return NextResponse.json(
        { success: false, error: "Only administrators can update global integration settings" }, 
        { status: 403 }
      )
    }

    // Get the integration first
    const integration = await prisma.integration.findUnique({
      where: { id },
    })

    if (!integration) {
      return NextResponse.json(
        { success: false, error: "Integration not found" },
        { status: 404 }
      )
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 }
      )
    }

    console.log(`[Integration Settings PATCH] Request body received:`, JSON.stringify(body))

    // Only allow specific settings to be updated via this endpoint
    const allowedSettings = ["auto_fetch_related_events"]
    const updateSettings: Record<string, any> = {}
    
    for (const key of allowedSettings) {
      if (key in body) {
        updateSettings[key] = body[key]
        console.log(`[Integration Settings PATCH] Setting ${key} = ${body[key]}`)
      }
    }

    console.log(`[Integration Settings PATCH] Update settings object:`, JSON.stringify(updateSettings))

    if (Object.keys(updateSettings).length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: `No valid settings provided. Allowed settings: ${allowedSettings.join(", ")}`
        },
        { status: 400 }
      )
    }

    // Merge with existing config (used for settings)
    const currentConfig = (integration.config as Record<string, any>) || {}
    const updatedConfig = {
      ...currentConfig,
      ...updateSettings,
    }

    console.log(`[Integration Settings PATCH] Current config:`, JSON.stringify(currentConfig))
    console.log(`[Integration Settings PATCH] Updated config (merged):`, JSON.stringify(updatedConfig))

    // Update the integration - applies globally to ALL users
    const updatedIntegration = await prisma.integration.update({
      where: { id },
      data: {
        config: updatedConfig,
      },
    })

    console.log(`[Integration Settings PATCH] Saved to DB. Final config:`, JSON.stringify(updatedIntegration.config))

    console.log(`[Integration Settings] ADMIN ${currentUser.userId} (${currentUser.email}) updated GLOBAL settings for integration ${id}:`, updateSettings)

    return NextResponse.json({
      success: true,
      message: "Global settings updated - applies to all users",
      data: {
        id: updatedIntegration.id,
        name: updatedIntegration.name,
        source: updatedIntegration.source,
        settings: updatedIntegration.config,
        updatedBy: currentUser.email,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("Error updating integration settings:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update integration settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint untuk melihat global settings
 * All authenticated users can view (read-only)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const currentUser = await getCurrentUser()
    
    if (!currentUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has access to this integration
    const accessibleIds = await getUserAccessibleIntegrations(currentUser.userId)
    const isAdmin = currentUser.role === "administrator"
    const canAccess = isAdmin || accessibleIds.includes(id)
    
    if (!canAccess) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const integration = await prisma.integration.findUnique({
      where: { id },
    })

    if (!integration) {
      return NextResponse.json(
        { success: false, error: "Integration not found" },
        { status: 404 }
      )
    }

    const credentials = (integration.credentials as Record<string, any>) || {}
    const settings = {
      auto_fetch_related_events: credentials.auto_fetch_related_events ?? true,
    }

    return NextResponse.json({
      success: true,
      data: {
        id: integration.id,
        name: integration.name,
        source: integration.source,
        settings,
      },
    })
  } catch (error) {
    console.error("Error fetching integration settings:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch integration settings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
