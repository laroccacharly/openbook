import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

type CollapsibleListSectionProps = {
  children: ReactNode
  description: string
  id: string
  title: string
}

export function CollapsibleListSection({
  children,
  description,
  id,
  title,
}: CollapsibleListSectionProps) {
  const [isVisible, setIsVisible] = useState(false)
  const headingId = `${id}-heading`
  const contentId = `${id}-content`

  return (
    <section aria-labelledby={headingId}>
      <Collapsible
        open={isVisible}
        onOpenChange={setIsVisible}
        className="flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={headingId} className="font-heading text-xl font-medium">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <CollapsibleTrigger
            render={
              <Button
                variant="outline"
                aria-controls={contentId}
                aria-label={`${isVisible ? "Hide" : "Show"} ${title}`}
              />
            }
          >
            {isVisible ? "Hide" : "Show"}
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent id={contentId} className="flex flex-col gap-4">
          {children}
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
