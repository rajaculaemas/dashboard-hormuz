const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function formatMetric(metricMs) {
  if (metricMs === null || metricMs === undefined) return null
  if (metricMs < 0) return null
  const minutes = metricMs / (60 * 1000)
  const rounded = Math.round(minutes * 10) / 10
  return rounded >= 0.1 ? rounded : 0
}

function computeMetricMs(startMs, endMs) {
  if (!startMs || !endMs || startMs >= endMs) return null
  const diffMs = endMs - startMs
  return diffMs > 0 ? diffMs : null
}

async function main() {
  const id = process.argv[2]
  if (!id) { console.error('Usage: node compute-mttd-for-alert.js <externalIdOrId>'); process.exit(2) }
  const alert = await prisma.alert.findFirst({ where: { OR: [{ externalId: id }, { id: id }] } })
  if (!alert) { console.log('Not found'); return }
  const metadata = alert.metadata || {}
  console.log('alert timestamp:', alert.timestamp)
  console.log('metadata.alert_time:', metadata.alert_time)
  // compute as SLA logic for stellar
  let alertTime = null
  const alertTimeValue = metadata?.alert_time || alert.timestamp
  if (typeof alertTimeValue === 'string') alertTime = new Date(alertTimeValue).getTime()
  else if (typeof alertTimeValue === 'number') alertTime = alertTimeValue > 1e12 ? alertTimeValue : alertTimeValue*1000
  console.log('parsed alertTime ms:', alertTime)

  // check precomputed
  const userAction = metadata.user_action
  console.log('user_action.alert_to_first:', userAction?.alert_to_first)
  if (userAction?.alert_to_first !== undefined && userAction?.alert_to_first !== null && userAction?.alert_to_first > 0) {
    console.log('precomputed mttd (min):', formatMetric(userAction.alert_to_first))
  }

  // check history
  if (userAction?.history && Array.isArray(userAction.history)) {
    const assigneeAction = userAction.history.find(h => h.action && h.action.includes('Event assignee changed to'))
    console.log('assigneeAction:', assigneeAction)
    if (assigneeAction && assigneeAction.action_time) {
      const actionTime = typeof assigneeAction.action_time === 'number' ? assigneeAction.action_time : new Date(assigneeAction.action_time).getTime()
      console.log('actionTime ms:', actionTime)
      const mttdMs = computeMetricMs(alertTime, actionTime)
      console.log('mttdMs from assignee action:', mttdMs, 'minutes:', formatMetric(mttdMs))
    }
  }

  // fallback updatedAt usage
  if ((alert.status && (alert.status.toLowerCase() === 'closed' || alert.status.toLowerCase() === 'resolved')) && alert.updatedAt && alertTime) {
    let updatedAtMs
    if (typeof alert.updatedAt === 'number') updatedAtMs = alert.updatedAt > 1e12 ? alert.updatedAt : alert.updatedAt*1000
    else updatedAtMs = new Date(String(alert.updatedAt)).getTime()
    console.log('updatedAt ms:', updatedAtMs)
    const mttd = formatMetric(computeMetricMs(alertTime, updatedAtMs))
    console.log('mttd fallback updatedAt (min):', mttd)
  }

  // fallback earliest history action
  if (userAction?.history && Array.isArray(userAction.history) && userAction.history.length>0) {
    const firstAction = userAction.history.find(h=>h.action_time)
    console.log('firstAction:', firstAction)
    if (firstAction && firstAction.action_time) {
      const actionTime = typeof firstAction.action_time==='number'? firstAction.action_time : new Date(firstAction.action_time).getTime()
      console.log('firstActionTime ms:', actionTime)
      console.log('mttd from firstAction (min):', formatMetric(computeMetricMs(alertTime, actionTime)))
    }
  }

  // closed_time fallback
  if (metadata.closed_time && alertTime) {
    const closedMs = typeof metadata.closed_time==='number' ? (metadata.closed_time>1e12?metadata.closed_time:metadata.closed_time*1000) : new Date(String(metadata.closed_time)).getTime()
    console.log('closed_time ms:', closedMs)
    console.log('mttd from closed_time (min):', formatMetric(computeMetricMs(alertTime, closedMs)))
  }

  // Additional diagnostics: compute common candidate diffs in minutes
  const candidates = []
  const toMs = (v) => {
    if (!v) return null
    if (typeof v === 'number') return v>1e12? v : v*1000
    if (typeof v === 'string') return new Date(v).getTime()
    if (v instanceof Date) return v.getTime()
    return null
  }
  const ts = { alert_timestamp: alert.timestamp, createdAt: alert.createdAt, updatedAt: alert.updatedAt, metadata_alert_time: metadata.alert_time, metadata_closed_time: metadata.closed_time, metadata_last_timestamp: metadata.user_action_last_timestamp }
  console.log('\nCandidate timestamps:')
  Object.entries(ts).forEach(([k,v])=> console.log(k, '->', toMs(v)))

  const combos = [ ['alert_timestamp','updatedAt'], ['createdAt','updatedAt'], ['metadata_alert_time','metadata_closed_time'], ['alert_timestamp','metadata_closed_time'], ['alert_timestamp','metadata_last_timestamp'] ]
  combos.forEach(([a,b])=>{
    const am = toMs(ts[a]); const bm = toMs(ts[b]);
    const diff = (am && bm && bm>am) ? formatMetric(computeMetricMs(am,bm)) : null
    console.log(`diff ${a} -> ${b}:`, diff)
  })

  await prisma.$disconnect()
}

main()
