"use client";

import React, { useState, useEffect } from "react";
import { Bell, Check, X, RefreshCw, Settings, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShiftNotificationConfig } from "@/components/notification/shift-notification-config";

interface Notification {
  id: string;
  title: string;
  content: string;
  notificationType: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
  telegramSent?: boolean;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showTrigger, setShowTrigger] = useState(false);
  const [triggerShift, setTriggerShift] = useState<1 | 2 | 3>(1);
  const [triggering, setTriggering] = useState(false);
  const [page, setPage] = useState(1);
  const [isAdmin, setIsAdmin] = useState(false);
  const [shiftLabels, setShiftLabels] = useState<{ [k in 1 | 2 | 3]: string }>({
    1: "07:00–15:00",
    2: "15:00–23:00",
    3: "23:00–07:00",
  });
  const { toast } = useToast();

  const fetchNotifications = async (pageNum = 1) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/notifications?page=${pageNum}&limit=20`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch notifications");

      const result = await res.json();
      setNotifications(result.data || []);
      setUnreadCount(result.data?.filter((n: Notification) => !n.isRead).length || 0);
      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      toast({
        title: "Error",
        description: "Failed to load notifications",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Fetch current user's role
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.user?.role === "administrator") setIsAdmin(true); })
      .catch(() => {});
    // Fetch shift schedule so trigger dialog shows configured times
    fetch("/api/notifications/shift-config", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((res) => {
        const cfg = res?.data;
        if (cfg?.shiftStart1) {
          setShiftLabels({
            1: `${cfg.shiftStart1}–${cfg.shiftEnd1}`,
            2: `${cfg.shiftStart2}–${cfg.shiftEnd2}`,
            3: `${cfg.shiftStart3}–${cfg.shiftEnd3}`,
          });
        }
      })
      .catch(() => {/* keep defaults */});
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationIds: [notificationId],
          isRead: true,
        }),
      });

      if (!res.ok) throw new Error("Failed to mark as read");

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications
        .filter((n) => !n.isRead)
        .map((n) => n.id);

      if (unreadIds.length === 0) return;

      const res = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationIds: unreadIds,
          isRead: true,
        }),
      });

      if (!res.ok) throw new Error("Failed to mark all as read");

      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);

      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update notifications",
        variant: "destructive",
      });
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to delete");

      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete notification",
        variant: "destructive",
      });
    }
  };

  const triggerRecap = async () => {
    try {
      setTriggering(true);
      const res = await fetch("/api/notifications/trigger-recap", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift: triggerShift }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Failed to trigger recap");

      toast({
        title: `Shift ${triggerShift} Recap Sent`,
        description: result.telegramSent
          ? "Notification created and sent to Telegram."
          : "Notification created (Telegram not sent — check settings).",
      });

      setShowTrigger(false);
      await fetchNotifications();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to trigger recap",
        variant: "destructive",
      });
    } finally {
      setTriggering(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "shift_recap":
        return "📊";
      case "alert":
        return "🚨";
      case "escalation":
        return "⬆️";
      default:
        return "📬";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-8 w-8" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your notifications and preferences
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button onClick={markAllAsRead} variant="outline">
              Mark all read
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setShowTrigger(true)} variant="outline">
              <Play className="h-4 w-4 mr-2" />
              Trigger Recap
            </Button>
          )}
          <Button onClick={() => setShowSettings(true)} variant="secondary">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">
              Total Notifications
            </div>
            <div className="text-3xl font-bold mt-2">{notifications.length}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">
              Unread
            </div>
            <div className="text-3xl font-bold mt-2 text-yellow-600">
              {unreadCount}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm font-medium text-muted-foreground">
              Read
            </div>
            <div className="text-3xl font-bold mt-2 text-green-600">
              {notifications.length - unreadCount}
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="font-semibold">All Notifications</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-muted/50 transition-colors ${
                    !notification.isRead ? "bg-blue-50 dark:bg-blue-950/20" : ""
                  }`}
                >
                  <div className="flex gap-4 items-start">
                    <span className="text-2xl">{getNotificationIcon(notification.notificationType)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium">{notification.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                            {notification.content}
                          </p>
                        </div>
                        {!notification.isRead && (
                          <span className="inline-block px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded font-medium flex-shrink-0">
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>
                          {new Date(notification.createdAt).toLocaleString()}
                        </span>
                        {notification.telegramSent && (
                          <span className="inline-block px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">
                            ✓ Telegram sent
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!notification.isRead && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markAsRead(notification.id)}
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteNotification(notification.id)}
                        title="Delete"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Notification Settings</DialogTitle>
            <DialogDescription>
              Configure your notification preferences and shift schedules
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-auto">
            <ShiftNotificationConfig
              isAdmin={isAdmin}
              onSaved={() => {
              setShowSettings(false);
              // Refresh shift labels in trigger dialog
              fetch("/api/notifications/shift-config", { credentials: "include" })
                .then((r) => r.ok ? r.json() : null)
                .then((res) => {
                  const cfg = res?.data;
                  if (cfg?.shiftStart1) {
                    setShiftLabels({
                      1: `${cfg.shiftStart1}–${cfg.shiftEnd1}`,
                      2: `${cfg.shiftStart2}–${cfg.shiftEnd2}`,
                      3: `${cfg.shiftStart3}–${cfg.shiftEnd3}`,
                    });
                  }
                })
                .catch(() => {});
            }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Trigger Dialog */}
      <Dialog open={showTrigger} onOpenChange={setShowTrigger}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Trigger Shift Recap</DialogTitle>
            <DialogDescription>
              Pilih shift untuk generate notifikasi rekap secara manual.
              Data diambil dari periode shift terakhir yang sudah selesai.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setTriggerShift(s)}
                  className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                    triggerShift === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-muted"
                  }`}
                >
                  <div className="font-semibold">Shift {s}</div>
                  <div className="text-xs opacity-70 mt-0.5">
                    {shiftLabels[s]}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowTrigger(false)} disabled={triggering}>
                Batal
              </Button>
              <Button onClick={triggerRecap} disabled={triggering}>
                {triggering ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {triggering ? "Mengirim..." : `Trigger Shift ${triggerShift}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
