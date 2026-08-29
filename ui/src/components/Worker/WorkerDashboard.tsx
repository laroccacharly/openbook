import { useQuery } from "@tanstack/react-query"
import { getWorkerMe } from "@/lib/auth/requests"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export function WorkerDashboard() {
  const me = useQuery({
    queryKey: ["worker", "me"] as const,
    queryFn: getWorkerMe,
    retry: false,
  })
  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="worker-dashboard-heading"
    >
      <h1
        id="worker-dashboard-heading"
        className="font-heading text-2xl font-medium"
      >
        Dashboard
      </h1>
      {me.isPending ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading account…
        </p>
      ) : me.error instanceof Error ? (
        <p className="text-sm text-destructive" role="alert">
          {me.error.message}
        </p>
      ) : me.data ? (
        <Card>
          <CardHeader>
            <CardTitle>{me.data.email}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Account created{" "}
              <time dateTime={me.data.createdAt}>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "long",
                }).format(new Date(me.data.createdAt))}
              </time>
            </p>
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
