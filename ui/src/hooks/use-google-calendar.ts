import { useMemo } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createSessionApiClient } from "../lib/api/client"

export function useGoogleCalendar() {
  const client = useMemo(() => createSessionApiClient(), [])

  const status = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => client.getGoogleCalendarStatus(),
    retry: false,
  })

  const info = useQuery({
    queryKey: ["google-calendar-info"],
    queryFn: () => client.getGoogleCalendarInfo(),
    enabled: false,
    retry: false,
  })

  const connect = useMutation({
    mutationFn: () => client.connectGoogleCalendar(),
    onSuccess: ({ url }) => window.location.assign(url),
  })

  return { status, info, connect }
}
