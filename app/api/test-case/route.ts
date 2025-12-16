import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    console.log('[TEST] Starting test case creation');
    
    const body = await request.json();
    console.log('[TEST] Body received:', body);

    const { alertId } = body;

    if (!alertId) {
      console.log('[TEST] No alertId provided');
      return NextResponse.json(
        { error: 'alertId required' },
        { status: 400 }
      );
    }

    console.log('[TEST] Creating case for alert:', alertId);
    
    const testCase = await prisma.wazuhCase.create({
      data: {
        severity: 'High',
        description: 'Test case',
      },
    });

    console.log('[TEST] Case created:', testCase.id);

    const caseAlert = await prisma.wazuhCaseAlert.create({
      data: {
        caseId: testCase.id,
        alertId,
      },
    });

    console.log('[TEST] Alert associated:', caseAlert.id);

    return NextResponse.json({
      caseId: testCase.id,
      alertId,
      success: true,
    });
  } catch (error) {
    console.error('[TEST] Error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
