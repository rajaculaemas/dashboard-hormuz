import prisma from "@/lib/prisma";
import { formatISO, parseISO, isBefore, isAfter } from "date-fns";

// Helper: Convert UTC date to timezone
function getTimeInTimezone(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values: { [key: string]: number } = {};
  
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = parseInt(part.value);
    }
  }

  return new Date(values.year!, values.month! - 1, values.day!, values.hour!, values.minute!, values.second!);
}

/** Parse "HH:mm" into total minutes from midnight */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Check whether `timeMin` falls in [startMin, endMin). Handles midnight-crossing ranges. */
function timeInRange(timeMin: number, startMin: number, endMin: number): boolean {
  if (startMin < endMin) {
    return timeMin >= startMin && timeMin < endMin;
  }
  // Crosses midnight
  return timeMin >= startMin || timeMin < endMin;
}

type ShiftNumber = 1 | 2 | 3;

/** Custom shift schedule as stored in ShiftNotificationConfig */
export interface ShiftSchedule {
  shift1Start: string; // HH:mm
  shift1End: string;
  shift2Start: string;
  shift2End: string;
  shift3Start: string;
  shift3End: string;
}

const DEFAULT_SCHEDULE: ShiftSchedule = {
  shift1Start: "07:00",
  shift1End: "15:00",
  shift2Start: "15:00",
  shift2End: "23:00",
  shift3Start: "23:00",
  shift3End: "07:00",
};

