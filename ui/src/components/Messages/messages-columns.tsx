import { createColumnHelper } from "@tanstack/react-table"
import type { Message } from "@/lib/api/client"
import {
  formatDatetime,
  SortableHeader,
  type DataTableFeatures,
} from "@/components/data-table"

const columnHelper = createColumnHelper<DataTableFeatures, Message>()

export const messagesColumns = columnHelper.columns([
  columnHelper.accessor("message", {
    header: ({ column }) => <SortableHeader label="Message" column={column} />,
    cell: ({ getValue }) => (
      <span className="font-medium whitespace-normal">{getValue()}</span>
    ),
    sortFn: "text",
  }),
  columnHelper.accessor("conversationId", {
    header: ({ column }) => (
      <SortableHeader label="Conversation" column={column} />
    ),
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{getValue()}</span>
    ),
    sortFn: "text",
  }),
  columnHelper.accessor((message) => new Date(message.createdAt * 1000), {
    id: "createdAt",
    header: ({ column }) => <SortableHeader label="Created" column={column} />,
    cell: ({ row }) => (
      <time dateTime={new Date(row.original.createdAt * 1000).toISOString()}>
        {formatDatetime(row.original.createdAt)}
      </time>
    ),
    sortFn: "datetime",
  }),
])
