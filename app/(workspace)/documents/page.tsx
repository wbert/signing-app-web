import type { Metadata } from "next"

import { DocumentList } from "@/components/documents/document-list"

export const metadata: Metadata = {
  title: "Documents",
  robots: { index: false, follow: false },
}

export default function DocumentsPage() {
  return <DocumentList />
}
