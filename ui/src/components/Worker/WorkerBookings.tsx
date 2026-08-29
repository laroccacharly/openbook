import { useQuery } from "@tanstack/react-query"
import { getWorkerBookings } from "@/lib/auth/requests"
import { BookingsTable } from "@/components/Bookings"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"

export function WorkerBookings() {
  const bookings = useQuery({
    queryKey: ["worker", "bookings"] as const,
    queryFn: getWorkerBookings,
    retry: false,
  })
  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="worker-bookings-heading"
    >
      <h1
        id="worker-bookings-heading"
        className="font-heading text-2xl font-medium"
      >
        Bookings
      </h1>
      {bookings.isPending ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading bookings…
        </p>
      ) : bookings.error instanceof Error ? (
        <p className="text-sm text-destructive" role="alert">
          {bookings.error.message}
        </p>
      ) : bookings.data?.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No assigned bookings</EmptyTitle>
            <EmptyDescription>
              You have no active bookings assigned to you.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <BookingsTable bookings={bookings.data ?? []} />
      )}
    </section>
  )
}
