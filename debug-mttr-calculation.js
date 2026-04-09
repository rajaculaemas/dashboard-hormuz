#!/usr/bin/env node

const mysql = require("mysql2/promise");
require("dotenv").config({ path: ".env.local" });

// Helper: Convert various timestamp formats to milliseconds
function toMs(v) {
  if (!v && v !== 0) return null;
  if (typeof v === "number") {
    // If > 1000000000000, assume it's already milliseconds (from year 2001 onwards)
    return v > 1e12 ? v : v * 1000;
  }
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isNaN(n) && String(v).trim() !== "") {
      return n > 1e12 ? n : n * 1000;
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

// Helper: Compute metric time difference in milliseconds
function computeMetricMs(startMs, endMs) {
  if (!startMs || !endMs || startMs >= endMs) {
    console.log(
      `[computeMetricMs] Invalid params: startMs=${startMs}, endMs=${endMs}`
    );
    return null;
  }
  const diff = endMs - startMs;
  return diff > 0 ? diff : null;
}

async function main() {
  console.log("🔍 Debug MTTR Calculation for Socfortress Cases\n");

  const pool = mysql.createPool({
    host: process.env.SOCFORTRESS_DB_HOST || "localhost",
    port: parseInt(process.env.SOCFORTRESS_DB_PORT || "3306"),
    user: process.env.SOCFORTRESS_DB_USER || "root",
    password: process.env.SOCFORTRESS_DB_PASSWORD || "",
    database: process.env.SOCFORTRESS_DB_NAME || "socfortress",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  try {
    const conn = await pool.getConnection();

    // Fetch a case with associated alerts
    const caseQuery = `
      SELECT 
        imc.id,
        imc.case_creation_time,
        imc.case_status,
        COUNT(DISTINCT imcal.alert_id) as alert_count
      FROM incident_management_case imc
      LEFT JOIN incident_management_casealertlink imcal ON imc.id = imcal.case_id
      GROUP BY imc.id
      HAVING alert_count > 0
      LIMIT 5
    `;

    console.log("Fetching cases with alerts...\n");
    const [cases] = await conn.execute(caseQuery);

    if (!cases || cases.length === 0) {
      console.log("No cases with alerts found");
      conn.release();
      await pool.end();
      return;
    }

    for (const caseData of cases) {
      console.log("=".repeat(80));
      console.log(`📌 Case ID: ${caseData.id}`);
      console.log(`   Status: ${caseData.case_status}`);
      console.log(`   Creation Time (raw): ${caseData.case_creation_time}`);

      const caseCreatedMs = toMs(caseData.case_creation_time);
      console.log(`   Creation Time (ms): ${caseCreatedMs}`);
      console.log(`   Creation Time (ISO): ${new Date(caseCreatedMs).toISOString()}`);

      // Fetch alerts linked to this case
      const alertLinkQuery = `
        SELECT alert_id 
        FROM incident_management_casealertlink 
        WHERE case_id = ?
      `;
      const [links] = await conn.execute(alertLinkQuery, [caseData.id]);

      if (!links || links.length === 0) {
        console.log("   No alerts linked to this case");
        continue;
      }

      console.log(`   Found ${links.length} linked alerts`);

      const alertTimestamps = [];
      for (const link of links) {
        const alertQuery = `
          SELECT id, alert_creation_time 
          FROM incident_management_alert 
          WHERE id = ?
        `;
        const [alerts] = await conn.execute(alertQuery, [link.alert_id]);

        if (alerts && alerts.length > 0) {
          const alert = alerts[0];
          const alertMs = toMs(alert.alert_creation_time);
          console.log(`   - Alert ${alert.id}: ${alert.alert_creation_time} → ${alertMs}ms → ${new Date(alertMs).toISOString()}`);
          alertTimestamps.push(alertMs);
        }
      }

      if (alertTimestamps.length > 0) {
        const latestAlertMs = Math.max(...alertTimestamps);
        console.log(
          `\n   Latest Alert Time (ms): ${latestAlertMs}`
        );
        console.log(
          `   Latest Alert Time (ISO): ${new Date(latestAlertMs).toISOString()}`
        );

        const mttrMs = computeMetricMs(latestAlertMs, caseCreatedMs);
        if (mttrMs !== null) {
          const mttrMinutes = Math.round(mttrMs / 60000);
          const mttrHours = (mttrMs / 3600000).toFixed(2);
          console.log(`\n   ✅ MTTR Calculation:`);
          console.log(`      - Time Difference (ms): ${mttrMs}`);
          console.log(`      - MTTR: ${mttrMinutes} minutes`);
          console.log(`      - MTTR: ${mttrHours} hours`);
          console.log(`      - Formula: (${caseCreatedMs} - ${latestAlertMs}) / 60000 = ${mttrMinutes}`);
        } else {
          console.log(
            `\n   ❌ MTTR Calculation Failed: startMs=${latestAlertMs}, endMs=${caseCreatedMs}`
          );
        }
      }

      console.log("");
    }

    conn.release();
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
