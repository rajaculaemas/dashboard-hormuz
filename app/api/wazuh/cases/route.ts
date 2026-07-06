import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/password';
import { normalizeStatus } from '@/lib/utils/status-mapping';

// GET all Wazuh cases with filters
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');
    const status = searchParams.get('status');
    const assigneeId = searchParams.get('assigneeId');
    const severity = searchParams.get('severity');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    const timeRange = searchParams.get('time_range');
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.max(1, Number.parseInt(searchParams.get('limit') || '10') || 10);

    const skip = (page - 1) * limit;

    const where: any = {};
    
    // Handle date filtering
    let startDate = new Date();
    let endDate = new Date();

    if (fromDate && toDate) {
      // Handle both formats:
      // 1. ISO datetime strings: "2026-05-03T17:00:00.000Z"
      // 2. Date-only strings: "2026-05-03"
      
      // Check if format is ISO datetime (contains T) or date-only (doesn't contain T)
      if (fromDate.includes('T')) {
        // ISO datetime format - parse directly
        startDate = new Date(fromDate)
        endDate = new Date(toDate)
        
        console.log("Using ISO datetime format:", {
          rawFromDate: fromDate,
          rawToDate: toDate,
          parsedFromUTC: startDate.toISOString(),
          parsedToUTC: endDate.toISOString(),
        })
      } else {
        // Date-only format (legacy): "2026-05-03"
        // Parse as UTC+7 local date and convert to UTC
        
        const fromUTC = new Date(fromDate + 'T00:00:00Z')
        const toUTC = new Date(toDate + 'T00:00:00Z')
        
        // Adjust by UTC+7 offset (subtract 7 hours to get back to UTC)
        // UTC+7 means local time is 7 hours ahead, so to convert local to UTC we subtract 7 hours
        const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
        startDate = new Date(fromUTC.getTime() - UTC_PLUS_7_OFFSET_MS)
        
        // For end date, we want the last second of that date in UTC+7
        // Which is 7 hours before the start of the next day in UTC+7
        const nextDayUTC = new Date(toUTC.getTime() + 24 * 60 * 60 * 1000)
        endDate = new Date(nextDayUTC.getTime() - UTC_PLUS_7_OFFSET_MS - 1)
        
        console.log("Using date-only format (UTC+7 conversion):", {
          rawFromDate: fromDate,
          rawToDate: toDate,
          startDateUTC: startDate.toISOString(),
          endDateUTC: endDate.toISOString(),
        })
      }
      
      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error("Invalid date range:", { startDate, endDate })
        return NextResponse.json(
          { error: 'Invalid date range provided' },
          { status: 400 }
        )
      }
      
      console.log("Final date range for query:", {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
    } else if (timeRange) {
      // Relative time range
      const now = new Date();
      switch (timeRange) {
        case '1h':
          startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);
          break;
        case '12h':
          startDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = new Date('2000-01-01');
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
      endDate = now;
    }

    where.createdAt = {
      gte: startDate,
      lte: endDate,
    };
    
    console.log("[Wazuh Cases API] WHERE clause:", {
      createdAt: where.createdAt,
      status: where.status,
      assigneeId: where.assigneeId,
      severity: where.severity,
      caseId: where.id
    })
    
    // If caseId is provided, fetch only that case
    if (caseId) {
      where.id = caseId;
    } else {
      // Otherwise apply other filters
      if (status) where.status = status;
      if (assigneeId) where.assigneeId = assigneeId;
      if (severity) where.severity = severity;
    }

    const [cases, total] = await Promise.all([
      prisma.wazuhCase.findMany({
        where,
        skip: caseId ? 0 : skip,
        take: caseId ? 1 : limit,
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
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.wazuhCase.count({ where }),
    ]);

    console.log("[Wazuh Cases API] Query result:", {
      requestParams: {
        caseId,
        status,
        assigneeId,
        severity,
        fromDate,
        toDate,
        timeRange,
        page,
        limit
      },
      resultCount: cases.length,
      totalCount: total
    })

    // Add integrationId and normalize status for each case (extracted from linked alerts)
    const casesWithIntegration = cases.map((wazuhCase) => {
      let integrationId: string | null = null
      
      // Extract integrationId from first alert
      // All alerts in a case should have the same integrationId
      if (wazuhCase.alerts && wazuhCase.alerts.length > 0) {
        if (wazuhCase.alerts[0]?.alert?.integrationId) {
          integrationId = wazuhCase.alerts[0].alert.integrationId
        }
      }

      // Normalize status to UI format
      const normalizedStatus = normalizeStatus(wazuhCase.status, "wazuh")

      return {
        ...wazuhCase,
        status: normalizedStatus,
        integrationId,
      }
    })

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      cases: casesWithIntegration,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to fetch Wazuh cases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Wazuh cases' },
      { status: 500 }
    );
  }
}

