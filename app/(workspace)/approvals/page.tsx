import type { Metadata } from "next"

import { ApprovalInbox } from "@/components/approvals/approval-inbox"

export const metadata: Metadata = {
  title: "Approvals",
  robots: { index: false, follow: false },
}

export default function ApprovalsPage() {
  return <ApprovalInbox />
}
