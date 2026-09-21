import type { Metadata } from "next"

import { DocumentTypeManagement } from "@/components/admin/document-type-management"

export const metadata: Metadata = {
  title: "Document configuration",
  robots: { index: false, follow: false },
}

export default function DocumentTypeConfigurationPage() {
  return <DocumentTypeManagement />
}
