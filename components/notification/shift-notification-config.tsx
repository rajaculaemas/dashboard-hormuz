"use client";

import React, { useState, useEffect } from "react";
import { Save, RefreshCw, Clock, Bell, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShiftConfig {
  id: string;
  shiftStart1: string;
  shiftEnd1: string;
  shiftStart2: string;
  shiftEnd2: string;
  shiftStart3: string;
  shiftEnd3: string;
  notificationMinutes: number;
  enableInApp: boolean;
  enableTelegram: boolean;
  telegramChatIdForNotifications?: string;
  timezone: string;
  filterIntegrationIds: string; // JSON-serialised string[]
  createdAt: string;
  updatedAt: string;
}

interface Integration {
  id: string;
  name: string;
  source: string;
}

export function ShiftNotificationConfig({ onSaved, isAdmin = false }: { onSaved?: () => void; isAdmin?: boolean } = {}) {
  const [config, setConfig] = useState<ShiftConfig | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<string[]>([]); // empty = all
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Fetch config and available integrations
  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        const [configRes, integRes] = await Promise.all([
          fetch("/api/notifications/shift-config", { credentials: "include" }),
          fetch("/api/integrations", { credentials: "include" }),
        ]);

        if (!configRes.ok) throw new Error(`HTTP ${configRes.status}`);
        const configResult = await configRes.json();
        if (!configResult.data) throw new Error("No data in response");
        setConfig(configResult.data);

        // Parse stored integration filter
        try {
          const parsed = JSON.parse(configResult.data.filterIntegrationIds || "[]");
          setSelectedIntegrationIds(Array.isArray(parsed) ? parsed : []);
        } catch {
          setSelectedIntegrationIds([]);
        }

        if (integRes.ok) {
          const integData = await integRes.json();
          const list: Integration[] = Array.isArray(integData)
            ? integData
            : integData.data || integData.integrations || [];
          setIntegrations(list);
        }
      } catch (error) {
        toast({
          title: "Error",
          description: `Failed to load configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [toast]);

  const handleChange = (field: string, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const toggleIntegration = (id: string) => {
    setSelectedIntegrationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Save config
  const handleSave = async () => {
    if (!config) return;

    // Admin-only safeguard
    if (!isAdmin) {
      toast({
        title: "Error",
        description: "Only administrators can modify shift notification settings",
        variant: "destructive",
      });
      return;
    }

    // Validate: if telegram is enabled, chat ID must be provided
    if (config.enableTelegram && !config.telegramChatIdForNotifications?.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Telegram Chat ID when enabling Telegram notifications",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/notifications/shift-config", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftStart1: config.shiftStart1,
          shiftEnd1: config.shiftEnd1,
          shiftStart2: config.shiftStart2,
          shiftEnd2: config.shiftEnd2,
          shiftStart3: config.shiftStart3,
          shiftEnd3: config.shiftEnd3,
          notificationMinutes: config.notificationMinutes,
          enableInApp: config.enableInApp,
          enableTelegram: config.enableTelegram,
          telegramChatIdForNotifications: config.telegramChatIdForNotifications || null,
          timezone: config.timezone,
          filterIntegrationIds: selectedIntegrationIds,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save");
      }

      const result = await res.json();
      setConfig(result.data);

      toast({
        title: "Success",
        description: "Shift notification settings saved",
      });
      onSaved?.();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        <span>Loading configuration...</span>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg">
        <p className="font-medium">Failed to load configuration</p>
        <p className="text-sm mt-1">Please try refreshing the page or contact support</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-sm text-amber-700 dark:text-amber-300 hover:underline"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  const TimeInput = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!isAdmin}
        className={`px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm ${
          !isAdmin ? "opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800" : ""
        }`}
      />
    </div>
  );

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="max-w-3xl">
        {/* Global Config Warning */}
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            <span className="font-semibold">Global Configuration</span> — These settings apply to all users. Only administrators can modify.
          </p>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Shift Notification Settings</h2>
          </div>
          {!isAdmin && (
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded">
              Read-only
            </span>
          )}
        </div>

        {/* Shift Configuration */}
        <div className="space-y-6">
          {/* Shift 1 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Shift 1 (Morning)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <TimeInput
                label="Start Time"
                value={config.shiftStart1}
                onChange={(value) => handleChange("shiftStart1", value)}
              />
              <TimeInput
                label="End Time"
                value={config.shiftEnd1}
                onChange={(value) => handleChange("shiftEnd1", value)}
              />
            </div>
          </div>

          {/* Shift 2 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Shift 2 (Afternoon)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <TimeInput
                label="Start Time"
                value={config.shiftStart2}
                onChange={(value) => handleChange("shiftStart2", value)}
              />
              <TimeInput
                label="End Time"
                value={config.shiftEnd2}
                onChange={(value) => handleChange("shiftEnd2", value)}
              />
            </div>
          </div>

          {/* Shift 3 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Shift 3 (Night)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <TimeInput
                label="Start Time"
                value={config.shiftStart3}
                onChange={(value) => handleChange("shiftStart3", value)}
              />
              <TimeInput
                label="End Time"
                value={config.shiftEnd3}
                onChange={(value) => handleChange("shiftEnd3", value)}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Shift 3 spans across midnight (23:00 to 07:00 next day)
            </p>
          </div>

          {/* Notification Settings */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="font-medium mb-4">Notification Settings</h3>
            <div className="space-y-4">
              {/* Minutes before shift end */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">
                  Notify (minutes before shift end)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={config.notificationMinutes}
                  onChange={(e) => isAdmin && handleChange("notificationMinutes", parseInt(e.target.value))}
                  disabled={!isAdmin}
                  className={`px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm w-32 ${
                    !isAdmin ? "opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800" : ""
                  }`}
                />
              </div>

              {/* Timezone */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Timezone</label>
                <select
                  value={config.timezone}
                  onChange={(e) => handleChange("timezone", e.target.value)}
                  disabled={!isAdmin}
                  className={`px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm ${
                    !isAdmin ? "opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800" : ""
                  }`}
                >
                  <option>UTC</option>
                  <option>Asia/Jakarta</option>
                  <option>Asia/Bangkok</option>
                  <option>Asia/Singapore</option>
                  <option>Asia/Manila</option>
                  <option>Asia/Hong_Kong</option>
                  <option>America/New_York</option>
                  <option>America/Los_Angeles</option>
                  <option>Europe/London</option>
                  <option>Europe/Paris</option>
                </select>
              </div>

              {/* Enable/Disable Notifications */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableInApp"
                  checked={config.enableInApp}
                  onChange={(e) => handleChange("enableInApp", e.target.checked)}
                  disabled={!isAdmin}
                  className={`w-4 h-4 rounded ${!isAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                />
                <label htmlFor="enableInApp" className="text-sm cursor-pointer">
                  Enable in-app notifications
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableTelegram"
                  checked={config.enableTelegram}
                  onChange={(e) => handleChange("enableTelegram", e.target.checked)}
                  disabled={!isAdmin}
                  className={`w-4 h-4 rounded ${!isAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                />
                <label
                  htmlFor="enableTelegram"
                  className="text-sm cursor-pointer"
                >
                  Send to Telegram
                </label>
              </div>

              {config.enableTelegram && (
                <div className="flex flex-col gap-2 bg-blue-50 dark:bg-blue-950 p-3 rounded">
                  <label htmlFor="telegramChatId" className="text-sm font-medium">
                    Telegram Chat ID (required)
                  </label>
                  <input
                    type="text"
                    id="telegramChatId"
                    placeholder="e.g., -1001234567890 or 123456789"
                    value={config.telegramChatIdForNotifications || ""}
                    onChange={(e) => handleChange("telegramChatIdForNotifications", e.target.value)}
                    disabled={!isAdmin}
                    className={`px-3 py-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 ${
                      !isAdmin ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  />
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Enter your Telegram Chat ID (can be group ID, channel ID, or personal chat ID). 
                    This is separate from your profile Telegram account.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Integration Filter */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="font-medium mb-1 flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Integration Filter
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Pilih integrasi yang akan dimasukkan ke dalam rekap shift.
              Kosongkan (centang semua atau tidak ada) untuk menyertakan semua integrasi.
            </p>
            {integrations.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Loading integrations...</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {integrations.map((integ) => {
                  const checked = selectedIntegrationIds.includes(integ.id);
                  return (
                    <label
                      key={integ.id}
                      className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                        isAdmin ? "cursor-pointer" : "cursor-default"
                      } ${
                        checked
                          ? "border-blue-400 bg-blue-50 dark:bg-blue-950 dark:border-blue-500"
                          : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => isAdmin && toggleIntegration(integ.id)}
                        disabled={!isAdmin}
                        className={`w-4 h-4 rounded accent-blue-600 ${!isAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{integ.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{integ.source}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            {selectedIntegrationIds.length > 0 && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                {selectedIntegrationIds.length} integrasi dipilih — hanya alert dari integrasi ini yang akan dihitung.
              </p>
            )}
            {selectedIntegrationIds.length === 0 && integrations.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Semua integrasi akan dimasukkan (tidak ada filter).
              </p>
            )}
          </div>
        </div>

        {/* Save Button (admin only) */}
        <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          {isAdmin ? (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />Saving...</>
              ) : (
                <><Save className="w-4 h-4" />Save Settings</>
              )}
            </button>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              Only administrators can change notification settings.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
