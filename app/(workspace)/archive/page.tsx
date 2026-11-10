import type { Metadata } from "next"

import { ArchiveSearch } from "@/components/archive/archive-search"

export const metadata: Metadata = {
  title: "Archive",
  robots: { index: false, follow: false },
}

export default function ArchivePage() {
  return <ArchiveSearch />
}
