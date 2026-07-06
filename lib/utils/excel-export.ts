import { Workbook } from 'exceljs'

interface AlertItem {
  id: string
  integrationId: string
  status: string
  severity?: string
  timestamp?: string
  updatedAt?: string
  metadata?: any
  assigned_to?: number | string
  name?: string
  title?: string
  description?: string
  externalId?: string
}

interface CaseItem {
  id: string
  externalId?: string
  integrationId: string
  status: string
  severity?: string | null
  createdAt?: string
  updatedAt?: string
  modifiedAt?: string
  alerts?: any[]
  metadata?: any
  name?: string
  assigneeName?: string | null
}

interface Integration {
  id: string
  name: string
  source: string
  status: string
}

// Helper to convert timestamp to UTC+7 date string
function toUTC7DateString(timestamp: string | number | null | undefined): string {
  if (!timestamp) return 'N/A'
  
  try {
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'N/A'
    
    const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
    const utc7Time = date.getTime() + UTC_PLUS_7_OFFSET_MS
    const utc7Date = new Date(utc7Time)
    
    const year = utc7Date.getUTCFullYear()
    const month = String(utc7Date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(utc7Date.getUTCDate()).padStart(2, '0')
    const hours = String(utc7Date.getUTCHours()).padStart(2, '0')
    const minutes = String(utc7Date.getUTCMinutes()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hours}:${minutes}`
  } catch (e) {
    return 'N/A'
  }
}

// Helper to get alert tag
function getAlertTag(alert: AlertItem): string {
  let tagValue: any = null
  
  if (Array.isArray(alert.metadata?.event_tags) && alert.metadata.event_tags.length > 0) {
    const eventTag = alert.metadata.event_tags[0]
    if (eventTag && typeof eventTag === 'object' && eventTag.tag) {
      tagValue = eventTag.tag
    }
  } else if (Array.isArray(alert.metadata?.tags) && alert.metadata.tags.length > 0) {
    tagValue = alert.metadata.tags[0]
  } else if (typeof alert.metadata?.qradar?.closing_reason_id === 'number') {
    const closingReasonId = alert.metadata.qradar.closing_reason_id
    if (closingReasonId === 104 || closingReasonId === 2) {
      tagValue = 'False Positive'
    } else if (closingReasonId === 54) {
      tagValue = 'Benign True Positive'
    } else if (closingReasonId === 105) {
      tagValue = 'True Positive'
    }
  } else if (alert.metadata?.closing_reason) {
    tagValue = alert.metadata?.closing_reason
  } else if (alert.metadata?.qradar?.closing_reason) {
    tagValue = alert.metadata?.qradar?.closing_reason
  } else if (Array.isArray(alert.metadata?.copilot_tags) && alert.metadata.copilot_tags.length > 0) {
    tagValue = alert.metadata.copilot_tags[0]
  }
  
  if (!tagValue) return 'Untagged'
  
  let tagStr = String(tagValue || '').toLowerCase().trim().replace(/\s+/g, ' ')
  
  if (tagStr === 'btp' || tagStr === 'benign true positive' || (tagStr.includes('benign') && tagStr.includes('true') && tagStr.includes('positive'))) {
    return 'Benign True Positive'
  }
  
  if (tagStr === 'tp' || (tagStr === 'true positive' && !tagStr.includes('benign'))) {
    return 'True Positive'
  }
  
  if (tagStr === 'fp' || tagStr === 'false positive') {
    return 'False Positive'
  }
  
  return 'Untagged'
}

// Helper to get shift from timestamp
function getShiftFromTimestamp(timestamp?: string): 'Shift 1' | 'Shift 2' | 'Shift 3' {
  if (!timestamp) return 'Shift 3'
  
  try {
    const date = new Date(timestamp)
    const UTC_PLUS_7_OFFSET_MS = 7 * 60 * 60 * 1000
    const utc7Time = date.getTime() + UTC_PLUS_7_OFFSET_MS
    const utc7Date = new Date(utc7Time)
    const hour = utc7Date.getUTCHours()
    
    if (hour >= 7 && hour < 15) return 'Shift 1'
    else if (hour >= 15 && hour < 23) return 'Shift 2'
    else return 'Shift 3'
  } catch (e) {
    return 'Shift 3'
  }
}

// Helper to extract alert name from various sources
function getAlertName(alert: AlertItem): string {
  // PRIMARY: title is the normalized alert name (filled from all integrations)
  if (alert.title && alert.title.trim()) return alert.title
  
  // SECONDARY: description as fallback
  if (alert.description && alert.description.trim()) return alert.description
  
  // TERTIARY: name field
  if (alert.name && alert.name.trim()) return alert.name
  
  // QUATERNARY: externalId (ID from source system)
  if (alert.externalId && alert.externalId.trim()) return alert.externalId
  
  // LAST RESORT: alert ID
  return alert.id || 'N/A'
}

// Helper to normalize case status
function normalizeCaseStatus(status: string | undefined): 'open' | 'in progress' | 'closed' {
  if (!status) return 'closed'
  const s = String(status || '').toLowerCase().trim()
  if (s === 'open' || s === 'new') return 'open'
  if (s === 'in progress' || s === 'in_progress') return 'in progress'
  return 'closed'
}

// Set column width and styling helper
function formatHeaderCell(cell: any) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
  cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
}

export async function exportDashboardToExcel(
  alerts: AlertItem[],
  cases: CaseItem[],
  integrations: Integration[],
  dateRange?: { from: Date; to: Date }
) {
  const workbook = new Workbook()

  // ===== SHEET 1: Alert & Case Distribution by Integration =====
  const sheet1 = workbook.addWorksheet('Alert & Case Distribution by Integration')
  
  // Build summary by integration
  const integrationSummary: Record<string, { alerts: AlertItem[]; cases: CaseItem[] }> = {}
  integrations.forEach(int => {
    integrationSummary[int.name] = {
      alerts: alerts.filter(a => a.integrationId === int.id),
      cases: cases.filter(c => c.integrationId === int.id)
    }
  })

  // Add headers
  const sheet1Headers = ['Tenant', 'Jumlah Alert', 'Jumlah Case', 'Timestamp', 'Alert Name', 'Case Name']
  sheet1.columns = sheet1Headers.map(h => ({ header: h, key: h.toLowerCase().replace(/\s+/g, '_'), width: 20 }))
  
  sheet1.getRow(1).eachCell((cell) => formatHeaderCell(cell))

  // Add data rows (combined alerts and cases)
  let rowNum = 2
  
  Object.entries(integrationSummary).forEach(([tenantName, { alerts: tenantAlerts, cases: tenantCases }]) => {
    const totalAlerts = tenantAlerts.length
    const totalCases = tenantCases.length

    // Add alerts rows
    tenantAlerts.forEach(alert => {
      sheet1.getRow(rowNum).values = {
        tenant: tenantName,
        jumlah_alert: totalAlerts,
        jumlah_case: totalCases,
        timestamp: toUTC7DateString(alert.timestamp || alert.updatedAt),
        alert_name: getAlertName(alert),
        case_name: ''
      }
      rowNum++
    })

    // Add cases rows
    tenantCases.forEach(caseItem => {
      sheet1.getRow(rowNum).values = {
        tenant: tenantName,
        jumlah_alert: totalAlerts,
        jumlah_case: totalCases,
        timestamp: toUTC7DateString(caseItem.createdAt || caseItem.updatedAt),
        alert_name: '',
        case_name: caseItem.name || caseItem.externalId || caseItem.id || 'N/A'
      }
      rowNum++
    })
  })

  // ===== SHEET 2: Case Status by Integration =====
  const sheet2 = workbook.addWorksheet('Case Status by Integration')
  
  const sheet2Headers = ['Tenant', 'Timestamp', 'Case Name', 'Status']
  sheet2.columns = sheet2Headers.map(h => ({ header: h, key: h.toLowerCase().replace(/\s+/g, '_'), width: 20 }))
  sheet2.getRow(1).eachCell((cell) => formatHeaderCell(cell))

  let sheet2Row = 2
  Object.entries(integrationSummary).forEach(([tenantName, { cases: tenantCases }]) => {
    tenantCases.forEach(caseItem => {
      const status = normalizeCaseStatus(caseItem.status)
      sheet2.getRow(sheet2Row).values = {
        tenant: tenantName,
        timestamp: toUTC7DateString(caseItem.createdAt || caseItem.updatedAt),
        case_name: caseItem.name || caseItem.externalId || caseItem.id || 'N/A',
        status: status
      }
      sheet2Row++
    })
  })

  // ===== SHEET 3: Alert Trend (Daily) by Tag =====
  const sheet3 = workbook.addWorksheet('Alert Trend (Daily) by Tag')
  
  const sheet3Headers = ['Tenant', 'Timestamp', 'Alert Name', 'Tag']
  sheet3.columns = sheet3Headers.map(h => ({ header: h, key: h.toLowerCase().replace(/\s+/g, '_'), width: 20 }))
  sheet3.getRow(1).eachCell((cell) => formatHeaderCell(cell))

  let sheet3Row = 2
  Object.entries(integrationSummary).forEach(([tenantName, { alerts: tenantAlerts }]) => {
    tenantAlerts.forEach(alert => {
      const tag = getAlertTag(alert)
      sheet3.getRow(sheet3Row).values = {
        tenant: tenantName,
        timestamp: toUTC7DateString(alert.timestamp || alert.updatedAt),
        alert_name: getAlertName(alert),
        tag: tag
      }
      sheet3Row++
    })
  })

  // ===== SHEET 4: Alert Distribution by Shift =====
  const sheet4 = workbook.addWorksheet('Alert Distribution by Shift')
  
  // Calculate shift distribution
  const shiftCounts = { 'Shift 1': 0, 'Shift 2': 0, 'Shift 3': 0 }
  alerts.forEach(alert => {
    const shift = getShiftFromTimestamp(alert.timestamp || alert.updatedAt)
    shiftCounts[shift]++
  })

  const sheet4Headers = ['Rata-rata jumlah Alert Shift 1', 'Rata-rata jumlah Alert Shift 2', 'Rata-rata jumlah Alert Shift 3']
  sheet4.columns = sheet4Headers.map(h => ({ header: h, key: h.toLowerCase().replace(/\s+/g, '_'), width: 30 }))
  sheet4.getRow(1).eachCell((cell) => formatHeaderCell(cell))

  // Add data row using direct cell assignment
  const dataRow = sheet4.getRow(2)
  dataRow.getCell(1).value = shiftCounts['Shift 1']
  dataRow.getCell(2).value = shiftCounts['Shift 2']
  dataRow.getCell(3).value = shiftCounts['Shift 3']

  // Format data row
  dataRow.eachCell((cell) => {
    cell.alignment = { horizontal: 'center', vertical: 'center' }
    cell.font = { bold: true, size: 14 }
  })

  // Generate and download file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Professional_Dashboard_Export_${new Date().toISOString().split('T')[0]}.xlsx`
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}
