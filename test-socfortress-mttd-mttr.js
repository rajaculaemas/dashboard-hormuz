const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

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

// Helper: Compute metric time difference in milliseconds
function computeMetricMs(startMs, endMs) {
  if (!startMs || !endMs || startMs >= endMs) return null;
  const diff = endMs - startMs;
  return diff > 0 ? diff : null;
}

async function main() {
  console.log("🔍 Testing MTTD & MTTR Calculation for Socfortress Alerts\n");

  try {
    // Get all Socfortress/Copilot alerts
    const alerts = await prisma.alert.findMany({
      where: {
        OR: [
          { integration: { source: "socfortress" } },
          { integration: { source: "copilot" } },
        ],
      },
      include: { integration: true },
      take: 10,
    });

    console.log(`📊 Found ${alerts.length} Socfortress/Copilot alerts\n`);

    if (alerts.length === 0) {
      console.log("⚠️  No Socfortress/Copilot alerts found in database");
      await prisma.$disconnect();
      return;
    }

    let successCount = 0;
    let failCount = 0;

    // Test each alert
    for (const alert of alerts) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`📌 Alert ID: ${alert.id}`);
      console.log(`   Title: ${alert.title}`);
      console.log(`   Status: ${alert.status}`);
      console.log(`   Severity: ${alert.severity}`);
      console.log(`   Integration: ${alert.integration.name}`);

      const md = alert.metadata || {};
      const mttdMs = md.socfortress_alert_to_first;

      if (mttdMs !== null && mttdMs !== undefined) {
        const mttdMinutes = Math.round(mttdMs / (60 * 1000));
        const mttdSeconds = mttdMs / 1000;

        console.log(`\n   ✅ MTTD Available:`);
        console.log(`      - Raw (ms): ${mttdMs}`);
        console.log(`      - Minutes: ${mttdMinutes}m`);
        console.log(`      - Seconds: ${mttdSeconds.toFixed(2)}s`);

        // Check against severity thresholds
        const severity = alert.severity?.toLowerCase() || "low";
        const thresholds = {
          critical: 15,
          high: 30,
          medium: 60,
          low: 120,
        };
        const threshold = thresholds[severity] || 120;
        const slaStatus = mttdMinutes <= threshold ? "✅ PASS" : "❌ FAIL";

        console.log(`      - SLA Threshold: ${threshold}m`);
        console.log(`      - SLA Status: ${slaStatus}`);

        successCount++;
      } else {
        console.log(`\n   ⚠️  No MTTD data available`);
        console.log(`      - Raw metadata keys: ${Object.keys(md).join(", ")}`);
        failCount++;
      }

      // Additional metadata info
      if (md.socfortress) {
        console.log(`\n   📋 Socfortress Metadata:`);
        console.log(`      - alert_creation_time: ${md.socfortress.alert_creation_time}`);
        console.log(`      - time_closed: ${md.socfortress.time_closed}`);
        console.log(`      - assigned_to: ${md.socfortress.assigned_to}`);
      }

      if (md.alert_history && Array.isArray(md.alert_history)) {
        console.log(`\n   📜 Alert History (${md.alert_history.length} entries):`);
        const assignmentChanges = md.alert_history.filter(
          (h) => h.change_type === "ASSIGNMENT_CHANGE"
        );
        const firstAssignment = assignmentChanges[0];
        if (firstAssignment) {
          console.log(
            `      - First Assignment: ${firstAssignment.changed_at} → ${firstAssignment.description}`
          );
        }

        const statusChanges = md.alert_history.filter(
          (h) => h.change_type === "STATUS_CHANGE"
        );
        if (statusChanges.length > 0) {
          console.log(
            `      - Status Changes: ${statusChanges.length} (${statusChanges.map((s) => s.changed_at).join(", ")})`
          );
        }
      }
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`\n📈 Summary:`);
    console.log(`   ✅ Alerts with MTTD: ${successCount}`);
    console.log(`   ⚠️  Alerts without MTTD: ${failCount}`);
    console.log(`   📊 Coverage: ${Math.round((successCount / alerts.length) * 100)}%`);

    // Test MTTR for cases
    console.log(`\n\n🔍 Testing MTTR Calculation for Socfortress Cases\n`);

    const cases = await prisma.case.findMany({
      where: {
        OR: [
          { integration: { source: "socfortress" } },
          { integration: { source: "copilot" } },
        ],
      },
      include: { integration: true },
      take: 10,
    });

    console.log(`📊 Found ${cases.length} Socfortress/Copilot cases\n`);

    if (cases.length > 0) {
      let mttrSuccessCount = 0;

      for (const caseItem of cases) {
        console.log(`\n${"=".repeat(80)}`);
        console.log(`📁 Case ID: ${caseItem.id}`);
        console.log(`   Name: ${caseItem.name}`);
        console.log(`   Status: ${caseItem.status}`);
        console.log(`   Severity: ${caseItem.severity}`);

        const caseMd = caseItem.metadata || {};
        const mttrMinutes = caseMd.mttrMinutes || caseItem.mttrMinutes;

        if (mttrMinutes !== null && mttrMinutes !== undefined) {
          console.log(`\n   ✅ MTTR Available: ${mttrMinutes}m`);

          // Check against severity thresholds
          const severity = caseItem.severity?.toLowerCase() || "low";
          const thresholds = {
            critical: 15,
            high: 30,
            medium: 60,
            low: 120,
          };
          const threshold = thresholds[severity] || 120;
          const slaStatus = mttrMinutes <= threshold ? "✅ PASS" : "❌ FAIL (SLA Breached)";

          console.log(`      - SLA Threshold: ${threshold}m`);
          console.log(`      - SLA Status: ${slaStatus}`);
          mttrSuccessCount++;
        } else {
          console.log(`\n   ⚠️  No MTTR data available`);
          console.log(`      - Metadata: ${JSON.stringify(caseMd, null, 2)}`);
        }

        if (caseMd.socfortress) {
          console.log(`\n   📋 Socfortress Case Metadata:`);
          console.log(`      - case_creation_time: ${caseMd.socfortress.case_creation_time}`);
          console.log(`      - assigned_to: ${caseMd.socfortress.assigned_to}`);
          console.log(`      - case_status: ${caseMd.socfortress.case_status}`);
        }
      }

      console.log(`\n${"=".repeat(80)}`);
      console.log(`\n📈 Case Summary:`);
      console.log(`   ✅ Cases with MTTR: ${mttrSuccessCount}`);
      console.log(`   ⚠️  Cases without MTTR: ${cases.length - mttrSuccessCount}`);
      console.log(
        `   📊 Coverage: ${Math.round((mttrSuccessCount / cases.length) * 100)}%`
      );
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
