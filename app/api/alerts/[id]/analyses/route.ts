import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/password';

// GET all analyses for an alert
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const analyses = await prisma.alertAnalysis.findMany({
      where: { alertId: id },
      select: {
        id: true,
        content: true,
        author: true,
        authorId: true,
        createdAt: true,
        authorUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json({
      success: true,
      analyses,
    });
  } catch (error) {
    console.error('Get analyses error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analyses' },
      { status: 500 }
    );
  }
}

// POST new analysis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, integrationId } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: 'Analysis content is required' },
        { status: 400 }
      );
    }

    // Verify alert exists
    const alert = await prisma.alert.findUnique({
      where: { id },
    });

    if (!alert) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    // Create analysis
    const analysis = await prisma.alertAnalysis.create({
      data: {
        alertId: id,
        integrationId,
        content: content.trim(),
        author: user.email,
        authorId: user.userId,
      },
      select: {
        id: true,
        content: true,
        author: true,
        authorId: true,
        createdAt: true,
        authorUser: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Create analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to create analysis' },
      { status: 500 }
    );
  }
}
