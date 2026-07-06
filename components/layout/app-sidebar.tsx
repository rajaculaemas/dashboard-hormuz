"use client"

import { Bell, MessageSquare, Search, BookOpen, GraduationCap, Settings, Ticket, User, Users, BarChart3, Clock, ChevronRight } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface MenuSubItem {
  title: string
  url: string
  icon?: any
}

interface MenuItem {
  title: string
  url?: string
  icon: any
  adminOnly?: boolean
  submenu?: MenuSubItem[]
}

const menuItems: MenuItem[] = [
  {
    title: "Alert Panel",
    url: "/dashboard",
    icon: Bell,
  },
  {
    title: "Chat with SOCGPT",
    url: "/dashboard/chat",
    icon: MessageSquare,
  },
  {
    title: "Log Explorer",
    url: "/dashboard/logs",
    icon: Search,
  },
  {
    title: "Playbook",
    url: "/dashboard/playbook",
    icon: BookOpen,
  },
  {
    title: "Incident Timeline",
    url: "/dashboard/incidents",
    icon: Clock,
  },
  {
    title: "Tickets",
    url: "/dashboard/tickets",
    icon: Ticket,
  },
  {
    title: "Notifications",
    url: "/dashboard/notifications",
    icon: Bell,
  },
  {
    title: "Professional Dashboard",
    icon: BarChart3,
    submenu: [
      {
        title: "Alert and Case Distribution",
        url: "/dashboard/professional-dashboard/overview",
      },
      {
        title: "Analyst Performance",
        url: "/dashboard/professional-dashboard/analyst-performance",
      },
      {
        title: "SLA Dashboard",
        url: "/dashboard/professional-dashboard/sla",
      },
    ],
  },
  {
    title: "Training Center",
    url: "/dashboard/training",
    icon: GraduationCap,
  },
  {
    title: "Integrations",
    url: "/dashboard/integrations",
    icon: Settings,
  },
  {
    title: "User Management",
    url: "/dashboard/admin",
    icon: Users,
    adminOnly: true,
  },
]

export function AppSidebar() {
  const { user } = useAuth()
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null)

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup className="mt-14">
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                (!item.adminOnly || user?.role === 'administrator') && (
                  <div key={item.title}>
                    {item.submenu ? (
                      <Collapsible
                        open={expandedMenu === item.title}
                        onOpenChange={(open) => setExpandedMenu(open ? item.title : null)}
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton className="cursor-pointer">
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                              <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200" style={{
                                transform: expandedMenu === item.title ? 'rotate(90deg)' : 'rotate(0deg)'
                              }} />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                        </SidebarMenuItem>
                        <CollapsibleContent asChild>
                          <SidebarMenuSub>
                            {item.submenu.map((subitem) => (
                              <SidebarMenuSubItem key={subitem.title}>
                                <SidebarMenuSubButton asChild>
                                  <Link href={subitem.url}>
                                    {subitem.icon && <subitem.icon className="h-4 w-4" />}
                                    <span>{subitem.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <Link href={item.url!}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </div>
                )
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {/* Footer kosong - user info sudah di header */}
      </SidebarFooter>
    </Sidebar>
  )
}
