import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { createSessionApiClient } from "@/lib/api/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const cents = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
})

export function JobCatalog() {
  const client = useMemo(() => createSessionApiClient(), [])
  const jobs = useQuery({
    queryKey: ["job-catalog"],
    queryFn: () => client.listJobCatalog(),
    retry: false,
  })

  const error = jobs.error instanceof Error ? jobs.error.message : null

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="job-catalog-heading"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="job-catalog-heading"
          className="font-heading text-xl font-medium"
        >
          Job catalog
        </h2>
        <p className="text-sm text-muted-foreground">
          Services used for booking estimates and scheduling.
        </p>
      </div>

      {jobs.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Loading job catalog…
        </p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Workers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.data?.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell className="text-right">
                      {cents.format(job.estimatedPriceCents / 100)}
                    </TableCell>
                    <TableCell className="text-right">
                      {job.durationMinutes} min
                    </TableCell>
                    <TableCell className="text-right">
                      {job.workerCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {jobs.data?.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No catalog jobs.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
