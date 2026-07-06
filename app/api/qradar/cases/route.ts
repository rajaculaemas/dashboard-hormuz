import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/password';
import { normalizeStatus } from '@/lib/utils/status-mapping';

// GET all QRadar cases with filters
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
    
    console.log("[QRadar Cases API] WHERE clause:", {
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
      prisma.qRadarCase.findMany({
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
      prisma.qRadarCase.count({ where }),
    ]);

    console.log("[QRadar Cases API] Query result:", {
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

    // Calculate MTTR (Mean Time To Response) for each case and normalize status
    // MTTR = case.createdAt - min(alert.createdAt for all case alerts)
    // This measures time from when first alert appeared to when case was created
    const casesWithMttr = cases.map((qradarCase) => {
      let mttrMinutes: number | null = null;
      let integrationId: string | null = null;
      
      if (qradarCase.alerts && qradarCase.alerts.length > 0) {
        // Find the oldest alert creation time
        const alertCreatedTimes = qradarCase.alerts
          .filter(ca => ca.alert && ca.alert.createdAt)
          .map(ca => new Date(ca.alert.createdAt).getTime());
        
        if (alertCreatedTimes.length > 0) {
          const oldestAlertTime = Math.min(...alertCreatedTimes);
          const caseCreatedTime = new Date(qradarCase.createdAt).getTime();
          
          // MTTR in minutes (from oldest alert to case creation)
          mttrMinutes = Math.max(0, Math.round((caseCreatedTime - oldestAlertTime) / 60000));
        }
        
        // Extract integrationId from first alert
        // All alerts in a case should have the same integrationId
        if (qradarCase.alerts[0]?.alert?.integrationId) {
          integrationId = qradarCase.alerts[0].alert.integrationId;
        }
      }

      // Normalize status to UI format
      const normalizedStatus = normalizeStatus(qradarCase.status, "qradar")

      return {
        ...qradarCase,
        status: normalizedStatus,
        mttrMinutes,
        integrationId,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      cases: casesWithMttr,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to fetch QRadar cases:', error);
    return NextResponse.json(
      { error: 'Failed to fetch QRadar cases' },
      { status: 500 }
    );
  }
}

// POST - Create new QRadar case
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
    
    console.log('POST /api/qradar/cases - Start');
    const body = await request.json();
    const { alertIds, caseName, description, assigneeId, severity, createdById, createdBy } = body;

    console.log('Creating QRadar case with:', { alertIds, caseName, assigneeId, severity, description, createdBy, createdById });

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
    console.log('Creating QRadarCase (step 1 - main record)...');
    
    // Generate next case number
    const lastCase = await prisma.qRadarCase.findFirst({
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

    const qradarCase = await prisma.qRadarCase.create({
      data: {
        caseNumber,
        title: caseName,
        status: 'open',
        description,
        severity: severity || null,
        assigneeId: assigneeId || null,
        createdBy,
        createdById,
        alertCount: alertIds.length,
      },
    });

    console.log(`Created QRadarCase: ${qradarCase.id}`);

    // Record timeline event
    console.log('Recording timeline event...');
    await prisma.qRadarCaseTimeline.create({
      data: {
        caseId: qradarCase.id,
        eventType: 'created',
        description: `Case created by ${createdBy || 'System'}`,
        changedBy: createdBy,
        changedByUserId: createdById,
      },
    });

    // Create case-alert associations
    console.log('Creating case alert associations...');
    const caseAlerts = await Promise.all(
      alertIds.map((alertId) =>
        prisma.qRadarCaseAlert.create({
          data: {
            caseId: qradarCase.id,
            alertId,
          },
        })
      )
    );

    console.log(`Created ${caseAlerts.length} alert associations`);

    // Fetch complete case
    const completedCase = await prisma.qRadarCase.findUnique({
      where: { id: qradarCase.id },
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

    console.log('QRadar case created successfully');

    // Calculate MTTR for newly created case
    let mttrMinutes: number | null = null;
    if (completedCase.alerts && completedCase.alerts.length > 0) {
      const alertCreatedTimes = completedCase.alerts
        .filter(ca => ca.alert && ca.alert.createdAt)
        .map(ca => new Date(ca.alert.createdAt).getTime());
      
      if (alertCreatedTimes.length > 0) {
        const oldestAlertTime = Math.min(...alertCreatedTimes);
        const caseCreatedTime = new Date(completedCase.createdAt).getTime();
        mttrMinutes = Math.max(0, Math.round((caseCreatedTime - oldestAlertTime) / 60000));
      }
    }

    return NextResponse.json({ ...completedCase, mttrMinutes }, { status: 201 });
  } catch (error) {
    console.error('Error creating QRadar case:', error);
    return NextResponse.json(
      { error: 'Failed to create QRadar case' },
      { status: 500 }
    );
  }
}
