import { useMemo, useState, type SubmitEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import {
  createSessionApiClient,
  type Configuration,
  type LanguageModel,
} from "@/lib/api/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

const queryKey = ["configuration"] as const
const languageModelsQueryKey = ["language-models"] as const

export function Settings() {
  const client = useMemo(() => createSessionApiClient(), [])
  const configuration = useQuery({
    queryKey,
    queryFn: () => client.getConfiguration(),
    retry: false,
  })
  const languageModels = useQuery({
    queryKey: languageModelsQueryKey,
    queryFn: () => client.listLanguageModels(),
    retry: false,
  })

  const error =
    (configuration.error instanceof Error
      ? configuration.error.message
      : null) ??
    (languageModels.error instanceof Error
      ? languageModels.error.message
      : null)

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-heading">
      <div className="flex flex-col gap-1">
        <h2 id="settings-heading" className="font-heading text-xl font-medium">
          Settings
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure how response drafts and admin chat are handled.
        </p>
      </div>

      {configuration.isPending || languageModels.isPending ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading settings…
        </p>
      ) : error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : configuration.data && languageModels.data ? (
        <SettingsForm
          configuration={configuration.data}
          languageModels={languageModels.data}
        />
      ) : null}
    </section>
  )
}

function SettingsForm({
  configuration,
  languageModels,
}: {
  configuration: Configuration
  languageModels: readonly LanguageModel[]
}) {
  const client = useMemo(() => createSessionApiClient(), [])
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(configuration)
  const [autoApproveDrafts, setAutoApproveDrafts] = useState(
    configuration.autoApproveDrafts,
  )
  const [enableMessageDelivery, setEnableMessageDelivery] = useState(
    configuration.enableMessageDelivery,
  )
  const [languageModelId, setLanguageModelId] = useState(
    configuration.languageModelId,
  )
  const [chatLanguageModelId, setChatLanguageModelId] = useState(
    configuration.chatLanguageModelId,
  )
  const [showSaved, setShowSaved] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      client.patchConfiguration({
        autoApproveDrafts,
        enableMessageDelivery,
        languageModelId,
        chatLanguageModelId,
      }),
    onSuccess: (updated) => {
      setSaved(updated)
      setAutoApproveDrafts(updated.autoApproveDrafts)
      setEnableMessageDelivery(updated.enableMessageDelivery)
      setLanguageModelId(updated.languageModelId)
      setChatLanguageModelId(updated.chatLanguageModelId)
      setShowSaved(true)
      queryClient.setQueryData(queryKey, updated)
    },
  })

  const isDirty =
    autoApproveDrafts !== saved.autoApproveDrafts ||
    enableMessageDelivery !== saved.enableMessageDelivery ||
    languageModelId !== saved.languageModelId ||
    chatLanguageModelId !== saved.chatLanguageModelId

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isDirty && !save.isPending) {
      setShowSaved(false)
      save.mutate()
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Response drafts</CardTitle>
          <CardDescription>
            Configure review and delivery for generated responses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SettingsSwitch
              id="auto-approve-drafts"
              label="Auto-approve drafts"
              description="Automatically approve new response drafts when they are ready."
              checked={autoApproveDrafts}
              disabled={save.isPending}
              onCheckedChange={(value) => {
                setAutoApproveDrafts(value)
                setShowSaved(false)
              }}
            />
            <SettingsSwitch
              id="enable-message-delivery"
              label="Enable message delivery"
              description="Send approved responses via SMS or email."
              checked={enableMessageDelivery}
              disabled={save.isPending}
              onCheckedChange={(value) => {
                setEnableMessageDelivery(value)
                setShowSaved(false)
              }}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language models</CardTitle>
          <CardDescription>
            Select the models used to generate response drafts and power admin
            chat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <LanguageModelSelect
              id="language-model"
              label="Model"
              value={languageModelId}
              languageModels={languageModels}
              disabled={save.isPending}
              onChange={(value) => {
                setLanguageModelId(value)
                setShowSaved(false)
              }}
            />
            <LanguageModelSelect
              id="chat-language-model"
              label="Chat model"
              value={chatLanguageModelId}
              languageModels={languageModels}
              disabled={save.isPending}
              onChange={(value) => {
                setChatLanguageModelId(value)
                setShowSaved(false)
              }}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      {save.error instanceof Error ? (
        <Alert variant="destructive">
          <AlertDescription>{save.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={!isDirty || save.isPending}
          className="disabled:bg-muted disabled:text-muted-foreground"
        >
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        {showSaved && !isDirty ? (
          <p
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
            role="status"
          >
            <Check className="size-4" />
            Saved
          </p>
        ) : null}
      </div>
    </form>
  )
}

function LanguageModelSelect({
  id,
  label,
  value,
  languageModels,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  languageModels: readonly LanguageModel[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const hasKnownModel = languageModels.some((model) => model.id === value)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!hasKnownModel ? <option value={value}>{value}</option> : null}
        {languageModels.map((model) => (
          <option key={model.id} value={model.id}>
            {model.label}
          </option>
        ))}
      </select>
      <FieldDescription>{value}</FieldDescription>
    </Field>
  )
}

function SettingsSwitch({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <Field orientation="horizontal">
      <div className="flex flex-1 flex-col gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "block size-5 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </Field>
  )
}
