import prisma from "@/lib/prisma"

async function main() {
  try {
    // Get first Stellar Cyber alert
    const alert = await prisma.alert.findFirst({
      where: {
        integration: {
          name: {
            contains: "Stellar",
            mode: "insensitive"
          }
        }
      },
      include: {
        integration: true
      }
    })

    if (!alert) {
      console.log("No Stellar Cyber alerts found")
      return
    }

    console.log("Alert ID:", alert.id)
    console.log("Alert title:", alert.title)
    console.log("Metadata exists:", !!alert.metadata)
    
    const metadata = alert.metadata as any
    console.log("User action exists:", !!metadata?.user_action)
    console.log("User action history length:", metadata?.user_action?.history?.length || 0)
    
    if (metadata?.user_action?.history) {
      console.log("\nFirst 3 actions:")
      metadata.user_action.history.slice(0, 3).forEach((h: any, i: number) => {
        console.log(`  [${i}] ${h.action} (${new Date(h.action_time > 1000000000000 ? h.action_time : h.action_time * 1000).toISOString()})`)
      })
    }
    
    // Log full metadata keys
    console.log("\nMetadata keys:", Object.keys(metadata || {}).sort())
  } catch (err) {
    console.error("Error:", err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
