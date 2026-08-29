import { useState, type SubmitEvent } from "react"
import { useWorkerChangePassword } from "@/lib/auth/use-auth"
import { validNewPassword } from "@/lib/auth/validation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function WorkerChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const change = useWorkerChangePassword()
  const matches = newPassword === confirmation

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (matches) change.mutate({ currentPassword, newPassword })
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Replace your temporary password before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="current-password">
                  Current password
                </FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">
                  Confirm new password
                </FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
              </Field>
            </FieldGroup>
            {!matches && confirmation !== "" ? (
              <p className="text-sm text-destructive">
                Passwords do not match.
              </p>
            ) : null}
            {change.error instanceof Error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{change.error.message}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              disabled={
                change.isPending ||
                currentPassword === "" ||
                !validNewPassword(newPassword) ||
                !matches
              }
            >
              {change.isPending ? <Spinner data-icon="inline-start" /> : null}
              {change.isPending ? "Changing password…" : "Change password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
