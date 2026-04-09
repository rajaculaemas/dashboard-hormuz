const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function toMs(v) {
  if (!v && v !== 0) return null
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000
  if (typeof v === 'string') {
    const n = Number(v)
    if (!Number.isNaN(n) && String(v).trim() !== '') {
      // string numeric epoch?
      return n > 1e12 ? n : n * 1000
    }
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  }
  if (v instanceof Date) return v.getTime()
  return null
}

function computeMetricMs(startMs, endMs) {
  if (!startMs || !endMs || startMs >= endMs) return null
  const diff = endMs - startMs
  return diff > 0 ? diff : null
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log('Backfill Stellar Cyber `metadata.user_action_alert_to_first`')
  console.log('Apply mode:', apply ? 'YES' : 'DRY-RUN (no DB writes)')

  // Find Stellar alerts (fetch and filter in JS to avoid JSON-path filters)
  const fetched = await prisma.alert.findMany({
    where: {
      integration: { name: { contains: 'Stellar', mode: 'insensitive' } }
    },
    take: 2000,
  })

  const candidates = fetched.filter(a => a.metadata && (a.metadata.user_action || a.metadata.user_action === true))
  console.log('Total Stellar alerts fetched (with user_action):', candidates.length, '(from total fetched:', fetched.length, ')')

  let updated = 0
  let skipped = 0
  for (const a of candidates) {
    try {
      const md = a.metadata || {}
      // skip if already has flat field set
      if (md.user_action_alert_to_first !== undefined && md.user_action_alert_to_first !== null) {
        skipped++
        continue
      }

      // parse alert time
      const alertTimeVal = md.alert_time || md.timestamp || a.timestamp || a.createdAt || a.created_at
      const alertTimeMs = toMs(alertTimeVal)
      if (!alertTimeMs) {
        console.log('[SKIP] No alert_time for', a.id, a.title)
        skipped++
        continue
      }

      // try nested user_action.alert_to_first
      const ua = md.user_action || {}
      if (ua.alert_to_first !== undefined && ua.alert_to_first !== null) {
        // Accept but also write to flat field for consistency
        const val = ua.alert_to_first
        console.log('[WILL WRITE] Precomputed nested user_action.alert_to_first ->', val, 'ms for', a.id)
        if (apply) {
          md.user_action_alert_to_first = val
          await prisma.alert.update({ where: { id: a.id }, data: { metadata: md } })
          updated++
        }
        continue
      }

      // find first action candidate (assignee change or status change)
      const history = ua.history || []
      let firstActionTimeMs = null
      if (Array.isArray(history) && history.length > 0) {
        // prefer explicit assignee-change actions
        const assignee = history.find(h => h.action && /assignee/i.test(h.action))
        if (assignee && assignee.action_time) firstActionTimeMs = toMs(assignee.action_time)
        // fallback: find first entry with action_time
        if (!firstActionTimeMs) {
          const anyAction = history.find(h => h.action_time)
          if (anyAction && anyAction.action_time) firstActionTimeMs = toMs(anyAction.action_time)
        }
      }

      let computedMs = null
      if (firstActionTimeMs) {
        computedMs = computeMetricMs(alertTimeMs, firstActionTimeMs)
      }

      // fallback to closed_time if still not computed
      if ((!computedMs || computedMs === null) && md.closed_time) {
        const closedMs = toMs(md.closed_time)
        if (closedMs) computedMs = computeMetricMs(alertTimeMs, closedMs)
      }

      // final fallback: use alert.updatedAt if closed_time/history absent
      if ((!computedMs || computedMs === null) && a.updatedAt) {
        const updatedMs = toMs(a.updatedAt)
        if (updatedMs) computedMs = computeMetricMs(alertTimeMs, updatedMs)
      }

      if (!computedMs || computedMs === null) {
        console.log('[SKIP] Could not compute MTTD for', a.id)
        skipped++
        continue
      }

      // Only write sensible numbers (>=0)
      if (computedMs >= 0) {
        console.log('[WILL WRITE] alert:', a.id, 'computed mttd (ms)=', computedMs, '-> mins=', Math.round(computedMs/60000), 'from alertTime:', new Date(alertTimeMs).toISOString())
        if (apply) {
          md.user_action_alert_to_first = computedMs
          await prisma.alert.update({ where: { id: a.id }, data: { metadata: md } })
          updated++
        }
      } else {
        console.log('[SKIP] negative mttd for', a.id)
        skipped++
      }
    } catch (e) {
      console.error('Error processing alert', a.id, e)
    }
  }

  console.log('\nDone. Updated:', updated, 'Skipped:', skipped)
  await prisma.$disconnect()
}

main()
