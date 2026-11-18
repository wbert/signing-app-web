import type { Metadata } from "next"

import { BackupCodes } from "@/components/account/backup-codes"

export const metadata: Metadata = {
  title: "Account security",
  robots: { index: false, follow: false },
}

export default function AccountSecurityPage() {
  return <BackupCodes />
}
