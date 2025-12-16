import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // Find first Stellar alert
  const alert = await prisma.alert.findFirst({
    where: {
      integration: {
        name: { contains: "Stellar", mode: "insensitive" }
      }
    },
    include: {
      integration: true
    }
  })

  if (!alert) {
    console.log("No Stellar alerts found in database")
    process.exit(0)
  }

  const md = alert.metadata
  console.log("Found Stellar alert:", alert.id.substring(0, 20) + "...")
  console.log("Alert title:", alert.title)
  console.log("\nMetadata structure:")
  console.log("  - Keys:", Object.keys(md || {}).sort())
  console.log("  - Has user_action:", !!(md as any)?.user_action)
  
  if ((md as any)?.user_action) {
    console.log("  - User action keys:", Object.keys((md as any).user_action).sort())
    console.log("  - History length:", (md as any).user_action.history?.length || 0)
    if ((md as any).user_action.history?.length > 0) {
      console.log("  - First action:", (md as any).user_action.history[0].action)
      console.log("  - Last action:", (md as any).user_action.history[(md as any).user_action.history.length - 1].action)
    }
  }

  // Check alert_time
  console.log("\nTimestamp fields:")
  console.log("  - alert.timestamp:", alert.timestamp)
  console.log("  - alert.metadata.timestamp:", (md as any)?.timestamp)
  console.log("  - alert.metadata.alert_time:", (md as any)?.alert_time)

  process.exit(0)
}

main()
