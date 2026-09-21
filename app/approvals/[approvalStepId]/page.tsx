import type { Metadata } from "next"

import { ApprovalDetail } from "@/components/approvals/approval-detail"

export const metadata: Metadata = {
  title: "Approval",
  robots: { index: false, follow: false },
}

export default async function ApprovalStepPage({
  params,
}: {
  params: Promise<{ approvalStepId: string }>
}) {
  const { approvalStepId } = await params
  return <ApprovalDetail approvalStepId={approvalStepId} />
}
