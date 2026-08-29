import type { RouteObject } from "react-router-dom"
import { paths } from "@infra/routes"
import { WorkerBookings } from "@/components/Worker/WorkerBookings"
import { WorkerChangePassword } from "@/components/Worker/WorkerChangePassword"
import { WorkerDashboard } from "@/components/Worker/WorkerDashboard"
import { WorkerLayout } from "@/components/Worker/WorkerLayout"
import { WorkerSignIn } from "@/components/Worker/WorkerSignIn"
import { RouteRedirect } from "./guards"
import { WorkerGuard } from "./worker-guard"

export const workerRoutes: RouteObject[] = [
  {
    path: paths.worker.root,
    children: [
      { index: true, element: <RouteRedirect to={paths.worker.home} /> },
      {
        element: <WorkerGuard require="guest" />,
        children: [{ path: paths.worker.signIn, element: <WorkerSignIn /> }],
      },
      {
        element: <WorkerGuard require="password-change" />,
        children: [
          {
            path: paths.worker.changePassword,
            element: <WorkerChangePassword />,
          },
        ],
      },
      {
        element: <WorkerGuard require="auth" />,
        children: [
          {
            element: <WorkerLayout />,
            children: [
              { path: paths.worker.dashboard, element: <WorkerDashboard /> },
              { path: paths.worker.bookings, element: <WorkerBookings /> },
            ],
          },
        ],
      },
    ],
  },
]
