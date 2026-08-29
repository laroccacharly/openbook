export function formatDatetime(value: string | Date | number): string {
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value)
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
