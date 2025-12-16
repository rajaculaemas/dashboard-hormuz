"use client"

import { Bell, MessageSquare, Search, BookOpen, GraduationCap, Settings, Shield, Ticket, User, Moon, Sun, LogOut, Users, BarChart3, Clock } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { useRouter } from "next/navigation"

const menuItems = [
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
    title: "SOARGPT Playbook",
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
    title: "SLA Dashboard",
    url: "/dashboard/sla",
    icon: BarChart3,
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
  const { theme, setTheme } = useTheme()
  const { user } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-4 py-2">
          <Shield className="h-6 w-6" />
          <span className="font-semibold">AI Driven SecOps</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                (!item.adminOnly || user?.role === 'administrator') && (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            {mounted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-8 w-8 p-0"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <Link href="/dashboard/profile">
            <div className="flex items-center gap-2 px-4 py-2 border-t rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
              <Avatar className="h-8 w-8">
                <AvatarImage src="/placeholder.svg?height=32&width=32" />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium truncate">{user?.name}</span>
                <span className="text-xs text-muted-foreground truncate">{user?.role}</span>
              </div>
            </div>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
