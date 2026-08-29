import { Outlet } from "react-router-dom"
import { WorkerSidebar } from "@/components/Worker/worker-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export function WorkerLayout() {
  return (
    <SidebarProvider>
      <WorkerSidebar />
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
