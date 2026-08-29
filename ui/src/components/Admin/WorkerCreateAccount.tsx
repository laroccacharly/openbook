import { useMemo, useState, type SubmitEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createSessionApiClient, type Worker } from "@/lib/api/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const workersQueryKey = ["workers"] as const

export function WorkerCreateAccount({ worker }: { worker: Worker }) {
  const client = useMemo(() => createSessionApiClient(), [])
  const queryClient = useQueryClient()
  const [email, setEmail] = useState("")
  const account = useMutation({
    mutationFn: () =>
      client.createWorkerAccount(worker.id, { email: email.trim() }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: workersQueryKey }),
  })

  if (account.data) {
    return (
      <Alert>
        <AlertDescription className="flex flex-col gap-2">
          <span>Account created for {account.data.email}.</span>
          <span>
            This temporary password is shown once and cannot be retrieved later.
          </span>
          <code
            className="rounded bg-muted px-2 py-1 font-mono"
            data-testid="temporary-password"
          >
            {account.data.temporaryPassword}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(account.data.temporaryPassword)
            }}
          >
            Copy temporary password
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  if (worker.account) {
    return (
      <p className="text-sm text-muted-foreground">
        Account: {worker.account.email}
      </p>
    )
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    account.mutate()
  }

  return (
    <>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={submit}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor={`worker-account-email-${worker.id}`}>
            Account email
          </FieldLabel>
          <Input
            id={`worker-account-email-${worker.id}`}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={account.isPending}
            required
          />
        </Field>
        <Button
          type="submit"
          disabled={account.isPending || email.trim() === ""}
        >
          {account.isPending ? <Spinner data-icon="inline-start" /> : null}
          {account.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
      {account.error instanceof Error ? (
        <p className="text-sm text-destructive" role="alert">
          {account.error.message}
        </p>
      ) : null}
    </>
  )
}
