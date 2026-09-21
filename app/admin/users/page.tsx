import type { Metadata } from "next"

import { UserManagement } from "@/components/admin/user-management"

export const metadata: Metadata = {
  title: "User administration",
  robots: { index: false, follow: false },
}

export default function UserAdministrationPage() {
  return <UserManagement />
}
