import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useMemo, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ChatUIMessage } from "@worker/src/chat/tools"
import { createSessionApiClient, type ApiClient } from "@/lib/api/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import { ChatMessage } from "./chat-message"
import { PromptForm } from "./prompt-form"

const adminChatQueryKey = ["admin-chat"] as const

function ChatHeader({ action }: { action?: ReactNode }) {
  return (
    <CardHeader className="items-center border-b py-4">
      <CardTitle>Chat</CardTitle>
      {action ? (
        <CardAction className="self-center">{action}</CardAction>
      ) : null}
    </CardHeader>
  )
}

export function Chat() {
  const client = useMemo(() => createSessionApiClient(), [])
  const history = useQuery({
    queryKey: adminChatQueryKey,
    queryFn: () => client.getAdminChat(),
    retry: false,
  })

  return (
    <Card className="flex h-[min(80rem,calc(100svh-8rem))] flex-col gap-0 py-0">
      {history.isPending ? (
        <>
          <ChatHeader />
          <CardContent className="flex min-h-0 flex-1 items-center justify-center p-6">
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Loading chat…
            </p>
          </CardContent>
        </>
      ) : history.data === undefined ? (
        <>
          <ChatHeader />
          <CardContent className="p-6">
            <Alert variant="destructive">
              <AlertTitle>Could not load chat</AlertTitle>
              <AlertDescription>
                {history.error instanceof Error
                  ? history.error.message
                  : "Something went wrong. Please try again."}
              </AlertDescription>
            </Alert>
          </CardContent>
        </>
      ) : (
        <ChatSession client={client} initialMessages={history.data.messages} />
      )}
    </Card>
  )
}

function ChatSession({
  client,
  initialMessages,
}: {
  client: ApiClient
  initialMessages: ChatUIMessage[]
}) {
  const queryClient = useQueryClient()
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        credentials: "include",
      }),
    [],
  )
  const { messages, sendMessage, setMessages, status, stop, error } =
    useChat<ChatUIMessage>({
      id: "admin",
      messages: initialMessages,
      transport,
    })
  const reset = useMutation({
    mutationFn: () => client.resetAdminChat(),
    onSuccess: (data) => {
      setMessages([])
      queryClient.setQueryData(adminChatQueryKey, data)
    },
  })

  const isBusy = status === "submitted" || status === "streaming"
  const lastMessage = messages.at(-1)
  const resetError = reset.error === null ? null : reset.error.message

  return (
    <>
      <ChatHeader
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy || reset.isPending || messages.length === 0}
            onClick={() => {
              reset.mutate()
            }}
          >
            {reset.isPending ? "Resetting…" : "Reset chat"}
          </Button>
        }
      />
      <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Ask about bookings</EmptyTitle>
                <EmptyDescription>
                  Search bookings or ask to change something.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <MessageScrollerProvider>
            <MessageScroller className="h-full">
              <MessageScrollerViewport>
                <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
                  {messages.map((message) => (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={message.role === "user"}
                    >
                      <ChatMessage
                        message={message}
                        isStreaming={isBusy && message.id === lastMessage?.id}
                      />
                    </MessageScrollerItem>
                  ))}
                  {status === "submitted" ? (
                    <MessageScrollerItem messageId="thinking">
                      <div className="px-3 text-sm text-muted-foreground">
                        Thinking…
                      </div>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : resetError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not reset chat</AlertTitle>
            <AlertDescription>{resetError}</AlertDescription>
          </Alert>
        ) : null}
        <PromptForm
          isBusy={isBusy}
          onSubmit={(text) => {
            void sendMessage({ text })
          }}
          onStop={() => {
            void stop()
          }}
        />
      </CardFooter>
    </>
  )
}
