import type { Metadata } from "next"

import { WorkflowList } from "@/components/workflow/workflow-list"

export const metadata: Metadata = {
  title: "Workflows",
  robots: { index: false, follow: false },
}

export default function WorkflowsPage() {
  return <WorkflowList />
}
