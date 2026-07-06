import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth/session'

// PUT /api/playbooks/[id] - update a playbook (administrator only)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'administrator') {
      return NextResponse.json({ error: 'Forbidden: Administrator role required' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const {
      ruleId, useCaseName, tenants = [],
      status, severity, description, detectionType,
      logSource, eventIdType,
      mitreTechniqueIds = [], mitreTechniqueNames = [],
      mitreTacticIds = [],    mitreTacticNames = [],
      detectionLogic, howToCheck, decision, recommendation,
      descriptionTemplate, evidenceToCollect,
    } = body

    // Validate mandatory fields
    const mandatory = { useCaseName, status, severity, description, detectionType, logSource, eventIdType, detectionLogic, howToCheck, decision, recommendation }
    const missing = Object.entries(mandatory).filter(([, v]) => !v).map(([k]) => k)
    if (missing.length) {
      return NextResponse.json({ error: `Missing mandatory fields: ${missing.join(', ')}` }, { status: 400 })
    }

    const existing = await prisma.playbook.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
    }

    // Delete existing tenant associations and recreate
    await prisma.playbookTenant.deleteMany({ where: { playbookId: id } })

    const playbook = await prisma.playbook.update({
      where: { id },
      data: {
        ruleId, useCaseName, status, severity, description,
        detectionType, logSource, eventIdType,
        mitreTechniqueIds, mitreTechniqueNames,
        mitreTacticIds,    mitreTacticNames,
        detectionLogic, howToCheck, decision, recommendation,
        descriptionTemplate: descriptionTemplate || null,
        evidenceToCollect:   evidenceToCollect   || null,
        tenants: {
          create: (tenants as string[]).map((name: string) => ({ tenantName: name })),
        },
      },
      include: { tenants: true },
    })

    return NextResponse.json({ success: true, playbook })
  } catch (error) {
    console.error('[PUT /api/playbooks/:id]', error)
    return NextResponse.json({ error: 'Failed to update playbook' }, { status: 500 })
  }
}

// DELETE /api/playbooks/[id] - delete a playbook (administrator only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (user.role !== 'administrator') {
      return NextResponse.json({ error: 'Forbidden: Administrator role required' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.playbook.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
    }

    await prisma.playbook.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'Playbook deleted' })
  } catch (error) {
    console.error('[DELETE /api/playbooks/:id]', error)
    return NextResponse.json({ error: 'Failed to delete playbook' }, { status: 500 })
  }
}

// GET /api/playbooks/[id] - get single playbook
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const playbook = await prisma.playbook.findUnique({
      where: { id },
      include: { tenants: true },
    })

    if (!playbook) {
      return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, playbook })
  } catch (error) {
    console.error('[GET /api/playbooks/:id]', error)
    return NextResponse.json({ error: 'Failed to fetch playbook' }, { status: 500 })
  }
}
