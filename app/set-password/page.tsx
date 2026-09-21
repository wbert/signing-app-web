import type { Metadata } from "next"
import { FileKey2, ShieldCheck } from "lucide-react"

import { SetPasswordForm } from "@/components/auth/set-password-form"
import { BrandLockup } from "@/components/brand/brand-lockup"

export const metadata: Metadata = {
  title: "Set password",
  robots: { index: false, follow: false },
}

export default function SetPasswordPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(25rem,0.78fr)_minmax(0,1.22fr)]">
      <section className="relative hidden overflow-hidden bg-[#143c32] px-12 py-10 text-white lg:flex lg:flex-col">
        <BrandLockup className="relative z-10 text-white [&_span_span:last-child]:text-emerald-100/65" />
        <div className="relative z-10 my-auto max-w-md">
          <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
            <FileKey2 className="size-5 text-emerald-300" />
          </span>
          <h2 className="mt-7 font-heading text-4xl leading-tight font-semibold tracking-[-0.04em]">
            One secure account for every internal workflow.
          </h2>
          <p className="mt-5 text-sm leading-6 text-emerald-50/70">
            Your setup link is single-use and time-limited. SigningApp never
            stores your password in browser storage.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-xs text-emerald-50/50">
          <ShieldCheck className="size-3.5" />
          Multi-factor authentication is required after setup.
        </div>
        <div className="absolute -right-40 -bottom-40 size-[34rem] rounded-full border border-white/8" />
        <div className="absolute -right-20 -bottom-20 size-[24rem] rounded-full border border-white/6" />
      </section>

      <section className="flex min-h-svh flex-col bg-background px-5 py-6 sm:px-10 lg:px-20">
        <BrandLockup className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-12">
          <SetPasswordForm />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          If you did not request this account, close this page and contact your
          administrator.
        </p>
      </section>
    </main>
  )
}
