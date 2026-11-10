"use client"

import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">
          Something went wrong
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight">
          We couldn&apos;t open this page.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No document or account details were changed. Try loading the page
          again.
        </p>
        <Button className="mt-6 rounded-none" onClick={retry}>
          <RotateCcw />
          Try again
        </Button>
      </div>
    </main>
  )
}
