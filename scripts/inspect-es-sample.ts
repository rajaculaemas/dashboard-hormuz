import fetch from 'node-fetch'
import prisma from '@/lib/prisma'

async function main() {
  const argv = process.argv.slice(2)
  const integrationId = argv[0]
  const indexPattern = argv[1] || 'fortinet-posindonesia*'

  if (!integrationId) {
    console.error('Usage: tsx scripts/inspect-es-sample.ts <integrationId> [indexPattern]')
    process.exit(1)
  }

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } })
  if (!integration) {
    console.error('Integration not found:', integrationId)
    process.exit(1)
  }

  // Extract credentials (array or object)
  let credentials: Record<string, any> = {}
  if (Array.isArray(integration.credentials)) {
    const credArray = integration.credentials as any[]
    credArray.forEach((cred) => {
      if (cred && typeof cred === 'object' && 'key' in cred && 'value' in cred) credentials[cred.key] = cred.value
    })
  } else {
    credentials = (integration.credentials as Record<string, any>) || {}
  }

  const esUrl = (credentials.elasticsearch_url || '').replace(/\/+$/, '')
  const username = credentials.elasticsearch_username || ''
  const password = credentials.elasticsearch_password || ''

  if (!esUrl) {
    console.error('No elasticsearch_url found in integration credentials')
    process.exit(1)
  }

  const url = `${esUrl}/${indexPattern}/_search`
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')

  console.log('Fetching sample docs from:', url)

  const body = {
    size: 5,
    query: { match_all: {} },
    _source: true,
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify(body),
    timeout: 30000,
  } as any)

  if (!resp.ok) {
    const text = await resp.text()
    console.error('ES error:', resp.status, text.substring(0, 1000))
    process.exit(1)
  }

  const data = await resp.json()
  const hits = data?.hits?.hits || []
  console.log('Total hits (as reported):', data?.hits?.total)
  console.log('Returned docs:', hits.length)
  hits.forEach((h: any, idx: number) => {
    console.log('--- doc', idx)
    console.log('id:', h._id)
    const src = h._source || {}
    const keys = Object.keys(src).slice(0, 50)
    console.log('top fields:', keys.join(', '))
    console.log('sample snippet:', JSON.stringify(Object.fromEntries(keys.map(k => [k, src[k]])), null, 2))
  })
}

main().catch(err => { console.error(err); process.exit(1) })
