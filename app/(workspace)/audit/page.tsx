import type { Metadata } from "next"

import { AuditExplorer } from "@/components/audit/audit-explorer"

export const metadata: Metadata = {
  title: "Audit trail",
  robots: { index: false, follow: false },
}

export default function AuditPage() {
  return <AuditExplorer />
}
