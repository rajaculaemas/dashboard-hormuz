import { Workbook } from "exceljs"

type TicketCase = {
  ticketId: number
  externalId: string
  name: string
  status: string
  severity: string | null
  assignee: string | null
  assigneeName: string | null
  createdAt: Date | string
  modifiedAt: Date | string | null
  mttrMinutes?: number | null
  integration?: {
    name?: string
  }
}

const STATUS_ORDER = ["New", "In Progress", "Resolved", "Closed", "Cancelled"]

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "-"

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function styleHeaderRow(row: any) {
  row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    }
    cell.alignment = { vertical: "middle", horizontal: "center" }
    cell.border = {
      top: { style: "thin", color: { argb: "FFD9D9D9" } },
      left: { style: "thin", color: { argb: "FFD9D9D9" } },
      bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
      right: { style: "thin", color: { argb: "FFD9D9D9" } },
    }
  })
}

export async function exportTicketsToExcel(cases: TicketCase[]): Promise<void> {
  const workbook = new Workbook()

  const statusCounts = cases.reduce<Record<string, number>>((acc, item) => {
    const key = item.status || "Unknown"
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const mttrValues = cases
    .map((item) => item.mttrMinutes)
    .filter((value): value is number => value !== null && value !== undefined)

  const avgMttr = mttrValues.length > 0
    ? Math.round(mttrValues.reduce((sum, val) => sum + val, 0) / mttrValues.length)
    : 0

  const summarySheet = workbook.addWorksheet("Summary")
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 34 },
    { header: "Value", key: "value", width: 24 },
  ]
  styleHeaderRow(summarySheet.getRow(1))

  summarySheet.addRow({ metric: "Total Cases", value: cases.length })
  summarySheet.addRow({ metric: "Average MTTR (minutes)", value: avgMttr })

  for (const status of STATUS_ORDER) {
    summarySheet.addRow({ metric: `Status: ${status}`, value: statusCounts[status] || 0 })
  }

  const extraStatuses = Object.keys(statusCounts).filter((status) => !STATUS_ORDER.includes(status))
  for (const status of extraStatuses) {
    summarySheet.addRow({ metric: `Status: ${status}`, value: statusCounts[status] })
  }

  const tableSheet = workbook.addWorksheet("Cases")
  tableSheet.columns = [
    { header: "Ticket ID", key: "ticketId", width: 12 },
    { header: "External ID", key: "externalId", width: 16 },
    { header: "Name", key: "name", width: 42 },
    { header: "Status", key: "status", width: 15 },
    { header: "Severity", key: "severity", width: 14 },
    { header: "Integration", key: "integration", width: 22 },
    { header: "Assignee", key: "assignee", width: 20 },
    { header: "Created At", key: "createdAt", width: 22 },
    { header: "Modified At", key: "modifiedAt", width: 22 },
    { header: "MTTR (min)", key: "mttrMinutes", width: 12 },
  ]
  styleHeaderRow(tableSheet.getRow(1))

  for (const item of cases) {
    tableSheet.addRow({
      ticketId: item.ticketId,
      externalId: item.externalId,
      name: item.name,
      status: item.status,
      severity: item.severity || "Not Set",
      integration: item.integration?.name || "-",
      assignee: item.assigneeName || item.assignee || "Unassigned",
      createdAt: formatDateTime(item.createdAt),
      modifiedAt: formatDateTime(item.modifiedAt),
      mttrMinutes: item.mttrMinutes ?? "N/A",
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([
    buffer,
  ], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  const link = document.createElement("a")
  const url = window.URL.createObjectURL(blob)
  const datePart = new Date().toISOString().split("T")[0]
  link.href = url
  link.download = `Tickets_Export_${datePart}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
