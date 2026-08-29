import { useState, type SubmitEvent } from "react"
import { useWorkerSignIn } from "@/lib/auth/use-auth"
import { validEmail } from "@/lib/auth/validation"
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

export function WorkerSignIn() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const signIn = useWorkerSignIn()

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn.mutate({ email: email.trim(), password })
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Worker sign in</CardTitle>
          <CardDescription>
            Use the account credentials provided by your administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="worker-email">Email</FieldLabel>
                <Input
                  id="worker-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="worker-password">Password</FieldLabel>
                <Input
                  id="worker-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
            </FieldGroup>
            {signIn.error instanceof Error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{signIn.error.message}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              disabled={
                signIn.isPending || !validEmail(email.trim()) || password === ""
              }
            >
              {signIn.isPending ? <Spinner data-icon="inline-start" /> : null}
              {signIn.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
