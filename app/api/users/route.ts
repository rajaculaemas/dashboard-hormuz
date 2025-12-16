import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all users for selection
export async function GET(request: NextRequest) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name || user.email || 'Unknown',
    }));

    return NextResponse.json({
      success: true,
      users: formattedUsers,
    });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch users' 
      },
      { status: 500 }
    );
  }
}
