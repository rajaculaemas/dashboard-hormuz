import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/password';

// GET case details
export async function GET(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const { caseId } = params;

    const wazuhCase = await prisma.wazuhCase.findUnique({
      where: { id: caseId },
      include: {
        alerts: {
          include: {
            alert: true,
          },
          orderBy: {
            addedAt: 'desc',
          },
        },
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!wazuhCase) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(wazuhCase);
  } catch (error) {
    console.error('Failed to fetch case:', error);
    return NextResponse.json(
      { error: 'Failed to fetch case' },
      { status: 500 }
    );
  }
}

// PATCH - Update case status/assignee
export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!hasPermission(user.role, 'update_case')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to update cases" }, { status: 403 });
    }
    
    const { caseId } = params;
    const body = await request.json();
    const { status, assigneeId, description, notes } = body;

    const wazuhCase = await prisma.wazuhCase.findUnique({
      where: { id: caseId },
    });

    if (!wazuhCase) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
      }
    }
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;
    if (description !== undefined) updateData.description = description;
    if (notes !== undefined) updateData.notes = notes;

    const updatedCase = await prisma.wazuhCase.update({
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
      },
    });

    return NextResponse.json(updatedCase);
  } catch (error) {
    console.error('Failed to update case:', error);
    return NextResponse.json(
      { error: 'Failed to update case' },
      { status: 500 }
    );
  }
}

// DELETE case
export async function DELETE(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    const { caseId } = params;

    const wazuhCase = await prisma.wazuhCase.findUnique({
      where: { id: caseId },
    });

    if (!wazuhCase) {
      return NextResponse.json(
        { error: 'Case not found' },
        { status: 404 }
      );
    }

    await prisma.wazuhCase.delete({
      where: { id: caseId },
    });

    return NextResponse.json({ message: 'Case deleted successfully' });
  } catch (error) {
    console.error('Failed to delete case:', error);
    return NextResponse.json(
      { error: 'Failed to delete case' },
      { status: 500 }
    );
  }
}
