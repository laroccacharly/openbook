import {
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table"

export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
})

export type DataTableFeatures = typeof dataTableFeatures
