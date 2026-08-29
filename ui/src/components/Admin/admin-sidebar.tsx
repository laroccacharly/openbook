import { NavLink, useLocation } from "react-router-dom"
import {
  BotIcon,
  CalendarDaysIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  SettingsIcon,
  WrenchIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { paths } from "@infra/routes"
import { useAdminLogout, useAdminSession } from "@/hooks/use-admin-session"
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
  {
    title: "Conversation",
    to: paths.admin.conversation,
    icon: MessageSquareIcon,
  },
  { title: "Chat", to: paths.admin.chat, icon: BotIcon },
  { title: "Bookings", to: paths.admin.bookings, icon: CalendarDaysIcon },
  { title: "Workers", to: paths.admin.workers, icon: UsersIcon },
  { title: "Job catalog", to: paths.admin.jobCatalog, icon: WrenchIcon },
  { title: "Logs", to: paths.admin.logs, icon: ScrollTextIcon },
  { title: "Settings", to: paths.admin.settings, icon: SettingsIcon },
]

function AdminSidebarFooter() {
  const { session } = useAdminSession()
  const logout = useAdminLogout()

  if (session !== "authenticated") {
    return null
  }

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <span>{logout.isPending ? "Signing out…" : "Sign out"}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {logout.error instanceof Error ? (
        <p className="px-2 text-xs text-destructive" role="alert">
          {logout.error.message}
        </p>
      ) : null}
    </SidebarFooter>
  )
}

export function AdminSidebar() {
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
      <AdminSidebarFooter />
      <SidebarRail />
    </Sidebar>
  )
}
