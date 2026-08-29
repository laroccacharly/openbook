import { NavLink, useLocation } from "react-router-dom"
import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  type LucideIcon,
} from "lucide-react"
import { paths } from "@infra/routes"
import { useWorkerSession, useWorkerSignOut } from "@/lib/auth/use-auth"
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
  SidebarRail,
} from "@/components/ui/sidebar"

const navItems: {
  title: string
  to: string
  icon: LucideIcon
}[] = [
  { title: "Dashboard", to: paths.worker.dashboard, icon: LayoutDashboardIcon },
  { title: "Bookings", to: paths.worker.bookings, icon: CalendarDaysIcon },
]

function WorkerSidebarFooter() {
  const { status } = useWorkerSession()
  const signOut = useWorkerSignOut()

  if (status !== "authenticated") {
    return null
  }

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            <span>{signOut.isPending ? "Signing out…" : "Sign out"}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {signOut.error instanceof Error ? (
        <p className="px-2 text-xs text-destructive" role="alert">
          {signOut.error.message}
        </p>
      ) : null}
    </SidebarFooter>
  )
}

export function WorkerSidebar() {
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <span className="font-semibold">Book</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    render={<NavLink to={item.to} />}
                    isActive={location.pathname === item.to}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <WorkerSidebarFooter />
      <SidebarRail />
    </Sidebar>
  )
}
