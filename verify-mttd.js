const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Threshold untuk severity
const severityThresholdMinutes = {
  "critical": 15,
  "high": 30,
  "medium": 60,
  "low": 120
};

(async () => {
  try {
    // Get 20 Stellar Cyber alerts with proper ordering
    const alerts = await prisma.alert.findMany({
      where: {
        integration: {
          name: { contains: "Stellar", mode: "insensitive" }
        }
      },
      include: { integration: true },
      orderBy: {
        timestamp: "desc"  // Add explicit ordering
      },
      take: 20
    });

    console.log(`Testing MTTD calculation for ${alerts.length} Stellar alerts\n`);

    let pass_count = 0;
    let fail_count = 0;
    let no_data_count = 0;

    alerts.forEach((alert, idx) => {
      const md = alert.metadata || {};
      const mttdMs = md.user_action_alert_to_first;
      
      // Computation logic (matching SLA dashboard computeMTTD function)
      let mttd = null;
      
      if (alert.status?.toLowerCase() !== "new") {
        if (mttdMs !== null && mttdMs !== undefined && typeof mttdMs === "number") {
          const mttdMinutes = Math.round(mttdMs / (60 * 1000));
          mttd = mttdMinutes > 0 ? mttdMinutes : null;
        }
      }
      
      // Get severity for threshold
      const severity = (md.severity || "low").toLowerCase();
      const threshold = severityThresholdMinutes[severity] || 120;
      
      // Pass/Fail
      let status = "N/A";
      if (mttd === null) {
        status = "NO DATA";
        no_data_count++;
      } else {
        const pass = mttd <= threshold;
        if (pass) {
          status = "PASS ✓";
          pass_count++;
        } else {
          status = "FAIL ✗";
          fail_count++;
        }
      }
      
      console.log(`${idx + 1}. ${alert.id.substring(0, 12)}... | Status: ${alert.status.padEnd(10)} | Severity: ${severity.padEnd(8)} | MTTD: ${mttd ? mttd.toString().padStart(3) + ' min' : 'N/A'.padStart(7)} | Threshold: ${threshold.toString().padStart(3)} min | ${status}`);
    });

    console.log(`\nSummary:`);
    console.log(`  PASS: ${pass_count}`);
    console.log(`  FAIL: ${fail_count}`);
    console.log(`  NO DATA: ${no_data_count}`);
    console.log(`  Total: ${pass_count + fail_count + no_data_count}`);

  } finally {
    await prisma.$disconnect();
  }
})();
