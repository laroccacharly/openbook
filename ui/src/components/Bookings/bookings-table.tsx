import type { Booking } from "@/lib/api/client"
import { DataTable, dataTableFeatures } from "@/components/data-table"
import { bookingsColumns } from "./bookings-columns"

type BookingsTableProps = {
  bookings: Booking[]
}

export function BookingsTable({ bookings }: BookingsTableProps) {
  return (
    <DataTable
      features={dataTableFeatures}
      data={bookings}
      columns={bookingsColumns}
      defaultSorting={[{ id: "startDatetime", desc: true }]}
      getRowId={(booking) => String(booking.id)}
    />
  )
}
