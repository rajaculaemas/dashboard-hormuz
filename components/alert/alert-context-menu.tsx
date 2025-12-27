"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

interface ContextMenuProps {
  x: number
  y: number
  columnId: string
  value: string
  onClose: () => void
  onInclude: (column: string, value: string) => void
  onExclude: (column: string, value: string) => void
}

export function AlertContextMenu({
  x,
  y,
  columnId,
  value,
  onClose,
  onInclude,
  onExclude,
}: ContextMenuProps) {
  useEffect(() => {
    const handleClick = () => onClose()
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }

    document.addEventListener("click", handleClick)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose])

  // Don't show menu if value is empty or "-"
  if (!value || value === "-" || value.trim() === "") {
    return null
  }

  return (
    <div
      className="fixed z-50 min-w-[200px] bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
        onClick={() => {
          onInclude(columnId, value)
          onClose()
        }}
      >
        <span className="text-green-600 dark:text-green-400">+</span>
        Add as Including Filter
      </button>
      <button
        className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
        onClick={() => {
          onExclude(columnId, value)
          onClose()
        }}
      >
        <span className="text-red-600 dark:text-red-400">−</span>
        Add as Excluding Filter
      </button>
    </div>
  )
}

interface AlertFilter {
  id: string
  column: string
  value: string
  type: "include" | "exclude"
}

interface ActiveFiltersProps {
  filters: AlertFilter[]
  onRemoveFilter: (id: string) => void
  onClearAll: () => void
}

export function ActiveFilters({ filters, onRemoveFilter, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null

  const getColumnLabel = (columnId: string) => {
    const labels: Record<string, string> = {
      timestamp: "Time",
      title: "Title",
      srcip: "Source IP",
      dstip: "Destination IP",
      responseCode: "Response Code",
      	domainReferer: "Domain (Referer)",
      integration: "Integration",
      mttd: "MTTD",
      severity: "Severity",
      status: "Status",
      sourcePort: "Source Port",
      destinationPort: "Destination Port",
      protocol: "Protocol",
      agentName: "Agent Name",
      agentIp: "Agent IP",
      rule: "Rule",
      mitreTactic: "MITRE Tactic",
      mitreId: "MITRE ID",
      tags: "Tags",
    }
    return labels[columnId] || columnId
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">Active Filters</h3>
        <button
          onClick={onClearAll}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
        >
          Clear All
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <div
            key={filter.id}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
              filter.type === "include"
                ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 border border-green-300 dark:border-green-700"
                : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 border border-red-300 dark:border-red-700"
            }`}
          >
            <span className="font-semibold">{filter.type === "include" ? "+" : "−"}</span>
            <span>
              {getColumnLabel(filter.column)}: <strong>{filter.value}</strong>
            </span>
            <button
              onClick={() => onRemoveFilter(filter.id)}
              className="hover:opacity-70"
              title="Remove filter"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
