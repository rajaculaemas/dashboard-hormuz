import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/password';

// GET single QRadar case
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { caseId } = await params;

    const qradarCase = await prisma.qRadarCase.findUnique({
      where: { id: caseId },
      include: {
        alerts: {
          include: {
            alert: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        timeline: {
          orderBy: {
            timestamp: 'desc',
          },
        },
      },
    });

    if (!qradarCase) {
      return NextResponse.json(
        { error: 'QRadar case not found' },
        { status: 404 }
      );
    }

    // Calculate MTTR: from oldest alert creation to case creation
    let mttrMinutes: number | null = null;
    if (qradarCase.alerts && qradarCase.alerts.length > 0) {
      const alertCreatedTimes = qradarCase.alerts
        .filter(ca => ca.alert && ca.alert.createdAt)
        .map(ca => new Date(ca.alert.createdAt).getTime());
      
      if (alertCreatedTimes.length > 0) {
        const oldestAlertTime = Math.min(...alertCreatedTimes);
        const caseCreatedTime = new Date(qradarCase.createdAt).getTime();
        mttrMinutes = Math.max(0, Math.round((caseCreatedTime - oldestAlertTime) / 60000));
      }
    }

    return NextResponse.json({ ...qradarCase, mttrMinutes });
  } catch (error) {
    console.error('Failed to fetch QRadar case:', error);
    return NextResponse.json(
      { error: 'Failed to fetch QRadar case' },
      { status: 500 }
    );
  }
}

// PATCH - Update QRadar case
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(currentUser.role, 'update_case')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to update cases" }, { status: 403 });
    }

    const { caseId } = await params;
    const body = await request.json();
    const { status, assigneeId, severity, notes, name } = body;

    // Check if case exists
    const existingCase = await prisma.qRadarCase.findUnique({
      where: { id: caseId },
    });

    if (!existingCase) {
      return NextResponse.json(
        { error: 'QRadar case not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    const timelineEvents: any[] = [];

    if (name !== undefined && name !== existingCase.title) {
      updateData.title = name;
      timelineEvents.push({
        eventType: 'title_changed',
        description: `Case title changed from "${existingCase.title || 'No title'}" to "${name}"`,
        oldValue: existingCase.title || '',
        newValue: name,
        changedBy: currentUser.name || currentUser.email,
        changedByUserId: currentUser.userId || '',
      });
    }

    if (status !== undefined && status !== existingCase.status) {
      updateData.status = status;
      timelineEvents.push({
        eventType: 'status_changed',
        description: `Status changed from ${existingCase.status} to ${status}`,
        oldValue: existingCase.status,
        newValue: status,
        changedBy: currentUser.name || currentUser.email,
        changedByUserId: currentUser.userId || '',
      });

      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
      }
    }

    if (assigneeId !== undefined && assigneeId !== existingCase.assigneeId) {
      updateData.assigneeId = assigneeId;
      const oldAssignee = existingCase.assigneeId || 'Unassigned';
      const newAssignee = assigneeId || 'Unassigned';
      timelineEvents.push({
        eventType: 'assignee_changed',
        description: `Assignee changed from ${oldAssignee} to ${newAssignee}`,
        oldValue: oldAssignee,
        newValue: newAssignee,
        changedBy: currentUser.name || currentUser.email,
        changedByUserId: currentUser.userId || '',
      });
    }

    if (severity !== undefined && severity !== existingCase.severity) {
      updateData.severity = severity;
      timelineEvents.push({
        eventType: 'severity_changed',
        description: `Severity changed from ${existingCase.severity || 'None'} to ${severity || 'None'}`,
        oldValue: existingCase.severity || 'None',
        newValue: severity || 'None',
        changedBy: currentUser.name || currentUser.email,
        changedByUserId: currentUser.userId || '',
      });
    }

    if (notes !== undefined && notes !== existingCase.notes) {
      updateData.notes = notes;
      timelineEvents.push({
        eventType: 'notes_updated',
        description: 'Notes updated',
        changedBy: currentUser.name || currentUser.email,
        changedByUserId: currentUser.userId || '',
      });
    }

    updateData.updatedAt = new Date();

    // Update case
    const updatedCase = await prisma.qRadarCase.update({
      where: { id: caseId },
      data: updateData,
      include: {
        alerts: {
          include: {
            alert: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        timeline: {
          orderBy: {
            timestamp: 'desc',
          },
        },
      },
    });

    // Record timeline events
    if (timelineEvents.length > 0) {
      await Promise.all(
        timelineEvents.map((event) =>
          prisma.qRadarCaseTimeline.create({
            data: {
              caseId,
              ...event,
            },
          })
        )
      );
    }

    // Fetch final version with updated timeline
    const finalCase = await prisma.qRadarCase.findUnique({
      where: { id: caseId },
      include: {
        alerts: {
          include: {
            alert: true,
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        timeline: {
          orderBy: {
            timestamp: 'desc',
          },
        },
      },
    });

    // Calculate MTTR: from oldest alert creation to case creation
    let mttrMinutes: number | null = null;
    if (finalCase?.alerts && finalCase.alerts.length > 0) {
      const alertCreatedTimes = finalCase.alerts
        .filter(ca => ca.alert && ca.alert.createdAt)
        .map(ca => new Date(ca.alert.createdAt).getTime());
      
      if (alertCreatedTimes.length > 0) {
        const oldestAlertTime = Math.min(...alertCreatedTimes);
        const caseCreatedTime = new Date(finalCase.createdAt).getTime();
        mttrMinutes = Math.max(0, Math.round((caseCreatedTime - oldestAlertTime) / 60000));
      }
    }

    return NextResponse.json({ ...finalCase, mttrMinutes });
  } catch (error) {
    console.error('Error updating QRadar case:', error);
    return NextResponse.json(
      { error: 'Failed to update QRadar case' },
      { status: 500 }
    );
  }
}

// DELETE - Delete QRadar case (local only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only administrators can delete cases
    if (currentUser.role !== 'administrator') {
      return NextResponse.json(
        { error: "Forbidden: Only administrators can delete cases" },
        { status: 403 }
      );
    }

    const { caseId } = await params;

    const qradarCase = await prisma.qRadarCase.findUnique({
      where: { id: caseId },
    });

    if (!qradarCase) {
      return NextResponse.json(
        { error: 'QRadar case not found' },
        { status: 404 }
      );
    }

    // Delete case (cascade delete will handle related alerts and timeline)
    await prisma.qRadarCase.delete({
      where: { id: caseId },
    });

    return NextResponse.json({ message: 'QRadar case deleted successfully' });
  } catch (error) {
    console.error('Error deleting QRadar case:', error);
    return NextResponse.json(
      { error: 'Failed to delete QRadar case' },
      { status: 500 }
    );
  }
}
