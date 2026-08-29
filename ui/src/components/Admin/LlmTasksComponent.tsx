import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createSessionApiClient, type LlmTask } from "@/lib/api/client"
import { CollapsibleListSection } from "@/components/CollapsibleListSection"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export function LlmTasksComponent() {
  const client = useMemo(() => createSessionApiClient(), [])
  const tasks = useQuery({
    queryKey: ["llm-tasks"],
    queryFn: () => client.listAllLlmTasks(),
    refetchInterval: 1_000,
    retry: false,
  })

  const error = tasks.error instanceof Error ? tasks.error.message : null

  return (
    <CollapsibleListSection
      description="Model tasks created while processing inbound messages."
      id="llm-tasks"
      title="LLM tasks"
    >
      {tasks.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading LLM tasks…
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {tasks.data?.length ?? 0} LLM tasks
          </p>
          <ul className="flex flex-col gap-3">
            {tasks.data?.map((task) => (
              <LlmTaskItem task={task} key={task.id} />
            ))}
          </ul>
        </>
      )}
    </CollapsibleListSection>
  )
}

function LlmTaskItem({ task }: { task: LlmTask }) {
  const status =
    task.failedAt !== null
      ? "Failed"
      : task.completedAt !== null
        ? "Completed"
        : "Running"

  return (
    <li>
      <Card size="sm">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>{task.taskType.replaceAll("_", " ")}</CardTitle>
          <Badge variant={status === "Failed" ? "destructive" : "secondary"}>
            {status}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Message {task.messageId} · {task.languageModelId}
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {JSON.stringify(task.result, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </li>
  )
}
