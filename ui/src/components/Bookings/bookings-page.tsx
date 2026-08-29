import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createSessionApiClient } from "@/lib/api/client"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { BookingsTable } from "./bookings-table"

export function Bookings() {
  const client = useMemo(() => createSessionApiClient(), [])
  const bookings = useQuery({
    queryKey: ["bookings"] as const,
    queryFn: () => client.listBookings(),
    retry: false,
  })

  const error = bookings.error instanceof Error ? bookings.error.message : null

  return (
    <section className="flex flex-col gap-4" aria-labelledby="bookings-heading">
      <h2 id="bookings-heading" className="font-heading text-xl font-medium">
        Bookings
      </h2>
      {bookings.isPending ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading bookings…
        </p>
      ) : error !== null ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : bookings.data?.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>No bookings</EmptyTitle>
            <EmptyDescription>
              There are no active or cancelled bookings yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <BookingsTable bookings={bookings.data ?? []} />
      )}
    </section>
  )
}
