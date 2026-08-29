import { useState } from "react"
import {
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DATA_TABLE_PAGE_SIZE } from "./page-size"
import type { DataTableFeatures } from "./table-features"

type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<DataTableFeatures, TData>[]
  data: TData[]
  defaultSorting: SortingState
  features: DataTableFeatures
  getRowId: (row: TData) => string
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  defaultSorting,
  features,
  getRowId,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSorting)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DATA_TABLE_PAGE_SIZE,
  })

  const table = useTable<DataTableFeatures, TData>({
    features,
    data,
    columns,
    getRowId,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    state: {
      sorting,
      pagination,
    },
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
