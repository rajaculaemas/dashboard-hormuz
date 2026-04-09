#!/usr/bin/env node

const mysql = require("mysql2/promise");

async function testConnection() {
  try {
    console.log("Testing MySQL Copilot connection...");
    
    const connection = await mysql.createConnection({
      host: "100.100.12.41",
      port: 3306,
      user: "copilot",
      password: "POUTHBLJvhvcasgFDS98",
      database: "copilot",
    });

    console.log("✓ Connected to MySQL successfully!");

    // Test 1: Count alerts
    console.log("\n=== TEST 1: Count Alerts ===");
    const [alertCount] = await connection.execute(
      "SELECT COUNT(*) as count FROM incident_management_alert"
    );
    console.log(`Total alerts in MySQL: ${alertCount[0].count}`);

    // Test 2: Get sample alerts
    console.log("\n=== TEST 2: Sample Alerts ===");
    const [alerts] = await connection.execute(
      "SELECT id, alert_name, status, alert_creation_time FROM incident_management_alert LIMIT 5"
    );
    console.log(`Found ${alerts.length} sample alerts:`);
    alerts.forEach((alert) => {
      console.log(
        `  - ID: ${alert.id}, Name: ${alert.alert_name}, Status: ${alert.status}, Created: ${alert.alert_creation_time}`
      );
    });

    // Test 3: Get recent alerts with different statuses
    console.log("\n=== TEST 3: Alerts by Status ===");
    const [statusQuery] = await connection.execute(
      "SELECT status, COUNT(*) as count FROM incident_management_alert GROUP BY status"
    );
    console.log("Alert counts by status:");
    statusQuery.forEach((row) => {
      console.log(`  - ${row.status}: ${row.count}`);
    });

    // Test 4: Check alert creation time distribution
    console.log("\n=== TEST 4: Recent Alerts (Last 7 Days) ===");
    const [recentAlerts] = await connection.execute(
      "SELECT id, alert_name, alert_creation_time FROM incident_management_alert WHERE alert_creation_time >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY alert_creation_time DESC LIMIT 10"
    );
    console.log(`Found ${recentAlerts.length} alerts in last 7 days`);
    if (recentAlerts.length > 0) {
      recentAlerts.forEach((alert) => {
        console.log(
          `  - ID: ${alert.id}, Name: ${alert.alert_name}, Created: ${alert.alert_creation_time}`
        );
      });
    }

    // Test 5: Check cases and links
    console.log("\n=== TEST 5: Case-Alert Links ===");
    const [linkCount] = await connection.execute(
      "SELECT COUNT(*) as count FROM incident_management_casealertlink"
    );
    console.log(`Total case-alert links: ${linkCount[0].count}`);

    // Test 6: Unlinked vs linked alerts
    console.log("\n=== TEST 6: Linked vs Unlinked Alerts ===");
    const [unlinkedCount] = await connection.execute(
      "SELECT COUNT(DISTINCT a.id) as count FROM incident_management_alert a LEFT JOIN incident_management_casealertlink cal ON cal.alert_id = a.id WHERE cal.alert_id IS NULL"
    );
    console.log(`Unlinked alerts: ${unlinkedCount[0].count}`);

    const [linkedCount] = await connection.execute(
      "SELECT COUNT(DISTINCT a.id) as count FROM incident_management_alert a INNER JOIN incident_management_casealertlink cal ON cal.alert_id = a.id"
    );
    console.log(`Linked alerts: ${linkedCount[0].count}`);

    await connection.end();
    console.log("\n✓ Test complete!");
  } catch (error) {
    console.error("✗ Connection failed:", error.message);
    process.exit(1);
  }
}

testConnection();
