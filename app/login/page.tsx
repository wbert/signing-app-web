import type { Metadata } from "next"
import { CheckCircle2, FileLock2, History, Route } from "lucide-react"

import { LoginForm } from "@/components/auth/login-form"
import { BrandLockup } from "@/components/brand/brand-lockup"

export const metadata: Metadata = {
  title: "Sign in",
}

const assurances = [
  { icon: Route, text: "Configurable approval routing" },
  { icon: FileLock2, text: "Immutable completed records" },
  { icon: History, text: "Append-only audit history" },
]

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,1.04fr)_minmax(30rem,0.96fr)]">
      <section className="relative hidden overflow-hidden bg-[#143c32] px-12 py-10 text-white lg:flex lg:flex-col">
        <BrandLockup className="relative z-10 text-white [&_span_span:last-child]:text-emerald-100/65" />

        <div className="relative z-10 my-auto max-w-xl py-16">
          <p className="mb-5 text-xs font-bold tracking-[0.18em] text-emerald-300 uppercase">
            Documents that keep moving
          </p>
          <h2 className="font-heading text-5xl leading-[1.06] font-semibold tracking-[-0.045em] xl:text-6xl">
            From approval to signature, without the paper chase.
          </h2>
          <p className="mt-6 max-w-lg text-base leading-7 text-emerald-50/70">
            Prepare, route, sign, and retrieve employment records through one
            secure and traceable workflow.
          </p>

          <div className="mt-10 grid gap-3">
            {assurances.map(({ icon: Icon, text }) => (
              <div
                className="flex items-center gap-3 text-sm font-medium text-emerald-50/85"
                key={text}
              >
                <span className="grid size-8 place-items-center rounded-none border border-white/10 bg-white/5">
                  <Icon className="size-4 text-emerald-300" strokeWidth={1.8} />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-emerald-50/50">
          <CheckCircle2 className="size-3.5" />
          Internal access is protected by multi-factor authentication.
        </div>

        <div className="absolute -top-28 -right-28 size-[30rem] rounded-full border border-white/7" />
        <div className="absolute top-10 right-0 size-[30rem] rounded-full border border-white/5" />
        <div className="absolute -bottom-56 -left-28 size-[36rem] rounded-full bg-emerald-400/10 blur-3xl" />
        <svg
          aria-hidden="true"
          className="absolute right-0 bottom-0 h-2/3 w-2/3 opacity-[0.06]"
          viewBox="0 0 600 600"
        >
          <path
            d="M40 530C145 390 175 240 322 170c86-41 163-12 238-115"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M90 590c75-129 189-173 254-297 48-91 78-175 190-244"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </section>

      <section className="flex min-h-svh flex-col bg-background px-5 py-6 sm:px-10 lg:px-14 xl:px-20">
        <BrandLockup className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-12">
          <LoginForm />
        </div>
        <p className="text-center text-xs leading-5 text-muted-foreground">
          Authorized Northpoint personnel only. Activity is recorded for
          security and compliance.
        </p>
      </section>
    </main>
  )
}
