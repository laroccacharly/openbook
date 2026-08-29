import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createSessionApiClient, type Workflow } from "@/lib/api/client"
import { CollapsibleListSection } from "@/components/CollapsibleListSection"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

const workflowsQueryKey = ["workflows"] as const

type WorkflowRecordKey = {
  recordName: string
  recordId: number
}

function workflowRecordKey(workflow: WorkflowRecordKey): string {
  return `${workflow.recordName}:${workflow.recordId}`
}

export function WorkflowsComponent() {
  const client = useMemo(() => createSessionApiClient(), [])
  const queryClient = useQueryClient()
  const workflows = useQuery({
    queryKey: workflowsQueryKey,
    queryFn: () => client.listWorkflows(),
    refetchInterval: 1_000,
    retry: false,
  })
  const retry = useMutation({
    mutationFn: (record: WorkflowRecordKey) =>
      client.retryWorkflow(record.recordName, record.recordId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workflowsQueryKey })
    },
  })
  const error =
    workflows.error instanceof Error ? workflows.error.message : null
  const retryingRecordKey = retry.isPending
    ? workflowRecordKey(retry.variables)
    : undefined

  return (
    <CollapsibleListSection
      description="Cloudflare workflow state, newest first."
      id="workflows"
      title="Workflows"
    >
      {workflows.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading workflows…
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {workflows.data?.length ?? 0} workflows
          </p>
          {retry.error instanceof Error ? (
            <Alert variant="destructive">
              <AlertDescription>{retry.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <ul className="flex flex-col gap-3">
            {workflows.data?.map((workflow) => (
              <WorkflowItem
                key={workflow.id}
                onRetry={(record) => retry.mutate(record)}
                retryPending={retry.isPending}
                retryingRecordKey={retryingRecordKey}
                workflow={workflow}
              />
            ))}
          </ul>
        </>
      )}
    </CollapsibleListSection>
  )
}

function WorkflowItem({
  workflow,
  onRetry,
  retryPending,
  retryingRecordKey,
}: {
  workflow: Workflow
  onRetry: (record: WorkflowRecordKey) => void
  retryPending: boolean
  retryingRecordKey: string | undefined
}) {
  const canRetry = workflow.status === "failed"
  const recordKey = workflowRecordKey(workflow)
  const isRetrying = retryingRecordKey === recordKey

  return (
    <li>
      <Card size="sm">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <p>{workflow.stage.replaceAll("_", " ")}</p>
            {canRetry ? (
              <Button
                disabled={retryPending}
                onClick={() =>
                  onRetry({
                    recordName: workflow.recordName,
                    recordId: workflow.recordId,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {isRetrying ? "Retrying…" : "Retry"}
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {workflow.recordName} {workflow.recordId} · {workflow.status} ·{" "}
            attempt {workflow.attempt}
          </p>
          {workflow.error !== null ? (
            <Alert variant="destructive">
              <AlertDescription>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">
                  {workflow.error}
                </pre>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </li>
  )
}
