// CommonJS backfill runner for Wazuh alerts
// Usage: HOURS_BACK=48 INDEX_PATTERN="wazuh-posindonesia_*" node scripts/sync-wazuh-manual.cjs

const path = require('path')
const { getAlerts } = require(path.join(__dirname, '../lib/api/wazuh'))

async function main() {
  try {
    console.log('Starting manual Wazuh sync (CommonJS runner)...')
    console.log('Integration ID: cmispaga200b8jwvpdct2a2i6')
    const hoursBack = Number(process.env.HOURS_BACK || 48)
    const indexPattern = process.env.INDEX_PATTERN || 'wazuh-posindonesia_*'
    console.log('Hours back:', hoursBack)
    console.log('Index pattern:', indexPattern)
    console.log('')

    const result = await getAlerts('cmispaga200b8jwvpdct2a2i6', {
      hoursBack,
      resetCursor: true,
      indexPattern,
      filters: undefined,
    })

    console.log('')
    console.log('✅ Sync completed (CommonJS runner)!')
    console.log('Result:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('❌ Sync failed:')
    console.error(error)
    process.exit(1)
  }
}

main()
