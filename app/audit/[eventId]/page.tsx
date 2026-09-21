import type { Metadata } from "next"

import { AuditEventDetail } from "@/components/audit/audit-event-detail"

export const metadata: Metadata = {
  title: "Audit event",
  robots: { index: false, follow: false },
}

export default async function AuditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  return <AuditEventDetail eventId={eventId} />
}
