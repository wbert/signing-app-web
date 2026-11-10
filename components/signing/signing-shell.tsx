"use client"

import { Check, CircleAlert, FileCheck2 } from "lucide-react"

import { BrandLockup } from "@/components/brand/brand-lockup"
import type { SigningStage } from "@/lib/signing/signing"
import type { TerminalState } from "@/lib/signing/signing"
import { cn } from "@/lib/utils"

const stageOrder: SigningStage[] = ["access", "review", "sign"]

const stageLabels: Record<SigningStage, string> = {
  access: "Open",
  review: "Read",
  sign: "Sign",
}

/**
 * One narrow column on every screen size. The journey is designed first for a
 * phone held in one hand, because that is how most invitation emails are
 * opened, and nothing here needs an app to be installed.
 */
export function SigningShell({
  children,
  documentTitle,
  stage,
}: {
  children: React.ReactNode
  documentTitle?: string
  stage?: SigningStage
}) {
  return (
    <div className="min-h-svh bg-background dark:bg-background">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:px-6">
          <BrandLockup />
          {stage && (
            <ol className="flex items-center gap-2" aria-label="Progress">
              {stageOrder.map((entry, index) => {
                const position = stageOrder.indexOf(stage)
                const done = index < position
                const current = entry === stage
                return (
                  <li className="flex flex-1 items-center gap-2" key={entry}>
                    <span
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-semibold",
                        current
                          ? "text-emerald-800 dark:text-emerald-300"
                          : "text-muted-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full border text-[0.6rem]",
                          done
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : current
                              ? "border-emerald-700 text-emerald-800 dark:text-emerald-300"
                              : "border-border"
                        )}
                      >
                        {done ? (
                          <Check className="size-3" />
                        ) : (
                          String(index + 1)
                        )}
                      </span>
                      {stageLabels[entry]}
                    </span>
                    {index < stageOrder.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-px flex-1",
                          done ? "bg-emerald-700" : "bg-border"
                        )}
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {documentTitle && (
          <h1 className="mb-5 font-heading text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {documentTitle}
          </h1>
        )}
        {children}
      </main>
    </div>
  )
}

/**
 * The end of the journey, in plain language. The API answers every unusable
 * link the same way on purpose, so this screen never speculates about why.
 */
export function TerminalScreen({ state }: { state: TerminalState }) {
  const positive = state.reason === "completed"
  return (
    <SigningShell>
      <div className="rounded-none border bg-card p-6 text-center shadow-sm sm:p-10">
        <span
          className={cn(
            "mx-auto grid size-12 place-items-center rounded-none",
            positive
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "bg-muted text-muted-foreground"
          )}
        >
          {positive ? (
            <FileCheck2 className="size-6" />
          ) : (
            <CircleAlert className="size-6" />
          )}
        </span>
        <h1 className="mt-5 font-heading text-2xl font-semibold tracking-tight">
          {state.heading}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {state.message}
        </p>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          You can close this page.
        </p>
      </div>
    </SigningShell>
  )
}
