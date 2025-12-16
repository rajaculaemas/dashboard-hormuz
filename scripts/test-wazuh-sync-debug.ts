import { getAlerts } from "@/lib/api/wazuh"

async function main() {
  try {
    console.log("Starting manual Wazuh sync...")
    console.log("Current time:", new Date().toISOString())
    const result = await getAlerts()
    console.log("\nSync completed")
    console.log("Result:", JSON.stringify(result, null, 2))
  } catch (error: any) {
    console.error("Error:", error.message)
    console.error(error.stack)
  }
}

main()
