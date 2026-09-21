import type { Capability } from "@/lib/api/types"

export type AppDestination = {
  label: string
  description: string
  href: string
  capability: Capability
  phase: number
}

export const appDestinations: AppDestination[] = [
  {
    label: "Documents",
    description: "Prepare and submit signing documents",
    href: "/documents",
    capability: "documents:read",
    phase: 2,
  },
  {
    label: "Approvals",
    description: "Review documents awaiting your decision",
    href: "/approvals",
    capability: "approvals:read",
    phase: 3,
  },
  {
    // The API scopes `/api/workflows` to documents the caller owns and guards
    // it with `documents:read`, which only a Sender holds. `workflow:manage`
    // governs the background-job console instead, and an Administrator holding
    // it has no `documents:read` and would be refused here.
    label: "Workflows",
    description: "Track signing progress and delivery",
    href: "/workflows",
    capability: "documents:read",
    phase: 5,
  },
  {
    label: "Archive",
    description: "Retrieve and verify completed records",
    href: "/archive",
    capability: "archives:read",
    phase: 6,
  },
  {
    label: "Audit trail",
    description: "Inspect immutable activity records",
    href: "/audit",
    capability: "audit:read",
    phase: 6,
  },
  {
    label: "User administration",
    description: "Provision users, roles, and access",
    href: "/admin/users",
    capability: "users:read",
    phase: 1,
  },
  {
    label: "Document configuration",
    description: "Manage types, templates, and matrices",
    href: "/admin/document-types",
    capability: "document-types:manage",
    phase: 2,
  },
]

export function can(
  granted: readonly Capability[],
  capability: Capability
): boolean {
  return granted.includes(capability)
}

export function destinationsFor(granted: readonly Capability[]) {
  return appDestinations.filter((item) => can(granted, item.capability))
}
