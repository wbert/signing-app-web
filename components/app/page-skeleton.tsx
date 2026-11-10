import { Skeleton } from "@/components/ui/skeleton"

export function PageSkeleton({
  message = "Loading page…",
}: {
  message?: string
}) {
  return (
    <main
      className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 sm:py-10"
      aria-busy="true"
      role="status"
    >
      <span className="sr-only">{message}</span>
      <div aria-hidden="true">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-4 h-10 w-56 max-w-full" />
        <Skeleton className="mt-4 h-4 w-full max-w-xl" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-md" />
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="border bg-card p-5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-4 h-7 w-12" />
            </div>
          ))}
        </div>
        <div className="mt-6 border bg-card">
          <div className="flex flex-wrap justify-between gap-4 border-b p-5">
            <Skeleton className="h-10 w-full sm:w-1/3" />
            <Skeleton className="h-10 w-40" />
          </div>
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="flex flex-wrap items-center justify-between gap-4 border-b p-5 last:border-0"
            >
              <div className="w-full space-y-3 sm:w-1/2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
