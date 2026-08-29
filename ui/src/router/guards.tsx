import { useAdminSession } from "../hooks/use-admin-session"
import {
  Navigate,
  Outlet,
  useLocation,
  type NavigateProps,
} from "react-router-dom"
import { paths } from "@infra/routes"

type Require = "auth" | "guest"

type RedirectState = {
  from: string
}

function isRedirectState(state: unknown): state is RedirectState {
  return (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof state.from === "string"
  )
}

/** Post-login return path: relative in-app path, never back to login. */
function returnTo(state: unknown): string {
  if (!isRedirectState(state)) {
    return paths.admin.home
  }

  const { from } = state
  if (
    from === paths.admin.login ||
    !from.startsWith("/") ||
    from.startsWith("//")
  ) {
    return paths.admin.home
  }

  return from
}

export function AdminGuard({ require }: { require: Require }) {
  const { session, error } = useAdminSession()
  const location = useLocation()

  if (session === "loading") {
    return (
      <p className="text-sm text-muted-foreground">Checking admin session…</p>
    )
  }

  if (require === "auth" && session === "anonymous") {
    return (
      <Navigate
        to={paths.admin.login}
        replace
        state={{ from: location.pathname } satisfies RedirectState}
      />
    )
  }

  if (require === "guest" && session === "authenticated") {
    return <Navigate to={returnTo(location.state)} replace />
  }

  return (
    <>
      {require === "guest" && error !== null ? (
        <p className="text-sm text-destructive" role="alert">
          Unable to check the admin session.
        </p>
      ) : null}
      <Outlet />
    </>
  )
}

export function RouteRedirect({ to }: Pick<NavigateProps, "to">) {
  return <Navigate to={to} replace />
}
