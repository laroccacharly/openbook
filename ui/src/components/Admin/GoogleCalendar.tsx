import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useGoogleCalendar } from "@/hooks/use-google-calendar"
import { paths } from "@infra/routes"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

type GoogleCalendarStatus = {
  connected: boolean
  email?: string | null
  connectedAt?: number
}

type GoogleCalendarInfo = {
  name: string
  id: string
  timeZone?: string | null
  accessRole: string
  description?: string | null
  location?: string | null
}

export function GoogleCalendar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [oauthError, setOauthError] = useState<string | null>(null)
  const { status: statusQuery, info: infoQuery, connect } = useGoogleCalendar()

  useGoogleOAuthRedirect(location.search, navigate, setOauthError)

  const busy =
    statusQuery.isFetching || infoQuery.isFetching || connect.isPending
  const error = resolveGoogleCalendarError({
    oauthError,
    connectError: connect.error,
    infoError: infoQuery.error,
    statusError: statusQuery.error,
  })
  const status = statusQuery.data ?? null

  return (
    <div className="flex flex-col gap-4">
      <GoogleCalendarActions
        busy={busy}
        connectPending={connect.isPending}
        statusConnected={status?.connected === true}
        onConnect={() => {
          setOauthError(null)
          connect.mutate()
        }}
        onRefreshStatus={() => {
          setOauthError(null)
          void statusQuery.refetch()
        }}
        onGetCalendarInfo={() => {
          setOauthError(null)
          void infoQuery.refetch()
        }}
      />
      <GoogleCalendarStatusCard status={status} busy={busy} />
      {infoQuery.data ? <GoogleCalendarInfoCard info={infoQuery.data} /> : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function useGoogleOAuthRedirect(
  search: string,
  navigate: ReturnType<typeof useNavigate>,
  setOauthError: (message: string | null) => void,
) {
  useEffect(() => {
    const params = new URLSearchParams(search)
    const google = params.get("google")
    if (google === "error") {
      setOauthError(params.get("message") ?? "Google OAuth failed")
    }
    if (google === "connected" || google === "error") {
      void navigate(paths.admin.home, { replace: true })
    }
  }, [search, navigate, setOauthError])
}

function resolveGoogleCalendarError(input: {
  oauthError: string | null
  connectError: unknown
  infoError: unknown
  statusError: unknown
}): string | null {
  if (input.oauthError !== null) {
    return input.oauthError
  }
  if (input.connectError instanceof Error) {
    return input.connectError.message
  }
  if (input.infoError instanceof Error) {
    return input.infoError.message
  }
  if (input.statusError instanceof Error) {
    return input.statusError.message
  }
  return null
}

function GoogleCalendarActions({
  busy,
  connectPending,
  statusConnected,
  onConnect,
  onRefreshStatus,
  onGetCalendarInfo,
}: {
  busy: boolean
  connectPending: boolean
  statusConnected: boolean
  onConnect: () => void
  onRefreshStatus: () => void
  onGetCalendarInfo: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={busy} onClick={onConnect}>
        {connectPending ? <Spinner data-icon="inline-start" /> : null}
        Connect Google Calendar
      </Button>
      <Button
        variant="outline"
        type="button"
        disabled={busy}
        onClick={onRefreshStatus}
      >
        Refresh status
      </Button>
      <Button
        variant="outline"
        type="button"
        disabled={busy || !statusConnected}
        onClick={onGetCalendarInfo}
      >
        Get Google Calendar info
      </Button>
    </div>
  )
}

function GoogleCalendarStatusCard({
  status,
  busy,
}: {
  status: GoogleCalendarStatus | null
  busy: boolean
}) {
  return (
    <Card size="sm" aria-live="polite">
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent>
        {status === null ? (
          <p className="text-sm text-muted-foreground">
            {busy ? "Checking…" : "Status unavailable."}
          </p>
        ) : status.connected ? (
          <dl className="grid gap-2 sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">Connection</dt>
            <dd>Connected</dd>
            <dt className="text-muted-foreground">Google account</dt>
            <dd>{status.email ?? "Unavailable"}</dd>
            <dt className="text-muted-foreground">Connected on</dt>
            <dd>{formatTimestamp(status.connectedAt)}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Not connected.</p>
        )}
      </CardContent>
    </Card>
  )
}

function GoogleCalendarInfoCard({ info }: { info: GoogleCalendarInfo }) {
  return (
    <Card size="sm" aria-live="polite">
      <CardHeader>
        <CardTitle>Primary calendar</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{info.name}</dd>
          <dt className="text-muted-foreground">Calendar ID</dt>
          <dd>{info.id}</dd>
          <dt className="text-muted-foreground">Time zone</dt>
          <dd>{info.timeZone ?? "Unavailable"}</dd>
          <dt className="text-muted-foreground">Access</dt>
          <dd>{info.accessRole}</dd>
          <dt className="text-muted-foreground">Description</dt>
          <dd>{info.description ?? "None"}</dd>
          <dt className="text-muted-foreground">Location</dt>
          <dd>{info.location ?? "None"}</dd>
        </dl>
      </CardContent>
    </Card>
  )
}

function formatTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return "Unavailable"
  }
  return new Date(timestamp * 1000).toLocaleString()
}
