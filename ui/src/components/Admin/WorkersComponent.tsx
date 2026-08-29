import { useMemo, useState, type SubmitEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createSessionApiClient, type Worker } from "@/lib/api/client"
import { WorkerCreateAccount } from "./WorkerCreateAccount"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const queryKey = ["workers"] as const

export function WorkersComponent() {
  const client = useMemo(() => createSessionApiClient(), [])
  const queryClient = useQueryClient()
  const [name, setName] = useState("")

  const workers = useQuery({
    queryKey,
    queryFn: () => client.listWorkers(),
    retry: false,
  })

  const create = useMutation({
    mutationFn: (workerName: string) =>
      client.createFullTimeWorker({ name: workerName }),
    onSuccess: async () => {
      setName("")
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  const error = resolveWorkersError(create.error, workers.error)

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    create.mutate(name.trim())
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="workers-heading">
      <div className="flex flex-col gap-1">
        <h2 id="workers-heading" className="font-heading text-xl font-medium">
          Workers
        </h2>
        <p className="text-sm text-muted-foreground">
          Add, view, and remove workers available for bookings.
        </p>
      </div>

      <WorkersCreateForm
        name={name}
        createPending={create.isPending}
        onNameChange={setName}
        onSubmit={submit}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <WorkersList workers={workers.data} loading={workers.isPending} />
    </section>
  )
}

function resolveWorkersError(
  createError: unknown,
  workersError: unknown,
): string | null {
  if (createError instanceof Error) {
    return createError.message
  }
  if (workersError instanceof Error) {
    return workersError.message
  }
  return null
}

function WorkersCreateForm({
  name,
  createPending,
  onNameChange,
  onSubmit,
}: {
  name: string
  createPending: boolean
  onNameChange: (value: string) => void
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
}) {
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="worker-name">Name</FieldLabel>
          <Input
            id="worker-name"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            disabled={createPending}
            autoComplete="off"
            required
          />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={createPending || name.trim() === ""}>
        {createPending ? <Spinner data-icon="inline-start" /> : null}
        {createPending ? "Creating worker…" : "Create worker"}
      </Button>
    </form>
  )
}

function WorkersList({
  workers,
  loading,
}: {
  workers: Worker[] | undefined
  loading: boolean
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading workers…
      </p>
    )
  }

  if (workers?.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No workers</EmptyTitle>
          <EmptyDescription>
            Add a worker to assign to bookings.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col gap-3" aria-live="polite">
      {workers?.map((worker) => (
        <WorkerItem worker={worker} key={worker.id} />
      ))}
    </ul>
  )
}

function WorkerItem({ worker }: { worker: Worker }) {
  const client = useMemo(() => createSessionApiClient(), [])
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const remove = useMutation({
    mutationFn: () => client.deleteWorker(worker.id),
    onSuccess: async () => {
      setConfirmOpen(false)
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  return (
    <li data-worker-id={worker.id}>
      <Card size="sm">
        <CardHeader>
          <CardTitle>{worker.name}</CardTitle>
          <CardDescription>
            {worker.schedule.name === "full-time"
              ? "Full time"
              : worker.schedule.name}
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              Delete
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <WorkerCreateAccount worker={worker} />
          {remove.error instanceof Error ? (
            <p className="text-sm text-destructive" role="alert">
              {remove.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {worker.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the worker and their login. Workers with active
              bookings cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault()
                remove.mutate()
              }}
            >
              {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
              {remove.isPending ? "Deleting…" : "Delete worker"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
