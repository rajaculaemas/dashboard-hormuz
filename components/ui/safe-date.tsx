"use client"

import { useState, useEffect } from "react"

interface SafeDateProps {
  date: string | undefined
  format?: "locale" | "iso"
  fallback?: string
}

export function SafeDate({ date, format = "locale", fallback = "Unknown time" }: SafeDateProps) {
  const [formattedDate, setFormattedDate] = useState<string>(fallback)

  useEffect(() => {
    if (!date) return

    try {
      const dateObj = new Date(date)
      if (isNaN(dateObj.getTime())) {
        setFormattedDate(fallback)
        return
      }

      if (format === "locale") {
        setFormattedDate(dateObj.toLocaleString())
      } else {
        setFormattedDate(dateObj.toISOString())
      }
    } catch (error) {
      console.error("Error formatting date:", error)
      setFormattedDate(fallback)
    }
  }, [date, format, fallback])

  return <span>{formattedDate}</span>
}
