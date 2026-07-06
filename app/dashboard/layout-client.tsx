'use client';

import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { AuthProvider } from '@/lib/auth/auth-context';
import { Shield, Moon, Sun, LogOut, User, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

function HeaderContent() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <div className="flex items-center gap-3 ml-auto">
      {/* Theme Toggle */}
      {mounted && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-8 w-8 hover:bg-sidebar-accent"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* User Profile Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 px-2 gap-2 hover:bg-sidebar-accent"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src="/placeholder.svg?height=32&width=32" />
              <AvatarFallback className="text-xs">
                {user?.name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-medium leading-none">{user?.name}</span>
              <span className="text-xs text-muted-foreground">{user?.role}</span>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="text-sm font-medium">{user?.name}</span>
            <span className="text-xs text-muted-foreground">{user?.role}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/dashboard/profile')} className="cursor-pointer">
            <User className="mr-2 h-4 w-4" />
            <span>Profile Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Preferences</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer text-red-600 focus:text-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <div className="flex flex-col h-screen w-screen relative">
          {/* Fixed header dengan hamburger, logo, dan user options */}
          <div className="h-14 bg-background px-3 flex items-center gap-3 fixed top-0 left-0 right-0 z-50 border-b border-border/30 shadow-sm">
            <SidebarTrigger className="h-8 w-8 -ml-2 p-0" />
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 flex-shrink-0" />
              <span className="font-semibold text-sm hidden md:inline whitespace-nowrap">AI Driven SecOps</span>
            </div>
            <HeaderContent />
          </div>
          {/* Main layout */}
          <div className="flex flex-1 mt-14 gap-2 p-2 relative z-0">
            <AppSidebar />
            <SidebarInset className="rounded-lg overflow-hidden">
              <main className="flex-1 overflow-auto p-4">{children}</main>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    </AuthProvider>
  );
}
