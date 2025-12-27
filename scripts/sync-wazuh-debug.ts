#!/usr/bin/env ts-node
import { getAlerts } from "@/lib/api/wazuh"

async function main() {
  const indexPattern = process.env.INDEX_PATTERN || process.argv[2] || "wazuh-*"
  const hoursBack = Number(process.env.HOURS_BACK || process.argv[3] || 24)
  const targetExternalId = process.env.EXTERNAL_ID || process.argv[4]

  console.log(`Debug Wazuh sync: indexPattern=${indexPattern} hoursBack=${hoursBack} targetExternalId=${targetExternalId}`)

  try {
    const res = await getAlerts(undefined, { hoursBack, resetCursor: true, indexPattern })
    console.log(`Fetched ${res?.count ?? (res?.alerts?.length ?? 0)} alerts (stored):`)
    const list = res?.alerts || res || []
    for (const a of list.slice(0, 200)) {
      console.log(`- ${a.externalId} | ${a.timestamp}`)
    }

    if (targetExternalId) {
      const found = list.find((x: any) => (x.externalId || x.id) === targetExternalId)
      console.log(found ? `FOUND ${targetExternalId}` : `NOT FOUND ${targetExternalId}`)
      if (found) console.log(JSON.stringify(found, null, 2))
    }

    process.exit(0)
  } catch (err) {
    console.error('Error running debug sync:', err)
    process.exit(1)
  }
}

main()
