import { getAlerts } from "@/lib/api/wazuh"

async function main() {
  try {
    console.log("Starting manual Wazuh sync...")
    console.log("Integration ID: cmispaga200b8jwvpdct2a2i6")
    console.log("Hours back: 24 (fetch last 24 hours)")
    console.log("")

    const result = await getAlerts("cmispaga200b8jwvpdct2a2i6", {
      hoursBack: 24,
      resetCursor: true,
      indexPattern: "fortinet-posindonesia*",
      filters: {
        term: { action: "tunnel-up" },
        exists: ["remip_country_code"],
        must_not: { remip_country_code: "ID" },
      },
    })

    console.log("")
    console.log("✅ Sync completed!")
    console.log("Result:", JSON.stringify(result, null, 2))
  } catch (error) {
    console.error("❌ Sync failed:")
    console.error(error)
    process.exit(1)
  }
}

main()
