import { Outlet } from "react-router-dom"
import { AdminSidebar } from "@/components/Admin/admin-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export function AdminLayout() {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="flex flex-1 flex-col p-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
