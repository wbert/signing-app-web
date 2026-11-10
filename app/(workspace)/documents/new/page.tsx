import type { Metadata } from "next"

import { DraftStart } from "@/components/documents/draft-start"

export const metadata: Metadata = {
  title: "Prepare a document",
  robots: { index: false, follow: false },
}

export default function NewDocumentPage() {
  return <DraftStart />
}
