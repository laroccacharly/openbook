import { HomePage } from "@/components/HomePage"
import { adminRoutes } from "./admin-routes"
import { workerRoutes } from "./worker-routes"
import { RouteRedirect } from "./guards"
import { paths } from "@infra/routes"
import { useRoutes, type RouteObject } from "react-router-dom"

const routes: RouteObject[] = [
  {
    path: paths.root,
    element: <HomePage />,
  },
  ...workerRoutes,
  ...adminRoutes,
  {
    path: "*",
    element: <RouteRedirect to={paths.root} />,
  },
]

function AppRoutes() {
  return useRoutes(routes)
}

export function AppRouter() {
  return <AppRoutes />
}