export interface ShiftTime {
  shift: ShiftNumber;
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface ShiftRecapData {
  shift: ShiftNumber;
  period: {
    start: Date;
    end: Date;
  };
  alertStats: {
    total: number;
    byIntegration: {
      [integrationName: string]: number;
    };
    byStatus: {
      [status: string]: number;
    };
    untagged: number;
    untaggedAlerts: { id: string; displayId: string | null; title: string; integration: string }[];
    withoutComments: number;
    withoutCommentsAlerts: { id: string; displayId: string | null; title: string; integration: string }[];
    unassigned: number;
    unassignedAlerts: { id: string; displayId: string | null; title: string; integration: string }[];
  };
  /** Custom schedule used to build this recap — drives shift label display */
  schedule?: ShiftSchedule;
  /** User's timezone for displaying dates in notifications */
  timezone?: string;
}

/**
 * Determine which shift the given time falls in, using the provided schedule.
 */
export function getCurrentShift(
  time: Date,
  timezone: string = "UTC",
  schedule: ShiftSchedule = DEFAULT_SCHEDULE
): ShiftNumber {
  const zonedTime = getTimeInTimezone(time, timezone);
  const timeMin = zonedTime.getHours() * 60 + zonedTime.getMinutes();

  if (timeInRange(timeMin, toMinutes(schedule.shift1Start), toMinutes(schedule.shift1End))) return 1;
  if (timeInRange(timeMin, toMinutes(schedule.shift2Start), toMinutes(schedule.shift2End))) return 2;
  return 3;
}

/**
 * Get shift period (start and end UTC timestamps) for a given shift on a given date.
 */
export function getShiftPeriod(
  date: Date,
  shift: ShiftNumber,
  timezone: string = "UTC",
  schedule: ShiftSchedule = DEFAULT_SCHEDULE
): { start: Date; end: Date } {
  const startHHmm = shift === 1 ? schedule.shift1Start : shift === 2 ? schedule.shift2Start : schedule.shift3Start;
  const endHHmm   = shift === 1 ? schedule.shift1End   : shift === 2 ? schedule.shift2End   : schedule.shift3End;

  const startMin = toMinutes(startHHmm);
  const endMin   = toMinutes(endHHmm);
  const endDateOffset = endMin <= startMin ? 1 : 0; // crosses midnight?

  const startH = Math.floor(startMin / 60), startM = startMin % 60;
  const endH   = Math.floor(endMin   / 60), endM   = endMin   % 60;

  const zonedDate = getTimeInTimezone(date, timezone);
  const year = zonedDate.getFullYear();
  const month = zonedDate.getMonth();
  const day = zonedDate.getDate();

  // For midnight-crossing shifts (e.g. 21:00–07:00), if local time is already
  // past midnight (i.e. in the [00:00, endTime) window), the shift STARTED on
  // the previous calendar day.  Subtract 1 from the start day so we get the
  // correct period instead of the next night's occurrence.
  let startDayOffset = 0;
  if (endDateOffset === 1) {
    const localTimeMin = zonedDate.getHours() * 60 + zonedDate.getMinutes();
    if (localTimeMin < endMin) {
      startDayOffset = -1;
    }
  }

  const startLocal = new Date(year, month, day + startDayOffset,             startH, startM,  0,   0);
  const endLocal   = new Date(year, month, day + startDayOffset + endDateOffset, endH,   endM,  59, 999);

  const offset = date.getTime() - zonedDate.getTime();

  return {
    start: new Date(startLocal.getTime() + offset),
    end:   new Date(endLocal.getTime()   + offset),
  };
}

/**
 * Calculate when shift recap notification should be sent
 * (notificationMinutes before shift end)
 */
export function getShiftRecapTime(
  date: Date,
  shift: ShiftNumber,
  notificationMinutes: number = 15,
  timezone: string = "UTC",
  schedule: ShiftSchedule = DEFAULT_SCHEDULE
): Date {
  const { end } = getShiftPeriod(date, shift, timezone, schedule);
  return new Date(end.getTime() - notificationMinutes * 60 * 1000);
}

/**
 * Get next shift recap time from now
 */
export function getNextShiftRecapTime(
  now: Date,
  timezone: string = "UTC",
  notificationMinutes: number = 15,
  schedule: ShiftSchedule = DEFAULT_SCHEDULE
): { time: Date; shift: ShiftNumber; date: Date } {
  const currentShift = getCurrentShift(now, timezone, schedule);
  const recapTimeCurrent = getShiftRecapTime(now, currentShift, notificationMinutes, timezone, schedule);

  if (isAfter(recapTimeCurrent, now)) {
    return { time: recapTimeCurrent, shift: currentShift, date: now };
  }

  const nextShift: ShiftNumber = (currentShift % 3) + 1 as ShiftNumber;
  const nextDate = nextShift <= currentShift
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
    : new Date(now);

  const nextRecapTime = getShiftRecapTime(nextDate, nextShift, notificationMinutes, timezone, schedule);

  return { time: nextRecapTime, shift: nextShift, date: nextDate };
}

/**
 * Get alert statistics for a shift period.
 * @param filterIntegrationIds Optional list of integration IDs to include (empty = all).
 */
export async function getShiftRecapStats(
  startTime: Date,
  endTime: Date,
  filterIntegrationIds: string[] = []
): Promise<ShiftRecapData["alertStats"]> {
  const integrationFilter =
    filterIntegrationIds.length > 0
      ? { integrationId: { in: filterIntegrationIds } }
      : {};

  // Fetch alerts and include timeline events that indicate a comment/note was added.
  // This covers all comment storage paths:
  //   1. Single-alert update → analysis_notes column (alert.analysisNotes)
  //   2. Bulk update        → metadata.analysisNotes (JSON field)
  //   3. Any update         → alert_timeline rows with eventType comment/analysis_note
  //   4. QRadar             → metadata.qradar.notes (synced from QRadar API)
  //   5. Stellar Cyber      → metadata.comment_count / metadata.comment_latest_text
  const alerts = await prisma.alert.findMany({
    where: {
      timestamp: { gte: startTime, lte: endTime },
      ...integrationFilter,
    },
    include: {
      integration: { select: { name: true, source: true } },
      timeline: {
        where: { eventType: { in: ["comment", "analysis_note"] } },
        take: 1, // only need existence, not all rows
      },
    },
  });

  const stats: ShiftRecapData["alertStats"] = {
    total: alerts.length,
    byIntegration: {},
    byStatus: {},
    untagged: 0,
    untaggedAlerts: [],
    withoutComments: 0,
    withoutCommentsAlerts: [],
    unassigned: 0,
    unassignedAlerts: [],
  };

  for (const alert of alerts) {
    const integrationName = alert.integration.name || "Unknown";
    const source = (alert.integration.source || "").toLowerCase();
    stats.byIntegration[integrationName] = (stats.byIntegration[integrationName] || 0) + 1;

    const status = alert.status || "Unknown";
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

    // Determine display ID based on source
    // - QRadar: offense ID (metadata.qradar.id)
    // - SOCFortress: SOCFortress alert ID (metadata.socfortress.id)
    // - Stellar Cyber: no ID prefix (null)
    const meta = alert.metadata as any;
    let displayId: string | null = null;
    if (source.includes("qradar")) {
      const offenseId = meta?.qradar?.id;
      displayId = offenseId != null ? String(offenseId) : null;
    } else if (source.includes("socfortress")) {
      const alertId = meta?.socfortress?.id;
      displayId = alertId != null ? String(alertId) : null;
    }
    // Stellar Cyber: displayId stays null (no ID shown)

    // ── Tag detection (multi-source) ──────────────────────────────────────────
    let isTagged = false;

    if (Array.isArray(meta?.event_tags) && meta.event_tags.length > 0) {
      // Stellar Cyber: event_tags[0].tag
      const ft = meta.event_tags[0];
      isTagged = !!(ft && typeof ft === "object" && ft.tag);
    } else if (Array.isArray(meta?.tags) && meta.tags.length > 0) {
      // SOCFortress: metadata.tags array of strings
      isTagged = true;
    } else if (typeof meta?.qradar?.closing_reason_id === "number") {
      // QRadar: numeric closing_reason_id
      isTagged = [104, 2, 54, 105].includes(meta.qradar.closing_reason_id);
    } else if (meta?.closing_reason || meta?.qradar?.closing_reason) {
      isTagged = true;
    }

    if (!isTagged) {
      stats.untagged++;
      stats.untaggedAlerts.push({ id: alert.id, displayId, title: alert.title || "(no title)", integration: integrationName });
    }

    // ── Comment detection (all storage locations) ─────────────────────────────
    // Path A: timeline has a comment or analysis_note event (most reliable)
    const hasTimelineComment = alert.timeline.length > 0;

    // Path B: analysis_notes column (set by single-alert PATCH)
    const hasAnalysisNotesColumn =
      !!(alert.analysisNotes && alert.analysisNotes.trim().length > 0);

    // Path C: metadata.analysisNotes (set by bulk update — stored in JSON, not column)
    const hasMetaAnalysisNotes =
      !!(meta?.analysisNotes && String(meta.analysisNotes).trim().length > 0);

    // Path D: integration-specific comment fields
    let hasSourceComment = false;
    if (source.includes("stellar")) {
      // comment_count updated by Stellar Cyber API; comment_latest_text as fallback
      const cc = meta?.comment_count;
      hasSourceComment =
        (typeof cc === "number" && cc > 0) || !!(meta?.comment_latest_text);
    } else if (source.includes("qradar")) {
      // QRadar can have notes from multiple sources:
      // 1. metadata.qradar.notes - synced from QRadar API
      // 2. metadata.comment - dashboard comments (internal format)
      // 3. metadata.notes - legacy format
      
      const qradarNotes = meta?.qradar?.notes;
      const dashboardComments = meta?.comment;
      
      // Check QRadar API notes
      const hasQRadarNotes = Array.isArray(qradarNotes) && qradarNotes.length > 0;
      // Check dashboard comments (can be array or single object)
      const hasDashboardComments =
        (Array.isArray(dashboardComments) && dashboardComments.length > 0) ||
        (typeof dashboardComments === "object" && dashboardComments !== null);
      
      hasSourceComment = hasQRadarNotes || hasDashboardComments;
      
      // Debug logging for specific offense IDs
      const offenseId = meta?.qradar?.id;
      if (offenseId === 16075 || offenseId === 16077) {
        console.log(
          `[DEBUG] Alert ${alert.id} (Offense ${offenseId}): ` +
          `hasSourceComment=${hasSourceComment}, ` +
          `hasQRadarNotes=${hasQRadarNotes} (${Array.isArray(qradarNotes) ? qradarNotes.length : 0}), ` +
          `hasDashboardComments=${hasDashboardComments}`
        );
      }
    } else if (source.includes("socfortress")) {
      // SOCFortress comments are stored in MySQL and mirrored into
      // metadata.alert_history as entries with change_type = 'COMMENT_ADDED'
      const history = meta?.alert_history;
      hasSourceComment =
        Array.isArray(history) &&
        history.some((h: any) => h?.change_type === "COMMENT_ADDED");
    }

    const hasComment =
      hasTimelineComment ||
      hasAnalysisNotesColumn ||
      hasMetaAnalysisNotes ||
      hasSourceComment;

    // SAFEGUARD: For QRadar alerts, double-check notes in alternative locations if not found
    let finalHasComment = hasComment;
    if (!finalHasComment && source.includes("qradar")) {
      const qradarMeta = meta?.qradar as any;
      
      // Check if notes exist but might be in unexpected format
      if (qradarMeta?.notes && typeof qradarMeta.notes === "object") {
        const notesLength = Array.isArray(qradarMeta.notes) 
          ? qradarMeta.notes.length 
          : Object.keys(qradarMeta.notes).length;
        if (notesLength > 0) {
          finalHasComment = true;
          console.log(
            `[SAFEGUARD-FORMAT] Alert ${alert.id} (Offense ${qradarMeta.id}): ` +
            `Found QRadar notes with unexpected format (length: ${notesLength})`
          );
        }
      }
      
      // Fallback: Try to fetch from QRadarOffense cache if Alert metadata doesn't have notes
      // This handles case where notes were recently synced to QRadarOffense but not yet merged to Alert
      if (!finalHasComment) {
        try {
          const offenseId = Number(meta?.qradar?.id || meta?.externalId?.match(/\d+$/)?.[0]);
          if (!isNaN(offenseId)) {
            const qradarOffense = await prisma.qRadarOffense.findFirst({
              where: { externalId: offenseId, integrationId: alert.integrationId },
              select: { metadata: true },
            });
            
            const offenseMeta = (qradarOffense?.metadata as any) || {};
            const offenseNotes = offenseMeta?.notes;
            if (Array.isArray(offenseNotes) && offenseNotes.length > 0) {
              finalHasComment = true;
              console.log(
                `[SAFEGUARD-FALLBACK] Alert ${alert.id} (Offense ${offenseId}): ` +
                `Found QRadar notes in QRadarOffense cache (count: ${offenseNotes.length})`
              );
            }
          }
        } catch (err: any) {
          console.warn(
            `[SAFEGUARD-FALLBACK] Alert ${alert.id}: Failed to check QRadarOffense fallback - ${err.message}`
          );
        }
      }
    }

    if (!finalHasComment) {
      stats.withoutComments++;
      stats.withoutCommentsAlerts.push({ id: alert.id, displayId, title: alert.title || "(no title)", integration: integrationName });
    }

    // ── Assignee detection (multi-source) ────────────────────────────────────
    const isAssigned = !!(meta?.assignee ||
      meta?.qradar?.assigned_to ||
      meta?.assigned_to ||
      meta?.socfortress?.assigned_to);

    if (!isAssigned) {
      stats.unassigned++;
      stats.unassignedAlerts.push({ id: alert.id, displayId, title: alert.title || "(no title)", integration: integrationName });
    }
  }

  return stats;
}

/**
 * Format shift recap data for display
 */
function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

export function formatShiftRecap(data: ShiftRecapData): string {
  const s = data.schedule || DEFAULT_SCHEDULE;
  const tz = data.timezone || "UTC";
  const shiftLabels: { [key in ShiftNumber]: string } = {
    1: `Shift 1 (${s.shift1Start} - ${s.shift1End})`,
    2: `Shift 2 (${s.shift2Start} - ${s.shift2End})`,
    3: `Shift 3 (${s.shift3Start} - ${s.shift3End})`,
  };

  const lines: string[] = [
    `📊 *${shiftLabels[data.shift]} Recap*`,
    `Period: ${formatDateInTimezone(data.period.start, tz)} - ${formatDateInTimezone(data.period.end, tz)} (${tz})`,
    ``,
    `📈 *Alert Statistics*`,
    `Total Alerts: *${data.alertStats.total}*`,
    ``,
    `By Integration:`,
  ];

  for (const [integration, count] of Object.entries(data.alertStats.byIntegration)) {
    lines.push(`  • ${integration}: ${count}`);
  }

  lines.push(``, `Status Breakdown:`);
  for (const [status, count] of Object.entries(data.alertStats.byStatus)) {
    lines.push(`  • ${status}: ${count}`);
  }

  lines.push(``, `⚠️ *Action Items*`);
  
  // Helper function to add alert details with limit
  const addAlertDetails = (category: string, count: number, alerts: Array<{ id: string; displayId: string | null; title: string; integration: string }>) => {
    lines.push(`  • ${category}: ${count}`);
    const alertList = alerts.slice(0, 3); // Limit to 3 per category to save space
    for (const alert of alertList) {
      const shortTitle = alert.title.length > 40 ? alert.title.substring(0, 37) + "..." : alert.title;
      const shortIntegration = alert.integration.length > 20 ? alert.integration.substring(0, 17) + "..." : alert.integration;
      const idPrefix = alert.displayId ? `#${alert.displayId}: ` : "";
      lines.push(`    - ${idPrefix}${shortTitle} (${shortIntegration})`);
    }
    const remaining = alerts.length - alertList.length;
    if (remaining > 0) {
      lines.push(`    - ...and ${remaining} more alerts`);
    }
  };

  // Add action items in order
  addAlertDetails("Untagged Alerts", data.alertStats.untagged, data.alertStats.untaggedAlerts);
  addAlertDetails("Without Comments", data.alertStats.withoutComments, data.alertStats.withoutCommentsAlerts);
  addAlertDetails("Unassigned Alerts", data.alertStats.unassigned, data.alertStats.unassignedAlerts);

  let message = lines.join("\n");
  
  // Telegram has 4096 character limit; if message exceeds, truncate with summary
  const TELEGRAM_MAX_LENGTH = 4000;
  if (message.length > TELEGRAM_MAX_LENGTH) {
    console.warn(
      `[ShiftRecap] Message too long (${message.length} chars) for shift ${data.shift}, truncating...`
    );
    // Keep header + stats, truncate action items
    const headerEndIndex = message.indexOf("⚠️ *Action Items*");
    if (headerEndIndex > 0) {
      const header = message.substring(0, headerEndIndex);
      const actionItemsSummary = `⚠️ *Action Items* (Summary - See Dashboard for Full Details)\n  • Untagged: ${data.alertStats.untagged} | Without Comments: ${data.alertStats.withoutComments} | Unassigned: ${data.alertStats.unassigned}`;
      message = (header + actionItemsSummary).substring(0, TELEGRAM_MAX_LENGTH - 50) + "...\n\n📋 Full details available in dashboard";
    }
  }

  return message;
}

/**
 * Send shift recap notification to user (both in-app and Telegram)
 */
export async function sendShiftRecapNotification(
  userId: string,
  shift: ShiftNumber,
  recapData: ShiftRecapData
): Promise<{
  notification: any;
  telegramSent?: boolean;
  telegramMessageId?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Get global shift notification config (applies to all users)
  const config = await prisma.shiftNotificationConfig.findUnique({
    where: { id: "global" },
  });

  if (!config) {
    throw new Error(`Global shift notification config not found`);
  }

  const shiftLabels: { [key in ShiftNumber]: string } = {
    1: "Shift 1",
    2: "Shift 2",
    3: "Shift 3",
  };

  const title = `${shiftLabels[shift]} Alert Recap`;
  const markdownContent = formatShiftRecap(recapData);
  // Strip markdown asterisks for in-app display (stored in DB)
  const plainContent = markdownContent.replace(/\*/g, "");

  // Log statistics for debugging
  console.log(`[SendShiftRecap] Statistics for Shift ${shift}:`, {
    total: recapData.alertStats.total,
    untagged: recapData.alertStats.untagged,
    untaggedCount: recapData.alertStats.untaggedAlerts.length,
    withoutComments: recapData.alertStats.withoutComments,
    withoutCommentsCount: recapData.alertStats.withoutCommentsAlerts.length,
    unassigned: recapData.alertStats.unassigned,
    unassignedCount: recapData.alertStats.unassignedAlerts.length,
    contentLength: plainContent.length,
  });

  // Deduplication: Check if a recap for this shift was already sent in the last 5 minutes
  // (to prevent double-sends from external + internal cron triggers)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentRecap = await prisma.notification.findFirst({
    where: {
      userId,
      createdAt: { gte: fiveMinutesAgo },
      title: { contains: shiftLabels[shift] },
      notificationType: "shift_recap",
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentRecap) {
    console.log(
      `[SendShiftRecap] Skipping duplicate: ${title} for user ${userId} (duplicate sent ${Math.round((Date.now() - recentRecap.createdAt.getTime()) / 1000)}s ago)`
    );
    return {
      notification: recentRecap,
      telegramSent: false,
    };
  }

  // Create in-app notification (uses plain text content, no markdown)
  const notification = await prisma.notification.create({
    data: {
      userId,
      notificationType: "shift_recap",
      title,
      content: plainContent,
      metadata: {
        shift,
        stats: recapData.alertStats,
        periodStart: recapData.period.start.toISOString(),
        periodEnd: recapData.period.end.toISOString(),
      },
    },
  });

  // Send Telegram if enabled and custom telegram chat ID is configured
  let telegramMessageId: string | undefined;
  if (config.enableTelegram && config.telegramChatIdForNotifications) {
    try {
      // sendNotification is a static method — call it on the class, not an instance
      const { TelegramEscalationService } = require("./telegram-escalation");
      // Rebuild markdown content for Telegram using fresh config timezone
      // to ensure consistency between in-app and Telegram display
      const telegramRecapData: ShiftRecapData = {
        ...recapData,
        timezone: config.timezone || "UTC",
      };
      const telegramMarkdownContent = formatShiftRecap(telegramRecapData);
      const botMessage = `*${title}*\n\n${telegramMarkdownContent}`;
      telegramMessageId = await TelegramEscalationService.sendNotification(config.telegramChatIdForNotifications, botMessage);

      // Update notification with telegram message id
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          telegramSent: true,
          telegramMessageId,
        },
      });
    } catch (error) {
      console.error(
        `Failed to send Telegram shift recap to user ${userId}:`,
        error
      );
    }
  }

  return {
    notification,
    telegramSent: !!telegramMessageId,
    telegramMessageId,
  };
}

