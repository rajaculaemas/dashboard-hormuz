"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"

interface DateRangePickerProps {
  from?: Date
  to?: Date
  onDateRangeChange?: (range: { from: Date; to: Date }) => void
  placeholder?: string
  className?: string
  allowTime?: boolean
}

export function DateRangePicker({
  from,
  to,
  onDateRangeChange,
  placeholder = "Pick a date range",
  className,
  allowTime = false,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [localFrom, setLocalFrom] = React.useState<Date | undefined>(from)
  const [localTo, setLocalTo] = React.useState<Date | undefined>(to)
  const [showFromCalendar, setShowFromCalendar] = React.useState(true)
  const [mounted, setMounted] = React.useState(false)
  const [localFromTime, setLocalFromTime] = React.useState<string>(() => {
    if (!from) return "00:00"
    return format(from, "HH:mm")
  })
  const [localToTime, setLocalToTime] = React.useState<string>(() => {
    if (!to) return "23:59"
    return format(to, "HH:mm")
  })

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    setLocalFrom(from)
    setLocalTo(to)
    if (from) setLocalFromTime(format(from, "HH:mm"))
    if (to) setLocalToTime(format(to, "HH:mm"))
  }, [from, to])

  const handleFromDate = (date: Date | undefined) => {
    if (!date) return
    setLocalFrom(date)
    if (!localTo) {
      setShowFromCalendar(false)
    }
  }

  const handleToDate = (date: Date | undefined) => {
    if (!date) return
    setLocalTo(date)
  }

  const handleApply = () => {
    if (localFrom && localTo) {
      // Apply time components when allowTime is enabled
      const applyFrom = new Date(localFrom)
      const applyTo = new Date(localTo)
      if (allowTime) {
        const [fh, fm] = (localFromTime || "00:00").split(":").map(Number)
        const [th, tm] = (localToTime || "23:59").split(":").map(Number)
        applyFrom.setHours(isNaN(fh) ? 0 : fh, isNaN(fm) ? 0 : fm, 0, 0)
        applyTo.setHours(isNaN(th) ? 23 : th, isNaN(tm) ? 59 : tm, 59, 999)
      }

      const range = {
        from: applyFrom <= applyTo ? applyFrom : applyTo,
        to: applyFrom > applyTo ? applyFrom : applyTo,
      }
      onDateRangeChange?.(range)
      setOpen(false)
    }
  }

  const handleClear = () => {
    setLocalFrom(undefined)
    setLocalTo(undefined)
    setShowFromCalendar(true)
  }

  const displayText =
    localFrom && localTo
      ? allowTime
        ? `${format(localFrom, "MMM dd, yyyy HH:mm")} - ${format(localTo, "MMM dd, yyyy HH:mm")}`
        : `${format(localFrom, "MMM dd")} - ${format(localTo, "MMM dd")}`
      : localFrom
        ? allowTime
          ? `From: ${format(localFrom, "MMM dd, yyyy HH:mm")}`
          : `From: ${format(localFrom, "MMM dd")}`
        : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-start text-left font-normal h-8 text-xs", !from && "text-muted-foreground", className)}
        >
          <Calendar className="mr-2 h-3 w-3 flex-shrink-0" />
          <span className="truncate" suppressHydrationWarning>
            {mounted ? displayText : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-3">
          {/* Date Input Fields */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="text"
                value={localFrom ? format(localFrom, "MMM dd, yyyy") : ""}
                readOnly
                placeholder="From date"
                className="h-7 text-xs cursor-pointer"
                onClick={() => setShowFromCalendar(true)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="text"
                value={localTo ? format(localTo, "MMM dd, yyyy") : ""}
                readOnly
                placeholder="To date"
                className="h-7 text-xs cursor-pointer"
                onClick={() => setShowFromCalendar(false)}
              />
            </div>
          </div>

          {allowTime && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">From time</label>
                <Input
                  type="time"
                  value={localFromTime}
                  onChange={(e) => setLocalFromTime(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">To time</label>
                <Input
                  type="time"
                  value={localToTime}
                  onChange={(e) => setLocalToTime(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>
          )}

          {/* Calendar */}
          <div className="flex justify-center">
            <style>{`
              /* Override calendar styling for alignment */
              .date-range-wrapper .rdp {
                --rdp-cell-size: 36px;
              }
              
              .date-range-wrapper table {
                border-collapse: collapse;
                width: 100%;
              }
              
              .date-range-wrapper thead {
                display: table;
                width: 100%;
              }
              
              .date-range-wrapper tbody {
                display: table;
                width: 100%;
              }
              
              .date-range-wrapper tr {
                display: table-row;
              }
              
              .date-range-wrapper th,
              .date-range-wrapper td {
                display: table-cell;
                width: 36px;
                height: 36px;
                padding: 0 !important;
                margin: 0 !important;
                text-align: center;
                vertical-align: middle;
              }
              
              .date-range-wrapper th {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                color: hsl(var(--muted-foreground));
                padding-bottom: 4px !important;
              }
              
              .date-range-wrapper button {
                width: 100%;
                height: 100%;
                padding: 0 !important;
                font-size: 12px;
              }
              
              .date-range-wrapper .rdp-caption {
                padding: 8px 0;
                margin-bottom: 8px;
              }
            `}</style>
            <div className="date-range-wrapper">
              <CalendarComponent
                mode="single"
                selected={showFromCalendar ? localFrom : localTo}
                onSelect={showFromCalendar ? handleFromDate : handleToDate}
                disabled={(date) => {
                  if (showFromCalendar && localTo) return date > localTo
                  if (!showFromCalendar && localFrom) return date < localFrom
                  return false
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleClear} className="flex-1 h-7 text-xs">
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!localFrom || !localTo}
              className="flex-1 h-7 text-xs"
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
