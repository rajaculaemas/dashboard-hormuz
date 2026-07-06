import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

/** Default config values used when no global config exists yet. */
const DEFAULT_CONFIG = {
  id: "global",
  shiftStart1: "07:00", shiftEnd1: "15:00",
  shiftStart2: "15:00", shiftEnd2: "23:00",
  shiftStart3: "23:00", shiftEnd3: "07:00",
  notificationMinutes: 15,
  enableInApp: true,
  enableTelegram: false,
  telegramChatIdForNotifications: null,
  timezone: "UTC",
  filterIntegrationIds: "[]",
};

/**
 * GET /api/notifications/shift-config
 * Returns the global shift notification config.
 * All authenticated users can read this.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let config = await prisma.shiftNotificationConfig.findUnique({
      where: { id: "global" },
    });

    // Auto-create global config if missing
    if (!config) {
      config = await prisma.shiftNotificationConfig.create({
        data: DEFAULT_CONFIG,
      });
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("[Shift Config GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch shift config" }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications/shift-config
 * Update the global shift notification config. Administrator only.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "administrator") {
      return NextResponse.json({ error: "Forbidden: administrator role required" }, { status: 403 });
    }

    const body = await request.json();
    const {
      shiftStart1,
      shiftEnd1,
      shiftStart2,
      shiftEnd2,
      shiftStart3,
      shiftEnd3,
      notificationMinutes,
      enableInApp,
      enableTelegram,
      telegramChatIdForNotifications,
      timezone,
      filterIntegrationIds,
    } = body;

    // Validate and serialise filterIntegrationIds
    let serialisedFilterIds: string | undefined;
    if (filterIntegrationIds !== undefined) {
      if (!Array.isArray(filterIntegrationIds)) {
        return NextResponse.json(
          { error: "filterIntegrationIds must be an array" },
          { status: 400 }
        );
      }
      serialisedFilterIds = JSON.stringify(filterIntegrationIds);
    }

    // Validate time format (HH:mm)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    const times = [
      shiftStart1,
      shiftEnd1,
      shiftStart2,
      shiftEnd2,
      shiftStart3,
      shiftEnd3,
    ];

    for (const time of times) {
      if (time && !timeRegex.test(time)) {
        return NextResponse.json(
          { error: `Invalid time format: ${time}. Use HH:mm format.` },
          { status: 400 }
        );
      }
    }

    // Check if custom telegram chat ID is provided when enabling telegram
    if (enableTelegram && !telegramChatIdForNotifications) {
      return NextResponse.json(
        { error: "Telegram Chat ID required when enabling Telegram notifications" },
        { status: 400 }
      );
    }

    // Get or create global config
    let config = await prisma.shiftNotificationConfig.findUnique({
      where: { id: "global" },
    });

    if (!config) {
      config = await prisma.shiftNotificationConfig.create({
        data: {
          id: "global",
          shiftStart1: shiftStart1 || "07:00",
          shiftEnd1: shiftEnd1 || "15:00",
          shiftStart2: shiftStart2 || "15:00",
          shiftEnd2: shiftEnd2 || "23:00",
          shiftStart3: shiftStart3 || "23:00",
          shiftEnd3: shiftEnd3 || "07:00",
          notificationMinutes: notificationMinutes ?? 15,
          enableInApp: enableInApp ?? true,
          enableTelegram: enableTelegram ?? false,
          telegramChatIdForNotifications: telegramChatIdForNotifications || null,
          timezone: timezone || "UTC",
          filterIntegrationIds: serialisedFilterIds ?? "[]",
        },
      });
    } else {
      config = await prisma.shiftNotificationConfig.update({
        where: { id: "global" },
        data: {
          ...(shiftStart1 && { shiftStart1 }),
          ...(shiftEnd1 && { shiftEnd1 }),
          ...(shiftStart2 && { shiftStart2 }),
          ...(shiftEnd2 && { shiftEnd2 }),
          ...(shiftStart3 && { shiftStart3 }),
          ...(shiftEnd3 && { shiftEnd3 }),
          ...(notificationMinutes !== undefined && { notificationMinutes }),
          ...(enableInApp !== undefined && { enableInApp }),
          ...(enableTelegram !== undefined && { enableTelegram }),
          ...(telegramChatIdForNotifications !== undefined && { telegramChatIdForNotifications }),
          ...(timezone && { timezone }),
          ...(serialisedFilterIds !== undefined && { filterIntegrationIds: serialisedFilterIds }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("[Shift Config PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update shift config" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/notifications/shift-config
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    }
  );
}
