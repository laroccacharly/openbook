import type { SubmitEvent } from "react"
import { useAdminLogin } from "@/hooks/use-admin-session"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function AdminLogin() {
  const login = useAdminLogin()
  const error = login.error instanceof Error ? login.error.message : null

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = new FormData(event.currentTarget).get("password")
    const password = typeof value === "string" ? value : ""
    login.mutate(password)
  }

  return (
    <section
      className="flex max-w-sm flex-col gap-4"
      aria-labelledby="admin-login-heading"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="admin-login-heading"
          className="font-heading text-xl font-medium"
        >
          Admin sign in
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter the admin password to continue.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="admin-password">Password</FieldLabel>
            <Input
              id="admin-password"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              disabled={login.isPending}
            />
          </Field>
        </FieldGroup>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? <Spinner data-icon="inline-start" /> : null}
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </section>
  )
}
