"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Settings2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"

export interface AlertColumn {
  id: string
  label: string
  visible: boolean
}

export const DEFAULT_COLUMNS: AlertColumn[] = [
  { id: "timestamp", label: "Timestamp", visible: true },
  { id: "title", label: "Alert Name", visible: true },
  { id: "srcip", label: "Source IP", visible: true },
  { id: "dstip", label: "Destination IP", visible: false },
  { id: "publicRemoteIp", label: "Public Remote IP", visible: false },
  { id: "assignedLocalIp", label: "Assigned Local IP", visible: false },
  { id: "responseCode", label: "Response Code", visible: false },
  { id: "domainReferer", label: "Domain (Referer)", visible: false },
  { id: "urlPayload", label: "URL Payload", visible: false },
  { id: "integration", label: "Integration", visible: true },
  { id: "mttd", label: "MTTD", visible: true },
  { id: "severity", label: "Severity", visible: false },
  { id: "status", label: "Status", visible: true },
  { id: "sourcePort", label: "Source Port", visible: false },
  { id: "destinationPort", label: "Destination Port", visible: false },
  { id: "protocol", label: "Protocol", visible: false },
  { id: "imageLoaded", label: "Image / Loaded", visible: false },
  { id: "md5", label: "MD5", visible: false },
  { id: "sha1", label: "SHA1", visible: false },
  { id: "sha256", label: "SHA256", visible: false },
  { id: "processCmdLine", label: "Command Line", visible: false },
  { id: "agentName", label: "Agent Name", visible: false },
  { id: "agentIp", label: "Agent IP", visible: false },
  { id: "rule", label: "Rule", visible: false },
  { id: "mitreTactic", label: "MITRE Tactic", visible: false },
  { id: "mitreId", label: "MITRE ID", visible: false },
  { id: "tags", label: "Tags", visible: false },
  { id: "assignee", label: "Assign", visible: true },
  // QRadar-specific columns
  { id: "qradarOffenseId", label: "Offense ID", visible: false },
  { id: "qradarOffenseSource", label: "Offense Source", visible: false },
  { id: "qradarCloseTime", label: "Closed Time", visible: false },
  { id: "qradarSourceUsername", label: "Source Username", visible: false },
  { id: "qradarApp", label: "App", visible: false },
  { id: "qradarDestHost", label: "Destination Host", visible: false },
  { id: "qradarSrcCountry", label: "Source Country", visible: false },
  { id: "qradarDstCountry", label: "Destination Country", visible: false },
  { id: "qradarNotes", label: "Comment/Notes", visible: false },
]

// Columns included in the QRadar preset (in export order)
const QRADAR_PRESET_IDS = [
  "timestamp",
  "title",
  "qradarOffenseId",
  "qradarOffenseSource",
  "srcip",
  "dstip",
  "publicRemoteIp",
  "assignedLocalIp",
  "qradarCloseTime",
  "qradarSourceUsername",
  "qradarApp",
  "destinationPort",
  "qradarDestHost",
  "qradarSrcCountry",
  "qradarDstCountry",
  "qradarNotes",
]

interface AlertColumnSelectorProps {
  columns: AlertColumn[]
  onColumnsChange: (columns: AlertColumn[]) => void
}

export function AlertColumnSelector({ columns, onColumnsChange }: AlertColumnSelectorProps) {
  const handleColumnChange = (columnId: string) => {
    const updated = columns.map((col) =>
      col.id === columnId ? { ...col, visible: !col.visible } : col
    )
    onColumnsChange(updated)
  }

  const handleToggleAll = () => {
    const allVisible = columns.every((col) => col.visible)
    const updated = columns.map((col) => ({
      ...col,
      visible: !allVisible,
    }))
    onColumnsChange(updated)
  }

  // QRadar preset: checked when ALL preset columns are currently visible
  const isQRadarPreset = QRADAR_PRESET_IDS.every(
    (id) => columns.find((c) => c.id === id)?.visible === true
  )

  const handleQRadarPreset = () => {
    if (isQRadarPreset) {
      // Uncheck: reset to DEFAULT_COLUMNS visibility
      onColumnsChange(DEFAULT_COLUMNS.map((col) => ({ ...col })))
    } else {
      // Check: show only QRadar preset columns, hide everything else
      const presetSet = new Set(QRADAR_PRESET_IDS)
      onColumnsChange(columns.map((col) => ({ ...col, visible: presetSet.has(col.id) })))
    }
  }

  const visibleCount = columns.filter((col) => col.visible).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Settings2 className="h-4 w-4 mr-2" />
          Columns ({visibleCount})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Show/Hide Columns</h4>
          <Separator />

          {/* Presets */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Presets</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="toggle-all"
                checked={columns.every((col) => col.visible)}
                onCheckedChange={handleToggleAll}
              />
              <Label htmlFor="toggle-all" className="text-sm font-medium cursor-pointer">
                All Columns
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="preset-qradar"
                checked={isQRadarPreset}
                onCheckedChange={handleQRadarPreset}
              />
              <Label htmlFor="preset-qradar" className="text-sm font-medium cursor-pointer">
                QRadar
              </Label>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {columns.map((column) => (
              <div key={column.id} className="flex items-center gap-2">
                <Checkbox
                  id={`col-${column.id}`}
                  checked={column.visible}
                  onCheckedChange={() => handleColumnChange(column.id)}
                />
                <Label
                  htmlFor={`col-${column.id}`}
                  className="text-sm cursor-pointer"
                >
                  {column.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
