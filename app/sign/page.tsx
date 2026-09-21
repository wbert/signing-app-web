import type { Metadata } from "next"

import { SigningJourney } from "@/components/signing/signing-journey"

export const metadata: Metadata = {
  title: "Sign a document",
  description:
    "Review and sign a document sent to you by Northpoint Manpower Solutions.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

/**
 * The public signing entry point.
 *
 * Nothing about the signatory is rendered on the server: the credential arrives
 * in the URL fragment, which the browser never transmits, so the server-rendered
 * HTML for this route is identical for every recipient and holds no token.
 */
export default function SignPage() {
  return <SigningJourney />
}
