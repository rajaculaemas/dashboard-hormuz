import type React from "react"

export const dynamic = 'force-dynamic';

import { DashboardLayoutClient } from './layout-client'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardLayoutClient>
      {children}
    </DashboardLayoutClient>
  )
}
