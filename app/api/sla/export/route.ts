import { NextRequest } from "next/server"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

function formatTimestamp(ts: any) {
  if (!ts) return ''
  const d = typeof ts === 'number' ? new Date(ts) : new Date(String(ts))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatMetricForExport(row: any) {
  const m = row.metric
  if (m === null || m === undefined) return ''
  if (row.type === 'ticket') return `${Math.round(m)} min`
  if (m >= 1) return `${Math.round(m)} min`
  return `${Math.round(m * 60)} sec`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rows: any[] = Array.isArray(body.rows) ? body.rows : []
    const columns: string[] = Array.isArray(body.columns) ? body.columns : []

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('SLA')

    // header labels: if client sent labels use them, otherwise use ids
    const headers: string[] = (body.columnLabels && Array.isArray(body.columnLabels))
      ? body.columnLabels
      : columns.map(c => c)

    ws.addRow(headers)

    for (const r of rows) {
      const rowVals = columns.map((col) => {
        switch (col) {
          case 'type': return r.type || ''
          case 'name': return r.name || ''
          case 'timestamp': return formatTimestamp(r.timestamp)
          case 'integration': return r.integration || ''
          case 'severity': return r.severity || ''
          case 'metric': return formatMetricForExport(r)
          case 'threshold': return r.threshold !== undefined && r.threshold !== null ? `${r.threshold} min` : ''
          case 'status': return r.metric === null ? 'Pending' : (r.pass ? 'Pass' : 'Fail')
          case 'id': return r.id || ''
          default: return (r as any)[col] ?? ''
        }
      })
      ws.addRow(rowVals)
    }

    const buffer = await wb.xlsx.writeBuffer()
    return new Response(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="sla-export.xlsx"'
      }
    })
  } catch (err) {
    console.error('SLA export error', err)
    return new Response(JSON.stringify({ success: false, error: 'Export failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