/**
 * Check if it's time to send shift recap for any user
 * Returns users who should receive shift recap notification now (using global config)
 */
export async function getUsersForShiftRecap(): Promise<
  {
    userId: string;
    shift: ShiftNumber;
    recapData: ShiftRecapData;
  }[]
> {
  const now = new Date();

  // 2-minute window for cron timing variations
  const oneMinuteWindow = 2 * 60 * 1000;

  // Get global shift notification config
  const globalConfig = await prisma.shiftNotificationConfig.findUnique({
    where: { id: "global" },
  });

  if (!globalConfig) {
    console.warn("Global shift notification config not found");
    return [];
  }

  // Get all active users
  const users = await prisma.user.findMany({
    where: { status: "active" },
  });

  const results: {
    userId: string;
    shift: ShiftNumber;
    recapData: ShiftRecapData;
  }[] = [];

  // Use global config's timezone for all users
  const globalTimezone = globalConfig.timezone || "UTC";

  // Build schedule from global config
  const schedule: ShiftSchedule = {
    shift1Start: globalConfig.shiftStart1 || "07:00",
    shift1End:   globalConfig.shiftEnd1   || "15:00",
    shift2Start: globalConfig.shiftStart2 || "15:00",
    shift2End:   globalConfig.shiftEnd2   || "23:00",
    shift3Start: globalConfig.shiftStart3 || "23:00",
    shift3End:   globalConfig.shiftEnd3   || "07:00",
  };

  // Check if it's time to send recap now
  const nextRecap = getNextShiftRecapTime(now, globalTimezone, globalConfig.notificationMinutes, schedule);
  const timeDiff = Math.abs(nextRecap.time.getTime() - now.getTime());

  if (timeDiff <= oneMinuteWindow) {
    // If it's recap time, send to all active users
    const recapShift = nextRecap.shift;
    const { start, end } = getShiftPeriod(now, recapShift, globalTimezone, schedule);

    let filterIds: string[] = [];
    try {
      const parsed = JSON.parse(globalConfig.filterIntegrationIds || "[]");
      if (Array.isArray(parsed)) filterIds = parsed.filter((v: any) => typeof v === "string");
    } catch {
      filterIds = [];
    }

    const stats = await getShiftRecapStats(start, end, filterIds);

    for (const user of users) {
      results.push({
        userId: user.id,
        shift: recapShift,
        recapData: {
          shift: recapShift,
          period: { start, end },
          alertStats: stats,
          schedule,
          timezone: globalTimezone,
        },
      });
    }
  }

  return results;
}
