import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

/** Return the first administrator's userId, or null. */
async function getAdminUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: "administrator" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return admin?.id ?? null;
}

/**
 * GET /api/notifications
 * All users see the global (admin's) notifications.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const unreadOnly = searchParams.get("unread_only") === "true";

    const skip = (page - 1) * limit;

    // Non-admins read from the admin's notification pool
    const adminId = await getAdminUserId();
    const targetUserId = (user.role === "administrator" || !adminId)
      ? user.userId
      : adminId;

    const where: any = { userId: targetUserId };
    if (unreadOnly) where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[Notifications GET]", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 * Bulk update notifications (e.g., mark as read)
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationIds, isRead } = body;

    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return NextResponse.json(
        { error: "notificationIds required" },
        { status: 400 }
      );
    }

    // Allow any authenticated user to mark admin notifications as read
    const updated = await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
      },
      data: {
        isRead: isRead ?? true,
        readAt: isRead ? new Date() : null,
      },
    });

    return NextResponse.json({
      success: true,
      updated: updated.count,
    });
  } catch (error) {
    console.error("[Notifications PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/notifications
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
