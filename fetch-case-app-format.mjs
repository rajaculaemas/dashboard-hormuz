#!/usr/bin/env node

/**
 * Script untuk fetch case melalui aplikasi (getSocfortressCases)
 * Menampilkan struktur JSON seperti yang dihasilkan aplikasi
 */

import * as mysql from "mysql2/promise";
import fs from "fs";

// SOCFortress credentials (sesuaikan dengan environment)
const credentials = {
  host: process.env.MYSQL_HOST || "100.100.12.41",
  port: parseInt(process.env.MYSQL_PORT || "3306"),
  user: process.env.MYSQL_USER || "copilot",
  password: process.env.MYSQL_PASSWORD || "POUTHBLJvhvcasgFDS98",
  database: process.env.MYSQL_DATABASE || "copilot",
};

async function getConnection() {
  return mysql.createConnection({
    host: credentials.host,
    port: credentials.port,
    user: credentials.user,
    password: credentials.password,
    database: credentials.database,
    connectTimeout: 10000,
  });
}

function mapStatusFromMySQL(status) {
  const statusMap = {
    OPEN: "New",
    IN_PROGRESS: "In Progress",
    CLOSED: "Closed",
  };
  return statusMap[status?.toUpperCase()] || "New";
}

function transformAlert(alert) {
  // Parse source_data if it's a string
  let sourceData = null;
  if (alert.incident_event?.source_data) {
    const eventSourceData = alert.incident_event.source_data;
    sourceData =
      typeof eventSourceData === "string"
        ? JSON.parse(eventSourceData)
        : eventSourceData;
  }

  // Extract tag names from tags array
  const tagNames = alert.tags?.map((t) => t.tag || t.name || "").filter(Boolean) || [];

  return {
    externalId: String(alert.id),
    id: String(alert.id),
    title: alert.alert_name,
    description: alert.alert_description,
    status: mapStatusFromMySQL(alert.status),
    severity: alert.severity || "Medium",
    timestamp: new Date(alert.alert_creation_time),
    metadata: {
      socfortress: {
        id: alert.id,
        customer_code: alert.customer_code,
        source: alert.source,
        assigned_to: alert.assigned_to,
        time_closed: alert.time_closed,
      },
      incident_event: alert.incident_event
        ? {
            id: alert.incident_event.id,
            asset_name: alert.incident_event.asset_name,
            created_at: alert.incident_event.created_at,
            source_data: sourceData,
          }
        : null,
      alert_history: alert.alert_history || [],
      tags: tagNames,
    },
  };
}

async function fetchCaseAlertsFromDB(conn, caseId) {
  try {
    const linkQuery = `
      SELECT alert_id 
      FROM incident_management_casealertlink 
      WHERE case_id = ?
    `;

    console.log(`[fetch] Querying alert links for case ${caseId}...`);
    const [links] = await conn.execute(linkQuery, [caseId]);
    console.log(`[fetch] Found ${links?.length || 0} alert links`);

    if (!links || links.length === 0) {
      return [];
    }

    const enrichedAlerts = [];
    for (const link of links) {
      try {
        const alertId = link.alert_id;
        console.log(`[fetch] Fetching alert ${alertId}...`);

        const alertQuery = `SELECT * FROM incident_management_alert WHERE id = ?`;
        const [alertRows] = await conn.execute(alertQuery, [alertId]);

        if (!alertRows || alertRows.length === 0) {
          console.warn(`Alert ${alertId} not found`);
          continue;
        }

        const alert = alertRows[0];

        const eventQuery = `SELECT * FROM incident_management_alertevent 
                          WHERE alert_id = ? 
                          ORDER BY created_at DESC 
                          LIMIT 1`;
        const [events] = await conn.execute(eventQuery, [alertId]);

        if (events && events.length > 0 && events[0].source_data) {
          try {
            events[0].source_data = JSON.parse(events[0].source_data);
          } catch (e) {
            // Keep as string
          }
        }

        const historyQuery = `SELECT * FROM incident_management_alert_history 
                            WHERE alert_id = ? 
                            ORDER BY changed_at DESC`;
        const [history] = await conn.execute(historyQuery, [alertId]);

        const tagsQuery = `
          SELECT t.id, t.tag
          FROM incident_management_alert_to_tag m
          JOIN incident_management_alerttag t ON m.tag_id = t.id
          WHERE m.alert_id = ?
        `;
        let tags = [];
        try {
          const [tagRows] = await conn.execute(tagsQuery, [alertId]);
          tags = tagRows || [];
        } catch (e) {
          console.warn(`Could not fetch tags: ${e.message}`);
        }

        enrichedAlerts.push({
          ...alert,
          incident_event: events?.[0] || null,
          alert_history: history || [],
          tags: tags || [],
        });
      } catch (error) {
        console.error(`Error fetching alert details:`, error);
      }
    }

    console.log(`[fetch] Case ${caseId}: Fetched ${enrichedAlerts.length} linked alerts`);
    return enrichedAlerts;
  } catch (error) {
    console.error(`Error fetching case alerts:`, error);
    return [];
  }
}

