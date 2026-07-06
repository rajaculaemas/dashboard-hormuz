import { NextRequest, NextResponse } from "next/server";
import { getUsersForShiftRecap, sendShiftRecapNotification } from "@/lib/services/shift-notification";

/**
 * GET /api/cron/shift-recap
 * Triggered by external cron service (e.g., EasyCron)
 * Sends shift recap notifications to users whose shift is about to end
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = request.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;

    if (!cronSecret || cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log(`[Shift Recap Cron] Starting at ${new Date().toISOString()}`);

    // Get users whose shift recap should be sent now
    const usersForRecap = await getUsersForShiftRecap();

    console.log(`[Shift Recap Cron] Found ${usersForRecap.length} users for shift recap`);

    const results: {
      userId: string;
      success: boolean;
      error?: string;
      notification?: any;
    }[] = [];

    // Send notifications to each user
    for (const { userId, shift, recapData } of usersForRecap) {
      try {
        const result = await sendShiftRecapNotification(userId, shift, recapData);
        results.push({
          userId,
          success: true,
          notification: result.notification.id,
        });
        console.log(
          `[Shift Recap Cron] ✅ Sent Shift ${shift} recap to user ${userId}`
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          userId,
          success: false,
          error: errorMessage,
        });
        console.error(
          `[Shift Recap Cron] ❌ Failed to send Shift recap to user ${userId}:`,
          errorMessage
        );
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      processed: results.length,
      results,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Shift Recap Cron] Fatal error:", errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
