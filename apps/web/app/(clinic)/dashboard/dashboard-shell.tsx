'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Users, Settings, LogOut } from 'lucide-react'

const navItems = [
  { title: 'Patients', href: '/dashboard/patients', icon: Users },
  { title: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // Don't wrap login page with sidebar
  if (pathname === '/dashboard/login') {
    return <>{children}</>
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/dashboard/login')
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="flex min-h-dvh w-full">
          <Sidebar>
            <SidebarHeader className="border-b px-4 py-3">
              <span className="text-lg font-semibold text-primary">V-Health</span>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={pathname.startsWith(item.href)}
                          render={<Link href={item.href} />}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="border-t p-2">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-1 flex-col overflow-hidden">
            <header className="flex min-h-[44px] items-center gap-2 border-b px-3 py-2 sm:px-4 sm:py-3">
              <SidebarTrigger className="min-h-[44px] min-w-[44px]" />
              <h2 className="truncate font-semibold">V-Health Dashboard</h2>
            </header>
            <main className="flex-1 overflow-y-auto p-3 pb-16 sm:p-4 sm:pb-4 md:p-6">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  )
}