async function fetchCaseHistoryFromDB(conn, caseId) {
  try {
    const historyQuery = `
      SELECT * FROM incident_management_case_history 
      WHERE case_id = ? 
      ORDER BY changed_at DESC
    `;

    const [history] = await conn.execute(historyQuery, [caseId]);
    console.log(`[fetch] Case ${caseId}: Fetched ${history?.length || 0} history entries`);
    return history || [];
  } catch (error) {
    console.error(`Error fetching case history:`, error);
    return [];
  }
}

async function fetchRecentCases(conn, limit = 1) {
  try {
    const safeLimit = Math.max(1, Math.floor(limit));
    const query = `
      SELECT c.*
      FROM incident_management_case c
      ORDER BY c.case_creation_time DESC
      LIMIT ${safeLimit}
    `;

    const [rows] = await conn.execute(query);
    return rows || [];
  } catch (error) {
    console.error("Error fetching cases:", error);
    return [];
  }
}

async function main() {
  let caseId = 77; // Default

  if (process.argv[2]) {
    caseId = parseInt(process.argv[2], 10);
    if (isNaN(caseId)) {
      console.error("Invalid case ID");
      process.exit(1);
    }
  }

  let conn;
  try {
    conn = await getConnection();
    console.log(`Connected to ${credentials.host}:${credentials.port}/${credentials.database}\n`);

    // Fetch specific case
    const [caseRows] = await conn.execute(
      "SELECT * FROM incident_management_case WHERE id = ?",
      [caseId]
    );

    if (!caseRows || caseRows.length === 0) {
      console.error(`Case ${caseId} not found`);
      process.exit(1);
    }

    const caseData = caseRows[0];
    console.log(`Found case: ${caseData.case_name}\n`);

    // Fetch related alerts
    const rawAlerts = await fetchCaseAlertsFromDB(conn, caseData.id);
    console.log(`Transforming ${rawAlerts.length} alerts...`);

    const caseAlerts = rawAlerts.map((alert) => transformAlert(alert));

    // Fetch case history
    const caseHistory = await fetchCaseHistoryFromDB(conn, caseData.id);

    // Build response similar to getSocfortressCases
    const caseWithAlerts = {
      externalId: String(caseData.id),
      name: caseData.case_name,
      description: caseData.case_description || "",
      status: mapStatusFromMySQL(caseData.case_status),
      severity: caseData.severity || "Medium",
      ticketId: caseData.id,
      timestamp: new Date(caseData.case_creation_time),
      alerts: caseAlerts,
      metadata: {
        socfortress: {
          id: caseData.id,
          customer_code: caseData.customer_code,
          assigned_to: caseData.assigned_to,
          case_creation_time: caseData.case_creation_time,
          case_status: caseData.case_status,
        },
        case_history: caseHistory,
      },
    };

    // Output as JSON
    const output = JSON.stringify(caseWithAlerts, null, 2);
    console.log("\n=== APLIKASI FORMAT (getSocfortressCases output) ===\n");
    console.log(output);

    // Save to file
    const filename = `case_${caseId}_app_format.json`;
    fs.writeFileSync(filename, output);
    console.log(`\n✓ Saved to ${filename}`);

    await conn.end();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
