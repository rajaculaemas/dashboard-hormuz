const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function extractExternalIdFromCase(caseItem) {
  try {
    const m = caseItem.metadata || {}
    // Common places where original ticket/offense may be stored
    const candidates = [
      m._raw?.qradarOffense?.externalId,
      m._raw?.offenseId,
      m._raw?.qradarOffense?.external_id,
      m._raw?.offense?.externalId,
      m.qradar?.id,
      m.qradarOffense?.externalId,
      m.externalId,
      caseItem.ticketId,
    ]

    for (const c of candidates) {
      if (c === undefined || c === null) continue
      const n = Number(String(c).replace(/[^0-9]/g, ''))
      if (!Number.isNaN(n) && Number.isFinite(n)) return n
    }
  } catch (err) {
    // ignore
  }
  return null
}

async function migrate(integrationId) {
  try {
    const integrations = []
    if (integrationId) {
      const integ = await prisma.integration.findUnique({ where: { id: integrationId } })
      if (!integ) {
        console.error('Integration not found:', integrationId)
        return
      }
      integrations.push(integ)
    } else {
      const all = await prisma.integration.findMany({ where: { source: 'qradar' } })
      integrations.push(...all)
    }

    let created = 0
    let skipped = 0
    let updated = 0

    for (const integ of integrations) {
      console.log('Processing integration:', integ.id, integ.name)
      const cases = await prisma.case.findMany({ where: { integrationId: integ.id } })
      console.log('Found cases for integration:', cases.length)

      for (const c of cases) {
        let extId = extractExternalIdFromCase(c)
          let offenseMetadata = null

          // If we couldn't find an external id, try to match an existing alert's qradar metadata
          if (!extId) {
            try {
              // Try various candidate strings to match against alert titles/descriptions
              const candidates = []
              if (c.metadata) {
                if (c.metadata.ticket_id) candidates.push(String(c.metadata.ticket_id))
                if (c.metadata.name) candidates.push(String(c.metadata.name))
                if (c.metadata.description) candidates.push(String(c.metadata.description))
              }

              // Fallback: the case name
              candidates.push(c.name)

              // Search alerts for something containing one of the candidate strings
              for (const cand of candidates) {
                if (!cand) continue
                const match = await prisma.alert.findFirst({
                  where: {
                    integrationId: integ.id,
                    OR: [
                      { title: { contains: cand } },
                      { description: { contains: cand } },
                    ],
                  },
                })

                if (match && match.metadata && match.metadata.qradar) {
                  offenseMetadata = match.metadata.qradar
                  if (offenseMetadata.id) {
                    extId = Number(offenseMetadata.id)
                  }
                  break
                }
              }
            } catch (err) {
              // ignore matching errors
            }
          }

        // Validate extId is a positive integer
        if (!extId || Number(extId) <= 0) {
          console.log(`Skipping case ${c.id} (${c.name}) - invalid or missing externalId: ${extId}`)
          skipped++
          continue
        }

        // Check if offense already exists
        const existing = await prisma.qRadarOffense.findUnique({ where: { externalId: extId } })
        if (existing) {
          // Update status to FOLLOW_UP if not set
          if (existing.status !== 'FOLLOW_UP') {
            await prisma.qRadarOffense.update({
              where: { externalId: extId },
              data: { status: 'FOLLOW_UP', lastUpdatedTime: new Date() },
            })
            updated++
            console.log(`Updated existing offense ${extId} -> FOLLOW_UP`)
          } else {
            skipped++
          }
          continue
        }

        // Create offense from case
        try {
          // Prefer a qradar object from an alert match if available
          const metaToStore = offenseMetadata ? { qradar: offenseMetadata } : { qradar: c.metadata || {} }

          await prisma.qRadarOffense.create({
            data: {
              externalId: extId,
              title: c.name || `Offense ${extId}`,
              description: c.description || c.name || '',
              severity: c.severity || 'Medium',
              status: 'FOLLOW_UP',
              integrationId: integ.id,
              startTime: c.createdAt || new Date(),
              lastUpdatedTime: c.modifiedAt || new Date(),
              metadata: metaToStore,
            },
          })
          created++
          console.log(`Created QRadarOffense ${extId} from case ${c.id}`)
        } catch (err) {
          console.error(`Failed creating offense for case ${c.id}:`, err.message || err)
        }
      }
    }

    console.log('Migration completed: ', { created, updated, skipped })
  } catch (err) {
    console.error('Migration error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

const integrationIdArg = process.argv[2] // optional integrationId
migrate(integrationIdArg).catch(console.error)
