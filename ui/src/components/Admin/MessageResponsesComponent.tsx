import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createSessionApiClient } from "@/lib/api/client"
import { CollapsibleListSection } from "@/components/CollapsibleListSection"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export function MessageResponsesComponent() {
  const client = useMemo(() => createSessionApiClient(), [])
  const responses = useQuery({
    queryKey: ["message-responses"],
    queryFn: () => client.listMessageResponses(),
    refetchInterval: 1_000,
    retry: false,
  })

  const error =
    responses.error instanceof Error ? responses.error.message : null

  return (
    <CollapsibleListSection
      description="Replies created for inbound messages, newest first."
      id="message-responses"
      title="Responses"
    >
      {responses.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading responses…
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {responses.data?.length ?? 0} responses
          </p>
          <ul className="flex flex-col gap-3">
            {responses.data?.map((response) => (
              <li key={response.id}>
                <Card size="sm">
                  <CardContent className="flex flex-col gap-1">
                    <p>{response.body}</p>
                    <p className="text-sm text-muted-foreground">
                      Message {response.messageId}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </CollapsibleListSection>
  )
}
