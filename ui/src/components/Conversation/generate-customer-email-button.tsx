import { useMemo } from "react"
import { useMutation } from "@tanstack/react-query"
import { WandSparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { createSessionApiClient } from "@/lib/api/client"
import { generateCustomerEmail } from "@/lib/customer-email"

type GenerateCustomerEmailButtonProps = {
  disabled?: boolean
  onEmail: (email: string) => void
}

export function GenerateCustomerEmailButton({
  disabled = false,
  onEmail,
}: GenerateCustomerEmailButtonProps) {
  const client = useMemo(() => createSessionApiClient(), [])
  const generate = useMutation({
    mutationFn: () => generateCustomerEmail(client),
    onSuccess: onEmail,
  })
  const error = generate.error instanceof Error ? generate.error.message : null

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      disabled={disabled || generate.isPending}
      onClick={() => generate.mutate()}
      aria-label={
        generate.isPending
          ? "Generating customer email"
          : "Generate customer email"
      }
      title={error ?? undefined}
    >
      {generate.isPending ? <Spinner /> : <WandSparklesIcon />}
    </Button>
  )
}
