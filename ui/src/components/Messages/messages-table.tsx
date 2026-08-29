import type { Message } from "@/lib/api/client"
import { DataTable, dataTableFeatures } from "@/components/data-table"
import { messagesColumns } from "./messages-columns"

type MessagesTableProps = {
  messages: Message[]
}

export function MessagesTable({ messages }: MessagesTableProps) {
  return (
    <DataTable
      features={dataTableFeatures}
      data={messages}
      columns={messagesColumns}
      defaultSorting={[{ id: "createdAt", desc: true }]}
      getRowId={(message) => String(message.id)}
    />
  )
}
