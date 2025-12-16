import prisma from "@/lib/prisma"
import { getAlerts } from "@/lib/api/stellar-cyber"

interface SyncOptions {
  integrationId?: string
  daysBack?: number
  limit?: number
  batchSize?: number
  dryRun?: boolean
}

async function syncStellarCyberAlerts(options: SyncOptions = {}) {
  const {
    integrationId,
    daysBack = 30, // Default to 30 days
    limit = 10000, // Max limit
    batchSize = 100,
    dryRun = false,
  } = options

  console.log("🚀 Starting Stellar Cyber Alert Sync")
  console.log("📋 Options:", { integrationId, daysBack, limit, batchSize, dryRun })

  try {
    // Get Stellar Cyber integration
    let integration: any
    if (integrationId) {
      integration = await prisma.integration.findUnique({
        where: { id: integrationId },
      })
    } else {
      integration = await prisma.integration.findFirst({
        where: {
          source: "stellar-cyber",
          status: "connected",
        },
      })
    }

    if (!integration) {
      console.error("❌ Stellar Cyber integration not found")
      process.exit(1)
    }

    console.log(`✓ Using integration: ${integration.name} (${integration.id})`)

    // Fetch alerts from API with pagination
    console.log(`\n📥 Fetching alerts (last ${daysBack} days)...`)
    const alerts = await getAlerts({
      integrationId: integration.id,
      limit: Math.min(limit, 10000),
      daysBack,
    })

    console.log(`✓ Fetched ${alerts.length} alerts from API`)

    if (alerts.length === 0) {
      console.log("⚠️ No alerts to sync")
      return { synced: 0, updated: 0, failed: 0 }
    }

    // Process in batches
    let synced = 0
    let updated = 0
    let failed = 0
    const failedAlerts: string[] = []

    for (let i = 0; i < alerts.length; i += batchSize) {
      const batch = alerts.slice(i, i + batchSize)
      const batchNum = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(alerts.length / batchSize)

      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} alerts)...`)

      for (const alert of batch) {
        try {
          // Validate alert ID
          const alertId = alert._id || ""
          if (!alertId) {
            console.warn(`  ⚠️ Skipping alert with no ID`)
            failed++
            continue
          }

          // Parse timestamp safely
          let alertTimestamp: Date
          if (alert.timestamp) {
            alertTimestamp = new Date(alert.timestamp)
          } else {
            alertTimestamp = new Date()
          }

          const alertData = {
            externalId: alertId,
            integrationId: integration.id,
            title: alert.title || "Unknown Alert",
            description: alert.description || undefined,
            severity: alert.severity || "Low",
            status: alert.status || "Open",
            timestamp: alertTimestamp,
            metadata: alert.metadata || {},
          }

          if (!dryRun) {
            // Try update first, if not found then create
            const existingAlert = await prisma.alert.findUnique({
              where: {
                externalId: alertId,
              },
            })

            if (existingAlert) {
              // Update existing alert
              await prisma.alert.update({
                where: { externalId: alertId },
                data: {
                  ...alertData,
                  updatedAt: new Date(),
                },
              })
              updated++
            } else {
              // Create new alert
              await prisma.alert.create({
                data: alertData,
              })
              synced++
            }
          } else {
            // Dry run: just count
            synced++
          }

          // Log progress every 10 alerts
          if ((synced + updated) % 10 === 0) {
            process.stdout.write(`\r  Progress: ${synced + updated}/${batch.length} `)
          }
        } catch (err) {
          failed++
          failedAlerts.push(alert._id || "unknown")
          console.error(`\n  ❌ Error syncing alert ${alert._id || "unknown"}:`, err instanceof Error ? err.message : String(err))
        }
      }

      console.log(`\n  ✓ Batch complete: ${synced + updated - (i / batchSize > 0 ? (synced + updated - Math.ceil(i / batchSize) * 10) : 0)} processed`)
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log("📊 SYNC SUMMARY")
    console.log("=".repeat(60))
    console.log(`Total Alerts Processed: ${alerts.length}`)
    console.log(`✓ Newly Synced: ${synced}`)
    console.log(`✓ Updated: ${updated}`)
    console.log(`❌ Failed: ${failed}`)

    if (failedAlerts.length > 0 && failedAlerts.length <= 10) {
      console.log(`\nFailed Alert IDs:`)
      failedAlerts.forEach((id) => console.log(`  - ${id}`))
    }

    if (dryRun) {
      console.log("\n⚠️ DRY RUN MODE - No changes were made to database")
    }

    // Verify sync
    console.log("\n🔍 Verifying sync...")
    const totalAlerts = await prisma.alert.count({
      where: {
        integrationId: integration.id,
      },
    })

    const closedAlerts = await prisma.alert.count({
      where: {
        integrationId: integration.id,
        status: "Closed",
      },
    })

    console.log("\n📈 Database Stats:")
    console.log(`  Total Stellar Cyber Alerts: ${totalAlerts}`)
    console.log(`  Closed Alerts: ${closedAlerts}`)

    // Check recent alerts
    const recentAlerts = await prisma.alert.findMany({
      where: {
        integrationId: integration.id,
      },
      orderBy: { timestamp: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        status: true,
        timestamp: true,
        metadata: true,
      },
    })

    console.log("\n📅 Sample Recent Alerts:")
    recentAlerts.forEach((alert, idx) => {
      const metadata = alert.metadata as any
      const hasUserAction = !!metadata?.user_action
      const alertTime = new Date(alert.timestamp).toLocaleDateString("en-CA")
      console.log(`  ${idx + 1}. [${alertTime}] ${alert.title.slice(0, 50)}... | ${alert.status} | user_action: ${hasUserAction ? "✓" : "✗"}`)
    })

    return { synced, updated, failed }
  } catch (error) {
    console.error("❌ Fatal error during sync:", error)
    process.exit(1)
  }
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2)
  const options: SyncOptions = {
    daysBack: 30,
    batchSize: 100,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--days" && args[i + 1]) {
      options.daysBack = parseInt(args[i + 1], 10)
      i++
    } else if (arg === "--integration" && args[i + 1]) {
      options.integrationId = args[i + 1]
      i++
    } else if (arg === "--batch-size" && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1], 10)
      i++
    } else if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Stellar Cyber Alert Manual Sync Script

Usage: pnpm ts-node scripts/sync-stellar-cyber-alerts.ts [options]

Options:
  --days <number>           Days back to sync (default: 30)
  --integration <id>        Specific integration ID (optional)
  --batch-size <number>     Batch size for processing (default: 100)
  --dry-run                 Preview changes without modifying database
  --help                    Show this help message

Examples:
  # Sync last 30 days
  pnpm ts-node scripts/sync-stellar-cyber-alerts.ts

  # Sync last 60 days
  pnpm ts-node scripts/sync-stellar-cyber-alerts.ts --days 60

  # Dry run to preview
  pnpm ts-node scripts/sync-stellar-cyber-alerts.ts --dry-run

  # Sync specific integration
  pnpm ts-node scripts/sync-stellar-cyber-alerts.ts --integration cmispaga200b8jwvpdct2a2i6

  # Sync 16 days (Dec 1-16) with small batch size
  pnpm ts-node scripts/sync-stellar-cyber-alerts.ts --days 16 --batch-size 50
      `)
      process.exit(0)
    }
  }

  await syncStellarCyberAlerts(options)
  process.exit(0)
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
