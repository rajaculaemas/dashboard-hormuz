import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {
  getShiftPeriod,
  getShiftRecapStats,
  sendShiftRecapNotification,
  ShiftSchedule,
} from "@/lib/services/shift-notification";

type ShiftNumber = 1 | 2 | 3;

/**
 * POST /api/notifications/trigger-recap
 * Manually trigger a shift recap notification for the current user.
 * Body: { shift: 1 | 2 | 3 }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "administrator") {
      return NextResponse.json({ error: "Forbidden: administrator role required" }, { status: 403 });
    }

    const body = await request.json();
    const shift = body.shift as ShiftNumber;

    if (![1, 2, 3].includes(shift)) {
      return NextResponse.json(
        { error: "Invalid shift. Must be 1, 2, or 3." },
        { status: 400 }
      );
    }

    // Get global shift notification config
    const config = await prisma.shiftNotificationConfig.findUnique({
      where: { id: "global" },
    });

    if (!config) {
      return NextResponse.json({ error: "Global shift notification config not found" }, { status: 500 });
    }

    const timezone = config.timezone || "UTC";

    // Build schedule from global config
    const schedule: ShiftSchedule = {
      shift1Start: config.shiftStart1 || "07:00",
      shift1End:   config.shiftEnd1   || "15:00",
      shift2Start: config.shiftStart2 || "15:00",
      shift2End:   config.shiftEnd2   || "23:00",
      shift3Start: config.shiftStart3 || "23:00",
      shift3End:   config.shiftEnd3   || "07:00",
    };

    // Parse integration filter from global config
    let filterIds: string[] = [];
    if (config.filterIntegrationIds) {
      try {
        const parsed = JSON.parse(config.filterIntegrationIds);
        if (Array.isArray(parsed)) filterIds = parsed.filter((v: any) => typeof v === "string");
      } catch {
        filterIds = [];
      }
    }

    // Determine the period for the selected shift:
    // - If the shift has already started today (now >= start), use this occurrence
    //   (covers both: currently ongoing and already completed today)
    // - If the shift hasn't started yet today (now < start), fall back to yesterday's
    const now = new Date();

    let { start, end } = getShiftPeriod(now, shift, timezone, schedule);

    if (now < start) {
      // Shift hasn't started today yet — use yesterday's completed occurrence
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      ({ start, end } = getShiftPeriod(yesterday, shift, timezone, schedule));
    }

    const stats = await getShiftRecapStats(start, end, filterIds);

    const result = await sendShiftRecapNotification(user.userId, shift, {
      shift,
      period: { start, end },
      alertStats: stats,
      schedule,
      timezone,
    });

    return NextResponse.json({
      success: true,
      notificationId: result.notification.id,
      telegramSent: result.telegramSent ?? false,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      stats,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[trigger-recap]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
