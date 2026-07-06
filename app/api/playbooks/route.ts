import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/session'

// GET /api/playbooks - list all playbooks (all authenticated users)
export async function GET(request: NextRequest) {
  try {
    console.log('[GET /api/playbooks] Starting request')
    console.log('[GET /api/playbooks] Prisma client:', typeof prisma, prisma ? 'available' : 'undefined')
    
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const search   = searchParams.get('search')   || ''
    const severity = searchParams.get('severity') || ''
    const tenant   = searchParams.get('tenant')   || ''
    const status   = searchParams.get('status')   || ''

    if (!prisma) {
      throw new Error('Prisma client is undefined')
    }
    
    if (!prisma.playbook) {
      throw new Error('Prisma playbook model is not available')
    }

    const playbooks = await prisma.playbook.findMany({
      include: { tenants: true },
      where: {
        AND: [
          search ? {
            OR: [
              { playbookId:  { contains: search, mode: 'insensitive' } },
              { ruleId:      { contains: search, mode: 'insensitive' } },
              { useCaseName: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          } : {},
          severity ? { severity: { equals: severity, mode: 'insensitive' } } : {},
          status   ? { status:   { equals: status,   mode: 'insensitive' } } : {},
          tenant   ? { tenants: { some: { tenantName: { contains: tenant, mode: 'insensitive' } } } } : {},
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ success: true, playbooks })
  } catch (error) {
    console.error('[GET /api/playbooks]', error)
    return NextResponse.json({ error: 'Failed to fetch playbooks' }, { status: 500 })
  }
}

// POST /api/playbooks - create a new playbook (administrator only)
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'administrator') {
      return NextResponse.json({ error: 'Forbidden: Administrator role required' }, { status: 403 })
    }

    const body = await request.json()
    const {
      playbookId, ruleId, useCaseName, tenants = [],
      status, severity, description, detectionType,
      logSource, eventIdType,
      mitreTechniqueIds = [], mitreTechniqueNames = [],
      mitreTacticIds = [],    mitreTacticNames = [],
      detectionLogic, howToCheck, decision, recommendation,
      descriptionTemplate, evidenceToCollect,
    } = body

    // Validate mandatory fields
    const mandatory = { playbookId, useCaseName, status, severity, description, detectionType, logSource, eventIdType, detectionLogic, howToCheck, decision, recommendation }
    const missing = Object.entries(mandatory).filter(([, v]) => !v).map(([k]) => k)
    if (missing.length) {
      return NextResponse.json({ error: `Missing mandatory fields: ${missing.join(', ')}` }, { status: 400 })
    }

    // Check duplicate playbookId
    const existing = await prisma.playbook.findUnique({ where: { playbookId } })
    if (existing) {
      return NextResponse.json({ error: `Playbook ID "${playbookId}" already exists` }, { status: 409 })
    }

    const playbook = await prisma.playbook.create({
      data: {
        playbookId, ruleId, useCaseName, status, severity, description,
        detectionType, logSource, eventIdType,
        mitreTechniqueIds, mitreTechniqueNames,
        mitreTacticIds,    mitreTacticNames,
        detectionLogic, howToCheck, decision, recommendation,
        descriptionTemplate: descriptionTemplate || null,
        evidenceToCollect:   evidenceToCollect   || null,
        createdBy: user.userId,
        tenants: {
          create: (tenants as string[]).map((name: string) => ({ tenantName: name })),
        },
      },
      include: { tenants: true },
    })

    return NextResponse.json({ success: true, playbook }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/playbooks]', error)
    return NextResponse.json({ error: 'Failed to create playbook' }, { status: 500 })
  }
}
