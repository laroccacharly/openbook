import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createSessionApiClient } from "@/lib/api/client"
import { cn } from "@/lib/utils"

const smsChannelQueryKey = ["channels", "sms"] as const

export function InboundPhoneNumber() {
  const client = useMemo(() => createSessionApiClient(), [])
  const [revealed, setRevealed] = useState(false)
  const smsChannel = useQuery({
    queryKey: smsChannelQueryKey,
    queryFn: () => client.getSmsChannel(),
    retry: false,
  })

  const inboundPhoneNumber = smsChannel.data?.inboundPhoneNumber ?? null
  if (inboundPhoneNumber === null) {
    return null
  }

  return (
    <p className="text-sm text-muted-foreground">
      SMS inbound:{" "}
      <button
        type="button"
        aria-pressed={revealed}
        aria-label={
          revealed ? "Hide SMS inbound number" : "Show SMS inbound number"
        }
        className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => {
          setRevealed((current) => !current)
        }}
      >
        <span
          className={cn(
            "inline-block transition-[filter]",
            !revealed && "select-none blur-sm",
          )}
        >
          {inboundPhoneNumber}
        </span>
      </button>
    </p>
  )
}
