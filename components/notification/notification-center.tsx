"use client";

import React, { useState } from "react";
import { Bell } from "lucide-react";

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      {/* Bell Icon Button - SUPER SIMPLE TEST */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <Bell size={20} style={{ color: "currentColor" }} />
      </button>

      {/* Test Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "8px",
            width: "300px",
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
            padding: "16px",
            zIndex: 50,
          }}
        >
          <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>Notifications</h3>
          <p style={{ fontSize: "14px", color: "#666" }}>
            Test notification dropdown
          </p>
        </div>
      )}
    </div>
  );
}

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?page=1&limit=10");
      if (!res.ok) throw new Error("Failed to fetch");

      const result = await res.json();
      setNotifications(result.data || []);
      setUnreadCount(result.data?.filter((n: Notification) => !n.isRead).length || 0);
    } catch (error) {
      console.error("Fetch error:", error);
      toast({
        title: "Error",
        description: "Failed to load notifications",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
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

      toast({
        title: "Success",
        description: "Notification marked as read",
      });
    } catch (error) {
      console.error("Mark as read error:", error);
      toast({
        title: "Error",
        description: "Failed to mark notification",
        variant: "destructive",
      });
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications
        .filter((n) => !n.isRead)
        .map((n) => n.id);

      if (unreadIds.length === 0) return;

      const res = await fetch("/api/notifications", {
        method: "PATCH",
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
      console.error("Mark all as read error:", error);
      toast({
        title: "Error",
        description: "Failed to mark notifications",
        variant: "destructive",
      });
    }
  };

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Close dropdown on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

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
    <>
      {/* Bell Icon Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown - Global Portal */}
      {isOpen && (
        <>
          {/* Invisible backdrop to close on click */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            style={{ pointerEvents: "auto" }}
          />

          {/* Notifications Dropdown */}
          <div className="fixed top-14 right-6 w-96 max-h-96 bg-white dark:bg-slate-950 rounded-lg shadow-xl border border-gray-200 dark:border-slate-800 z-50 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900">
              <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-24">
                  <RefreshCw className="w-4 h-4 animate-spin text-gray-500" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex items-center justify-center h-24 text-gray-500 dark:text-gray-400">
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 border-b border-gray-100 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                      !notification.isRead
                        ? "bg-blue-50 dark:bg-blue-950/20"
                        : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <span className="text-lg flex-shrink-0">
                        {getNotificationIcon(
                          notification.notificationType
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-gray-900 dark:text-white">
                          {notification.title}
                        </h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                          {notification.content}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {new Date(
                            notification.createdAt
                          ).toLocaleString()}
                        </p>
                        {notification.telegramSent && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">
                            ✓ Telegram sent
                          </span>
                        )}
                      </div>
                      {!notification.isRead && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {notifications.length} notification
                {notifications.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-800 rounded transition-colors"
              >
                <Settings className="w-3 h-3" />
                Settings
              </button>
            </div>
          </div>
        </>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowSettings(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-950 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto shadow-xl border border-gray-200 dark:border-slate-800">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Notification Settings
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <ShiftNotificationConfig />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
