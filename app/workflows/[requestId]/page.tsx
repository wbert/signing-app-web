import type { Metadata } from "next"

import { WorkflowDetail } from "@/components/workflow/workflow-detail"

export const metadata: Metadata = {
  title: "Workflow",
  robots: { index: false, follow: false },
}

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params
  return <WorkflowDetail requestId={requestId} />
}
