import { createColumnHelper } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import type { Booking } from "@/lib/api/client"
import {
  formatDatetime,
  SortableHeader,
  type DataTableFeatures,
} from "@/components/data-table"

const columnHelper = createColumnHelper<DataTableFeatures, Booking>()

export const bookingsColumns = columnHelper.columns([
  columnHelper.accessor(
    (booking) => booking.description || "Untitled booking",
    {
      id: "description",
      header: ({ column }) => (
        <SortableHeader label="Description" column={column} />
      ),
      cell: ({ getValue }) => (
        <span className="font-medium whitespace-normal">{getValue()}</span>
      ),
      sortFn: "text",
    },
  ),
  columnHelper.accessor(
    (booking) => {
      if (booking.cancelledAt !== null) {
        return "cancelled"
      }
      if (booking.rescheduledAt !== null) {
        return "rescheduled"
      }
      return "active"
    },
    {
      id: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue()
        switch (status) {
          case "cancelled":
            return <Badge variant="destructive">Cancelled</Badge>
          case "rescheduled":
            return <Badge variant="secondary">Rescheduled</Badge>
          case "active":
            return <Badge variant="outline">Active</Badge>
          default: {
            const _exhaustive: never = status
            return _exhaustive
          }
        }
      },
      sortFn: "text",
    },
  ),
  columnHelper.accessor("startDatetime", {
    header: ({ column }) => <SortableHeader label="Start" column={column} />,
    cell: ({ getValue }) => (
      <time dateTime={String(getValue())}>{formatDatetime(getValue())}</time>
    ),
    sortFn: "datetime",
  }),
  columnHelper.accessor("publicId", {
    id: "publicUrl",
    header: "Link",
    cell: ({ getValue }) => {
      const href = `/b/${getValue()}`
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2"
        >
          {href}
        </a>
      )
    },
    sortFn: "text",
  }),
])
