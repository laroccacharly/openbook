import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createSessionApiClient } from "@/lib/api/client"
import { CollapsibleListSection } from "@/components/CollapsibleListSection"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { MessagesTable } from "./messages-table"

export function MessagesComponent() {
  const client = useMemo(() => createSessionApiClient(), [])
  const messages = useQuery({
    queryKey: ["messages"],
    queryFn: () => client.listMessages(),
    retry: false,
  })

  const error = messages.error instanceof Error ? messages.error.message : null

  return (
    <CollapsibleListSection
      description="Inbound customer messages, newest first."
      id="messages"
      title="Messages"
    >
      {messages.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading messages…
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : messages.data?.length === 0 ? (
        <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyTitle>No messages</EmptyTitle>
            <EmptyDescription>
              There are no inbound customer messages yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <MessagesTable messages={messages.data ?? []} />
      )}
    </CollapsibleListSection>
  )
}
