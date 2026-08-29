import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"

type SortableColumn = {
  getIsSorted: () => false | "asc" | "desc"
  toggleSorting: (desc?: boolean) => void
}

type SortableHeaderProps = {
  label: string
  column: SortableColumn
}

export function SortableHeader({ label, column }: SortableHeaderProps) {
  return (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown data-icon="inline-end" />
    </Button>
  )
}
