"use client"

import React, { useState } from "react"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { Button } from "@/components/ui/button"
import { RefreshCw, ChevronDown } from "lucide-react"
import { Card, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface Integration {
  id: string
  name: string
  source: string
  status: string
}

interface FilterSectionProps {
  integrations: Integration[]
  integrationFilter: string[]
  onIntegrationFilterChange: (values: string[]) => void
  dateRange: { from: Date; to: Date } | undefined
  onDateRangeChange: (range: { from: Date; to: Date } | undefined) => void
  loading: boolean
  onSubmit: () => void
}

export function FilterSection({
  integrations,
  integrationFilter,
  onIntegrationFilterChange,
  dateRange,
  onDateRangeChange,
  loading,
  onSubmit,
}: FilterSectionProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  
  const isAllSelected = integrationFilter.includes("all")
  const selectedCount = integrationFilter.filter(f => f !== "all").length
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onIntegrationFilterChange(["all"])
    } else {
      onIntegrationFilterChange([])
    }
  }
  
  const handleSelectIntegration = (integrationId: string, checked: boolean) => {
    // If "all" is selected, first remove it when selecting individual integrations
    let newFilters = integrationFilter.filter(f => f !== "all")
    
    if (checked) {
      newFilters.push(integrationId)
    } else {
      newFilters = newFilters.filter(f => f !== integrationId)
    }
    
    // If all individual integrations are selected, replace with "all"
    if (newFilters.length === integrations.length) {
      onIntegrationFilterChange(["all"])
    } else {
      onIntegrationFilterChange(newFilters)
    }
  }
  
  const getDisplayLabel = () => {
    if (isAllSelected) {
      return "All Integrations"
    }
    if (selectedCount === 0) {
      return "No integration selected"
    }
    if (selectedCount === 1) {
      const selected = integrations.find(i => integrationFilter.includes(i.id))
      return selected?.name || "1 Integration"
    }
    return `${selectedCount} Integrations`
  }

  return (
    <Card>
      <CardHeader className="grid gap-4 md:grid-cols-4 md:items-end">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Integration</span>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between"
              >
                <span className="truncate">{getDisplayLabel()}</span>
                <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium cursor-pointer"
                  >
                    All Integrations
                  </label>
                </div>
                
                <div className="border-t pt-3 space-y-2">
                  {integrations.map((integration) => (
                    <div key={integration.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`integration-${integration.id}`}
                        checked={
                          isAllSelected || integrationFilter.includes(integration.id)
                        }
                        disabled={isAllSelected}
                        onCheckedChange={(checked) =>
                          handleSelectIntegration(integration.id, !!checked)
                        }
                      />
                      <label
                        htmlFor={`integration-${integration.id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {integration.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Date Range</span>
          <DateRangePicker
            from={dateRange?.from}
            to={dateRange?.to}
            allowTime={true}
            onDateRangeChange={onDateRangeChange}
          />
        </div>

        <div className="flex items-end">
          <Button 
            onClick={onSubmit} 
            disabled={loading}
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Apply Filters
          </Button>
        </div>
      </CardHeader>
    </Card>
  )
}
