import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs text-emerald-700">404</p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The page may have moved, or your account may not have access to it.
        </p>
        <Button className="mt-6 rounded-xl" render={<Link href="/dashboard" />}>
          Return to dashboard
        </Button>
      </div>
    </main>
  )
}
