import { NextRequest } from "next/server"
import prisma from "@/lib/prisma"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

const COLUMN_LABELS: Record<string,string> = {
  type: 'Type',
  name: 'Name',
  timestamp: 'Timestamp',
  integration: 'Integration',
  severity: 'Severity',
  metric: 'Metric (min)',
  threshold: 'Threshold (min)',
  status: 'Status',
  id: 'ID',
}

function formatCaseValue(c: any, col: string) {
  switch (col) {
    case 'type': return c.type || 'Case'
    case 'name': return c.name || c.title || ''
    case 'timestamp': return c.createdAt || c.created_at || ''
    case 'integration': return c.integration?.name || ''
    case 'severity': return c.severity || ''
    case 'metric': return c.mttrMinutes !== undefined && c.mttrMinutes !== null ? String(c.mttrMinutes) : ''
    case 'threshold': return c.threshold !== undefined && c.threshold !== null ? String(c.threshold) : ''
    case 'status': return c.status || ''
    case 'id': return c.id || ''
    default: return (c.metadata && c.metadata[col]) || ''
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const sp = url.searchParams
    const integrationId = sp.get('integrationId')
    const timeRange = sp.get('time_range') || '7d'
    const fromDate = sp.get('from_date')
    const toDate = sp.get('to_date')
    const status = sp.get('status')
    const severity = sp.get('severity')
    const columnsParam = sp.get('columns') || ''
    const columns = columnsParam ? columnsParam.split(',').map(s => s.trim()).filter(Boolean) : ['type','name','timestamp','integration','severity','metric','threshold','status']

    // Build where clause similar to app/api/cases/route.ts
    const where: any = {}
    if (integrationId && integrationId !== 'all') where.integrationId = integrationId
    if (status && status !== 'all') where.status = status
    if (severity && severity !== 'all') where.severity = severity

    const now = new Date()
    let startDate: Date | undefined
    let endDate: Date | undefined = undefined
    if (fromDate && toDate) {
      // If ISO datetimes are sent treat them as UTC datetimes, otherwise treat as YYYY-MM-DD local and convert to UTC+7 as in cases route
      if (fromDate.includes('T') || toDate.includes('T')) {
        startDate = new Date(fromDate)
        endDate = new Date(toDate)
      } else {
        const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
        const fromUTC = new Date(fromDate + 'T00:00:00Z')
        const toUTC = new Date(toDate + 'T00:00:00Z')
        startDate = new Date(fromUTC.getTime() - UTC_PLUS_7_OFFSET_MS)
        const nextDayUTC = new Date(toUTC.getTime() + 24 * 60 * 60 * 1000)
        endDate = new Date(nextDayUTC.getTime() - UTC_PLUS_7_OFFSET_MS - 1)
      }
    } else {
      switch (timeRange) {
        case '1h': startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000); break
        case '12h': startDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); break
        case '24h': startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break
        case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
        case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
        default: startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      }
      endDate = now
    }

    if (startDate && endDate) {
      where.createdAt = { gte: startDate, lte: endDate }
    }

    const cases = await prisma.case.findMany({
      where,
      include: { integration: { select: { id: true, name: true, source: true } }, relatedAlerts: { include: { alert: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Cases')

    const headerLabels = columns.map(c => COLUMN_LABELS[c] || c)
    ws.addRow(headerLabels)

    for (const c of cases) {
      const row = columns.map(col => formatCaseValue(c, col))
      ws.addRow(row)
    }

    const buffer = await wb.xlsx.writeBuffer()
    return new Response(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="cases.xlsx"',
      }
    })
  } catch (err) {
    console.error('Cases export error', err)
    return new Response(JSON.stringify({ success: false, error: 'Export failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
