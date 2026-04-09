import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET users, optionally filtered by position
// Query params:
//   - position: string (case-insensitive substring search, e.g., "Analyst L2")
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const position = searchParams.get('position');

    // Build where clause
    const whereClause: any = {};
    
    if (position) {
      // Filter by position (case-insensitive substring)
      whereClause.position = {
        contains: position,
        mode: 'insensitive',
      };
      // Also require Telegram Chat ID for escalation users
      whereClause.telegramChatId = {
        not: null,
      };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        position: true,
        telegramChatId: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name || user.email || 'Unknown',
      email: user.email,
      position: user.position || undefined,
      telegramChatId: user.telegramChatId || undefined,
    }));

    console.log(`[GET /api/users] position="${position}" returned ${formattedUsers.length} users`);

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
