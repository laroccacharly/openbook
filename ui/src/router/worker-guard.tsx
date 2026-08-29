import { Navigate, Outlet, useLocation } from "react-router-dom"
import { paths } from "@infra/routes"
import { useWorkerSession } from "@/lib/auth/use-auth"

type WorkerGuardRequirement = "guest" | "auth" | "password-change"

export function WorkerGuard({ require }: { require: WorkerGuardRequirement }) {
  const session = useWorkerSession()
  const location = useLocation()

  if (session.status === "loading") {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Checking worker session…
      </p>
    )
  }
  if (session.status === "anonymous") {
    return require === "guest" ? (
      <Outlet />
    ) : (
      <Navigate
        to={paths.worker.signIn}
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  const mustChange = session.data?.mustChangePassword === true
  if (require === "guest") {
    return (
      <Navigate
        to={mustChange ? paths.worker.changePassword : paths.worker.home}
        replace
      />
    )
  }
  if (require === "password-change") {
    return mustChange ? <Outlet /> : <Navigate to={paths.worker.home} replace />
  }
  if (mustChange) {
    return <Navigate to={paths.worker.changePassword} replace />
  }
  return <Outlet />
}
