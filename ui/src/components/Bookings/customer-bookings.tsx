import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import type { Booking } from "@/lib/api/client"
import { BookingsTable } from "./bookings-table"

type CustomerBookingsProps = {
  bookings: Booking[]
  loading: boolean
  error: string | null
  hasCustomer: boolean
}

export function CustomerBookings({
  bookings,
  loading,
  error,
  hasCustomer,
}: CustomerBookingsProps) {
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="customer-bookings-heading"
    >
      <h2
        id="customer-bookings-heading"
        className="font-heading text-lg font-medium"
      >
        Bookings
      </h2>
      {!hasCustomer ? (
        <p className="text-sm text-muted-foreground">
          Select a customer to see their bookings.
        </p>
      ) : loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading bookings…
        </p>
      ) : error !== null ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : bookings.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>No bookings</EmptyTitle>
            <EmptyDescription>
              This customer has no active or cancelled bookings.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <BookingsTable bookings={bookings} />
      )}
    </section>
  )
}
