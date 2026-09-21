import type { WorkflowDisplayStatus } from "@/lib/api/types"
import { workflowStatusLabels } from "@/lib/workflow/workflows"
import { cn } from "@/lib/utils"

const tones: Record<WorkflowDisplayStatus, string> = {
  DRAFT: "border-border bg-muted text-muted-foreground",
  IN_APPROVAL:
    "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-950 dark:bg-blue-950/40 dark:text-blue-200",
  RETURNED:
    "border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  APPROVED:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200",
  SENT: "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200",
  VIEWED:
    "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-950 dark:bg-blue-950/40 dark:text-blue-200",
  SIGNED:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-200",
  DECLINED:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-950 dark:bg-red-950/40 dark:text-red-200",
  EXPIRED:
    "border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  VOIDED: "border-border bg-muted text-muted-foreground",
}

export function WorkflowStatusBadge({
  status,
}: {
  status: WorkflowDisplayStatus
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold",
        tones[status]
      )}
    >
      {workflowStatusLabels[status]}
    </span>
  )
}
