#!/usr/bin/env node

/**
 * Debug script to inspect Socfortress MTTR calculation
 * Shows actual timestamps from database for cases and their linked alerts
 */

const mysql = require("mysql2/promise");
require("dotenv").config({ path: ".env.local" });

// Helper: Convert various timestamp formats to milliseconds
function toMs(v) {
  if (!v && v !== 0) return null;
  if (typeof v === "number") {
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

async function main() {
  console.log("🔍 Debug: Socfortress MTTR Calculation\n");

  const pool = mysql.createPool({
    host: process.env.SOCFORTRESS_DB_HOST || "localhost",
    port: parseInt(process.env.SOCFORTRESS_DB_PORT || "3306"),
    user: process.env.SOCFORTRESS_DB_USER || "root",
    password: process.env.SOCFORTRESS_DB_PASSWORD || "",
    database: process.env.SOCFORTRESS_DB_NAME || "socfortress",
  });

  try {
    const conn = await pool.getConnection();

    // Get 5 most recent cases with alerts
    const caseQuery = `
      SELECT 
        imc.id,
        imc.case_name,
        imc.case_creation_time,
        imc.case_status,
        COUNT(DISTINCT imcal.alert_id) as alert_count
      FROM incident_management_case imc
      LEFT JOIN incident_management_casealertlink imcal ON imc.id = imcal.case_id
      GROUP BY imc.id
      HAVING alert_count > 0
      ORDER BY imc.case_creation_time DESC
      LIMIT 5
    `;

    const [cases] = await conn.execute(caseQuery);

    if (!cases || cases.length === 0) {
      console.log("❌ No cases with alerts found");
      conn.release();
      await pool.end();
      return;
    }

    console.log(`Found ${cases.length} cases with alerts\n`);

    for (const caseData of cases) {
      console.log("═".repeat(80));
      console.log(`📌 Case ID: ${caseData.id}`);
      console.log(`   Name: ${caseData.case_name}`);
      console.log(`   Status: ${caseData.case_status}`);
      console.log(`   Creation Time (raw): ${caseData.case_creation_time}`);
      
      const caseCreatedMs = toMs(caseData.case_creation_time);
      const caseDate = new Date(caseCreatedMs);
      console.log(`   Creation Time (ms): ${caseCreatedMs}`);
      console.log(`   Creation Time (ISO): ${caseDate.toISOString()}`);

      // Get linked alerts
      const alertLinkQuery = `
        SELECT alert_id 
        FROM incident_management_casealertlink 
        WHERE case_id = ?
      `;
      const [links] = await conn.execute(alertLinkQuery, [caseData.id]);

      if (!links || links.length === 0) {
        console.log("   ⚠️  No alerts linked");
        continue;
      }

      console.log(`   📊 Linked alerts: ${links.length}`);

      const alertTimes = [];
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const alertQuery = `
          SELECT id, alert_creation_time 
          FROM incident_management_alert 
          WHERE id = ?
        `;
        const [alerts] = await conn.execute(alertQuery, [link.alert_id]);

        if (alerts && alerts.length > 0) {
          const alert = alerts[0];
          const alertMs = toMs(alert.alert_creation_time);
          const alertDate = new Date(alertMs);
          console.log(`      ${i + 1}. Alert #${alert.id}`);
          console.log(`         Time (raw): ${alert.alert_creation_time}`);
          console.log(`         Time (ms):  ${alertMs}`);
          console.log(`         Time (ISO): ${alertDate.toISOString()}`);
          alertTimes.push({ id: alert.id, ms: alertMs, date: alertDate });
        }
      }

      // Calculate MTTR
      if (alertTimes.length > 0) {
        const latestAlertMs = Math.max(...alertTimes.map((a) => a.ms));
        const latestAlert = alertTimes.find((a) => a.ms === latestAlertMs);
        
        console.log(`\n   🕐 Latest Alert: #${latestAlert.id}`);
        console.log(`      Time (ISO): ${latestAlert.date.toISOString()}`);
        
        const mttrMs = caseCreatedMs - latestAlertMs;
        const mttrMinutes = Math.round(mttrMs / 60000);
        const mttrHours = (mttrMs / 3600000).toFixed(2);
        
        console.log(`\n   ✅ MTTR Calculation:`);
        console.log(`      Formula: caseCreatedMs - latestAlertMs`);
        console.log(`      = ${caseCreatedMs} - ${latestAlertMs}`);
        console.log(`      = ${mttrMs}ms`);
        console.log(`      = ${mttrMinutes} minutes`);
        console.log(`      = ${mttrHours} hours`);
        
        if (mttrMs < 0) {
          console.log(`   ⚠️  INVALID: Case created BEFORE latest alert!`);
        }
      }

      console.log("");
    }

    conn.release();
  } catch (error) {
    console.error("❌ Error:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.message.includes("Access denied")) {
      console.log("\n💡 Tip: Check your .env.local for proper Socfortress database credentials:");
      console.log("   SOCFORTRESS_DB_HOST");
      console.log("   SOCFORTRESS_DB_PORT");
      console.log("   SOCFORTRESS_DB_USER");
      console.log("   SOCFORTRESS_DB_PASSWORD");
      console.log("   SOCFORTRESS_DB_NAME");
    }
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
