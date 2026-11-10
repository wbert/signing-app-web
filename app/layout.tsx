import type { Metadata } from "next"
import { headers } from "next/headers"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { JetBrains_Mono, Poppins } from "next/font/google"
import { cn } from "@/lib/utils"

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
})

export const metadata: Metadata = {
  title: {
    default: "SigningApp",
    template: "%s · SigningApp",
  },
  description:
    "Secure electronic document signing, approvals, archiving, and audit trails for Northpoint Manpower Solutions.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The Content-Security-Policy in `proxy.ts` carries a per-request nonce, and
  // Next can only attach that nonce to its scripts while rendering against a
  // real request. Reading the request headers here opts every route beneath
  // this layout into dynamic rendering, which is what makes the policy
  // enforceable.
  //
  // next-themes writes an inline script that sets the theme before first paint.
  // Next does not nonce scripts it did not emit, so without this the policy
  // blocks it and every visitor sees a flash of the wrong theme.
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        "font-sans",
        poppins.variable,
        jetbrainsMono.variable
      )}
    >
      <body>
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
      </body>
    </html>
  )
}
