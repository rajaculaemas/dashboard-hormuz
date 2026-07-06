import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

/**
 * DELETE /api/notifications/[notificationId]
 * Delete a specific notification
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { notificationId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "administrator") {
      return NextResponse.json({ error: "Forbidden: administrator role required" }, { status: 403 });
    }

    const { notificationId } = params;

    // Admin can delete any notification
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    // Delete notification
    await prisma.notification.delete({
      where: { id: notificationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return NextResponse.json(
      { error: "Failed to delete notification" },
      { status: 500 }
    );
  }
}
