import { FileCheck2 } from "lucide-react"

import { cn } from "@/lib/utils"

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="grid size-10 place-items-center rounded-none bg-primary text-primary-foreground">
        <FileCheck2 aria-hidden="true" className="size-5" strokeWidth={1.8} />
      </span>
      <span className="leading-none">
        <span className="block font-heading text-lg font-semibold tracking-tight">
          SigningApp
        </span>
        <span className="mt-1 block text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Northpoint
        </span>
      </span>
    </div>
  )
}
