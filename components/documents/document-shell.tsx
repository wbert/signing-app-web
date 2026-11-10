"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import type { MeResponse } from "@/lib/api/types"

export function DocumentShell({
  actions,
  backHref = "/dashboard",
  backLabel = "Workspace",
  children,
  eyebrow,
  intro,
  title,
}: {
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  children: React.ReactNode
  eyebrow: string
  intro: string
  session: MeResponse
  title: string
}) {
  return (
    <>
      <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 sm:py-10">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {backLabel}
        </Link>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {intro}
            </p>
          </div>
          {actions}
        </div>
        {children}
      </main>
    </>
  )
}