// POST - Create new Wazuh case
export async function POST(request: NextRequest) {
  try {
    // Check authentication and permission
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!hasPermission(user.role, 'create_case')) {
      return NextResponse.json({ error: "Forbidden: You don't have permission to create cases" }, { status: 403 });
    }
    
    console.log('POST /api/wazuh/cases - Start');
    const body = await request.json();
    const { alertIds, caseName, description, assigneeId, createdById, createdBy } = body;

    console.log('Creating case with:', { alertIds, caseName, assigneeId, description, createdBy, createdById });

    if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
      console.log('Invalid alertIds');
      return NextResponse.json(
        { error: 'At least one alert ID is required' },
        { status: 400 }
      );
    }

    // Verify all alerts exist
    console.log('Verifying alerts:', alertIds);
    const alerts = await prisma.alert.findMany({
      where: {
        id: {
          in: alertIds,
        },
      },
      select: { id: true },
    });

    console.log(`Found ${alerts.length} of ${alertIds.length} alerts`);

    if (alerts.length !== alertIds.length) {
      console.log('Some alerts not found');
      return NextResponse.json(
        { error: 'One or more alerts not found' },
        { status: 404 }
      );
    }

    // Create case first without alerts
    console.log('Creating WazuhCase (step 1 - main record)...');
    
    // Generate next case number
    const lastCase = await prisma.wazuhCase.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
    });

    let nextNumber = 1;
    if (lastCase) {
      try {
        const lastNum = parseInt(lastCase.caseNumber, 10);
        nextNumber = lastNum + 1;
      } catch (e) {
        nextNumber = 1;
      }
    }
    const caseNumber = nextNumber.toString().padStart(4, '0');
    console.log(`Generated case number: ${caseNumber}`);

    const wazuhCase = await prisma.wazuhCase.create({
      data: {
        caseNumber,
        title: caseName,
        status: 'open',
        severity: null, // Will be set via update status
        description: description || null,
        assigneeId: assigneeId || null,
        createdById: createdById || null,
        createdBy: createdBy || 'System',
        alertCount: alertIds.length,
      },
    });

    console.log('Case created successfully:', wazuhCase.id);

    // Record initial "Case Created" timeline event
    await prisma.wazuhCaseTimeline.create({
      data: {
        caseId: wazuhCase.id,
        eventType: 'created',
        description: `Case created by ${createdBy || 'System'} with ${alertIds.length} alert(s)`,
        changedBy: createdBy || 'System',
        changedByUserId: createdById || null,
        timestamp: wazuhCase.createdAt,
      },
    });

    // Associate alerts
    console.log('Associating alerts (step 2)...');
    await prisma.wazuhCaseAlert.createMany({
      data: alertIds.map((alertId: string) => ({
        caseId: wazuhCase.id,
        alertId,
      })),
    });

    console.log('Alerts associated successfully');

    // Fetch complete case
    console.log('Fetching complete case (step 3)...');
    const completedCase = await prisma.wazuhCase.findUnique({
      where: { id: wazuhCase.id },
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

    console.log('Complete case fetched:', completedCase?.id);
    return NextResponse.json(completedCase, { status: 201 });
  } catch (error) {
    console.error('Failed to create Wazuh case:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error details:', errorMessage);
    return NextResponse.json(
      { error: `Failed to create Wazuh case: ${errorMessage}` },
      { status: 500 }
    );
  }
}
