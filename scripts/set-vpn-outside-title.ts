import prisma from '@/lib/prisma'

async function main() {
  console.log('Finding Fortinet VPN alerts with remip_country_code != ID to set custom title...')

  // Find alerts where metadata.raw_es indicates Fortinet VPN tunnel-up and remip_country_code exists
  const candidates = await prisma.alert.findMany({
    where: {
      AND: [
        { metadata: { path: ['raw_es', 'syslog_type'], equals: 'fortinet' } },
        { metadata: { path: ['raw_es', 'action'], not: { equals: null } } },
      ],
    },
    take: 1000,
  })

  console.log(`Found ${candidates.length} alerts to inspect`)
  let updated = 0

  for (const a of candidates) {
    try {
      const meta: any = a.metadata || {}
      const raw = meta.raw_es || {}
      const action = (raw.action || '').toString().trim().toLowerCase()
      const remipCc = (raw.remip_country_code || '').toString().trim().toUpperCase()
      if (action === 'tunnel-up' && remipCc && remipCc !== 'ID') {
        if (a.title !== 'VPN Successful Outside Indonesia') {
          await prisma.alert.update({ where: { id: a.id }, data: { title: 'VPN Successful Outside Indonesia' } })
          console.log(`Updated ${a.id} -> VPN Successful Outside Indonesia`)
          updated++
        }
      }
    } catch (e) {
      console.error('Failed to process alert', a.id, e)
    }
  }

  console.log(`Done. Updated ${updated} alerts.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
