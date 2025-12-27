#!/usr/bin/env ts-node
// Temporary launcher with relative imports to avoid path-alias resolution issues
import { getAlerts } from "../lib/api/wazuh"

async function main() {
  try {
    console.log("Starting manual Wazuh sync (temp runner)...")
    console.log("Integration ID: cmispaga200b8jwvpdct2a2i6")
    console.log("Hours back: 48 (fetch last 48 hours)")
    console.log("")

    const result = await getAlerts("cmispaga200b8jwvpdct2a2i6", {
      hoursBack: Number(process.env.HOURS_BACK || 48),
      resetCursor: true,
      indexPattern: process.env.INDEX_PATTERN || "wazuh-posindonesia_*",
      filters: undefined,
    })

    console.log("")
    console.log("✅ Sync completed (temp runner)!")
    console.log("Result:", JSON.stringify(result, null, 2))
  } catch (error) {
    console.error("❌ Sync failed:")
    console.error(error)
    process.exit(1)
  }
}

main()
