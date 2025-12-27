import prisma from '@/lib/prisma'

async function main() {
  console.log('Searching for alerts with title "[Unknown] Alert" to update from metadata.raw_es.logdesc')

  // Find candidate alerts (limit to reasonable batch size to avoid long transactions)
  const candidates = await prisma.alert.findMany({ where: { title: '[Unknown] Alert' }, take: 1000 })
  console.log(`Found ${candidates.length} candidate alerts (title='[Unknown] Alert')`)

  let updated = 0
  for (const a of candidates) {
    try {
      const meta: any = a.metadata || {}
      const raw = meta.raw_es || {}
      const logdesc = raw.logdesc || raw.log_desc || raw.logdesc || raw.logDesc
      if (logdesc && `${logdesc}`.trim().length > 0) {
        await prisma.alert.update({ where: { id: a.id }, data: { title: `${logdesc}`.trim() } })
        console.log(`Updated alert ${a.id} title -> ${logdesc}`)
        updated++
      }
    } catch (e) {
      console.error('Failed to update alert', a.id, e)
    }
  }

  console.log(`Completed. Updated ${updated} alerts.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
