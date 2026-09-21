import type { Metadata } from "next"

import { DraftWorkspace } from "@/components/documents/draft-workspace"

export const metadata: Metadata = {
  title: "Draft",
  robots: { index: false, follow: false },
}

export default async function DraftPage({
  params,
}: {
  params: Promise<{ documentId: string }>
}) {
  const { documentId } = await params
  return <DraftWorkspace documentId={documentId} />
}
