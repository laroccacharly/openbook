import { AdminLayout } from "@/components/Admin/AdminLayout"
import { AdminLogin } from "@/components/Admin/AdminLogin"
import { Bookings } from "@/components/Bookings"
import { Conversation } from "@/components/Conversation"
import { Chat } from "@/components/Chat"
import { Logs } from "@/components/Admin/Logs"
import { Settings } from "@/components/Admin/Settings"
import { WorkersComponent } from "@/components/Admin/WorkersComponent"
import { JobCatalog } from "@/components/Admin/JobCatalog"
import { AdminGuard, RouteRedirect } from "./guards"
import { paths } from "@infra/routes"
import type { RouteObject } from "react-router-dom"

export const adminRoutes: RouteObject[] = [
  {
    path: paths.admin.root,
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <RouteRedirect to={paths.admin.login} />,
      },
      {
        element: <AdminGuard require="guest" />,
        children: [
          {
            path: paths.admin.login,
            element: <AdminLogin />,
          },
        ],
      },
      {
        element: <AdminGuard require="auth" />,
        children: [
          {
            path: paths.admin.conversation,
            element: <Conversation />,
          },
          {
            path: paths.admin.chat,
            element: <Chat />,
          },
          {
            path: paths.admin.bookings,
            element: <Bookings />,
          },
          {
            path: paths.admin.settings,
            element: <Settings />,
          },
          {
            path: paths.admin.workers,
            element: <WorkersComponent />,
          },
          {
            path: paths.admin.jobCatalog,
            element: <JobCatalog />,
          },
          {
            path: paths.admin.logs,
            element: <Logs />,
          },
        ],
      },
    ],
  },
]
