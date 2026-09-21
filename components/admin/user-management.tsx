"use client"

import { Dialog } from "@base-ui/react/dialog"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleUserRound,
  KeyRound,
  LoaderCircle,
  LogOut,
  MailPlus,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { BrandLockup } from "@/components/brand/brand-lockup"
import { Button } from "@/components/ui/button"
import {
  ApiError,
  apiRequest,
  errorReference,
  SESSION_EXPIRED_EVENT,
  userMessageForApiError,
} from "@/lib/api/client"
import type {
  AccountStatus,
  AdminUser,
  AdminUserMutationResponse,
  AdminUsersResponse,
  MeResponse,
  Role,
} from "@/lib/api/types"
import { roles } from "@/lib/api/types"
import { can } from "@/lib/auth/capabilities"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

const roleDescriptions: Record<Role, string> = {
  ADMINISTRATOR: "Users, configuration, operations, and audit",
  SENDER: "Prepare and manage document drafts",
  APPROVER: "Review assigned approval steps",
  VIEWER: "Search archives and inspect audit records",
}

type Notice = {
  tone: "success" | "error"
  message: string
  reference?: string | null
}

export function UserManagement() {
  const router = useRouter()
  const [session, setSession] = useState<MeResponse | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [offset, setOffset] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [query, setQuery] = useState("")
  const [notice, setNotice] = useState<Notice | null>(null)
  const [loadError, setLoadError] = useState<Notice | null>(null)
  const [dialog, setDialog] = useState<"create" | string | null>(null)

  const redirectToExpiredSessionLogin = useCallback(() => {
    router.replace("/login?reason=session-expired")
    router.refresh()
  }, [router])

  const loadPage = useCallback(
    async (nextOffset: number, options: { foreground: boolean }) => {
      if (options.foreground) setLoading(true)
      else setRefreshing(true)
      setLoadError(null)

      try {
        const [currentSession, response] = await Promise.all([
          apiRequest<MeResponse>("/api/me"),
          apiRequest<AdminUsersResponse>(
            `/api/admin/users?limit=${PAGE_SIZE + 1}&offset=${nextOffset}`
          ),
        ])

        if (!can(currentSession.capabilities, "users:read")) {
          router.replace("/dashboard")
          router.refresh()
          return
        }

        setSession(currentSession)
        setUsers(response.users.slice(0, PAGE_SIZE))
        setHasNextPage(response.users.length > PAGE_SIZE)
        setOffset(nextOffset)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          redirectToExpiredSessionLogin()
          return
        }
        if (error instanceof ApiError && error.status === 403) {
          router.replace("/dashboard")
          router.refresh()
          return
        }
        setLoadError({
          tone: "error",
          message: userMessageForApiError(error),
          reference: errorReference(error),
        })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [redirectToExpiredSessionLogin, router]
  )

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadPage(0, { foreground: true })
    }, 0)

    return () => window.clearTimeout(loadTimer)
  }, [loadPage])

  useEffect(() => {
    const handleSessionExpiry = () => redirectToExpiredSessionLogin()
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry)
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpiry)
  }, [redirectToExpiredSessionLogin])

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return users
    return users.filter((user) =>
      [user.fullName, user.emailAddress, user.username, ...user.roles].some(
        (value) => value.toLowerCase().includes(normalized)
      )
    )
  }, [query, users])

  const selectedUser =
    dialog && dialog !== "create"
      ? (users.find((user) => user.id === dialog) ?? null)
      : null
  const canCreate = session ? can(session.capabilities, "users:create") : false
  const canUpdate = session ? can(session.capabilities, "users:update") : false

  function replaceUser(updated: AdminUser) {
    setUsers((current) =>
      current.map((user) => (user.id === updated.id ? updated : user))
    )
  }

  async function signOut() {
    setSigningOut(true)
    try {
      await apiRequest("/api/auth/sign-out", { method: "POST", body: {} })
    } finally {
      router.replace("/login")
      router.refresh()
    }
  }

  if (loading) {
    return <FullPageStatus message="Loading user administration…" />
  }

  if (loadError) {
    return (
      <FullPageError
        notice={loadError}
        onRetry={() => void loadPage(offset, { foreground: true })}
      />
    )
  }

  if (!session) return null

  const activeCount = users.filter(
    (user) => user.accountStatus === "ACTIVE"
  ).length
  const enrollmentCount = users.filter((user) =>
    ["PROVISIONING", "PENDING_MFA"].includes(user.accountStatus)
  ).length
  const disabledCount = users.filter(
    (user) => user.accountStatus === "DISABLED"
  ).length

  return (
    <div className="min-h-svh bg-[#f5f7f3] dark:bg-background">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[90rem] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-5">
            <BrandLockup />
            <span className="hidden h-7 w-px bg-border md:block" />
            <Link
              className="hidden items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground md:flex"
              href="/dashboard"
            >
              <ArrowLeft className="size-3.5" />
              Workspace
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{session.user.fullName}</p>
              <p className="text-xs text-muted-foreground">
                @{session.user.username}
              </p>
            </div>
            <div className="grid size-10 place-items-center rounded-full border bg-card text-muted-foreground">
              <CircleUserRound className="size-5" />
            </div>
            <Button
              aria-label="Sign out"
              className="rounded-xl"
              disabled={signingOut}
              onClick={signOut}
              size="icon"
              variant="ghost"
            >
              {signingOut ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LogOut />
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground md:hidden"
              href="/dashboard"
            >
              <ArrowLeft className="size-3.5" />
              Workspace
            </Link>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase dark:text-emerald-400">
              Identity and access
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              User administration
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Provision internal accounts, assign responsibilities, and control
              access without exposing authentication credentials.
            </p>
          </div>
          {canCreate && (
            <Button
              className="rounded-xl"
              onClick={() => setDialog("create")}
              size="lg"
            >
              <Plus />
              Provision user
            </Button>
          )}
        </div>

        <section
          aria-label="Account summary"
          className="mt-8 grid gap-3 sm:grid-cols-3"
        >
          <SummaryCard
            icon={<UserRoundCheck className="size-4" />}
            label="Active on this page"
            value={activeCount}
          />
          <SummaryCard
            icon={<KeyRound className="size-4" />}
            label="Awaiting setup"
            value={enrollmentCount}
          />
          <SummaryCard
            icon={<ShieldOff className="size-4" />}
            label="Disabled"
            value={disabledCount}
          />
        </section>

        <div aria-live="polite" className="mt-6">
          {notice && (
            <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />
          )}
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Filter users on this page"
                className="field-input h-10 pl-10"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter name, email, username, or role"
                type="search"
                value={query}
              />
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="text-xs text-muted-foreground">
                {visibleUsers.length} of {users.length} shown
              </p>
              <Button
                aria-label="Refresh users"
                className="rounded-xl"
                disabled={refreshing}
                onClick={() => void loadPage(offset, { foreground: false })}
                size="icon-sm"
                variant="outline"
              >
                <RefreshCw className={cn(refreshing && "animate-spin")} />
              </Button>
            </div>
          </div>

          {visibleUsers.length === 0 ? (
            <EmptyUsers filtered={Boolean(query.trim())} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[62rem] text-left">
                <thead className="bg-muted/45 text-[0.68rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
                  <tr>
                    <th className="px-5 py-3.5" scope="col">
                      User
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Roles
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      Account
                    </th>
                    <th className="px-5 py-3.5" scope="col">
                      MFA
                    </th>
                    <th className="px-5 py-3.5 text-right" scope="col">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleUsers.map((user) => (
                    <tr className="align-middle" key={user.id}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {initials(user.fullName)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold">{user.fullName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              @{user.username} · {user.emailAddress}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-xs flex-wrap gap-1.5">
                          {user.roles.map((role) => (
                            <RoleBadge key={role} role={role} />
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={user.accountStatus} />
                      </td>
                      <td className="px-5 py-4 text-sm">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5",
                            user.hasMfa
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {user.hasMfa ? (
                            <ShieldCheck className="size-4" />
                          ) : (
                            <KeyRound className="size-4" />
                          )}
                          {user.hasMfa ? "Verified" : "Not enrolled"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          className="rounded-xl"
                          onClick={() => setDialog(user.id)}
                          size="sm"
                          variant="outline"
                        >
                          <PencilLine />
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3 sm:px-5">
            <p className="text-xs text-muted-foreground">
              Accounts {users.length === 0 ? 0 : offset + 1}–
              {offset + users.length}
            </p>
            <div className="flex gap-2">
              <Button
                aria-label="Previous page"
                className="rounded-xl"
                disabled={offset === 0 || refreshing}
                onClick={() =>
                  void loadPage(Math.max(0, offset - PAGE_SIZE), {
                    foreground: false,
                  })
                }
                size="icon-sm"
                variant="outline"
              >
                <ChevronLeft />
              </Button>
              <Button
                aria-label="Next page"
                className="rounded-xl"
                disabled={!hasNextPage || refreshing}
                onClick={() =>
                  void loadPage(offset + PAGE_SIZE, { foreground: false })
                }
                size="icon-sm"
                variant="outline"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {dialog === "create" && (
        <ProvisionUserDialog
          onClose={() => setDialog(null)}
          onCreated={(user) => {
            setDialog(null)
            setNotice({
              tone: "success",
              message: `${user.fullName} was provisioned. A password setup email has been requested.`,
            })
            void loadPage(0, { foreground: false })
          }}
        />
      )}

      {selectedUser && (
        <ManageUserDialog
          canUpdate={canUpdate}
          currentUserId={session.user.id}
          key={selectedUser.id}
          onClose={() => setDialog(null)}
          onUpdated={(user, message) => {
            replaceUser(user)
            setDialog(null)
            setNotice({ tone: "success", message })
          }}
          user={selectedUser}
        />
      )}
    </div>
  )
}

function ProvisionUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (user: AdminUser) => void
}) {
  const [fullName, setFullName] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [username, setUsername] = useState("")
  const [assignedRoles, setAssignedRoles] = useState<Role[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Notice | null>(null)
  const action = useRef<{ fingerprint: string; key: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const fingerprint = JSON.stringify({
        fullName: fullName.trim(),
        emailAddress: emailAddress.trim(),
        username: username.trim(),
        roles: [...assignedRoles].sort(),
      })
      if (action.current?.fingerprint !== fingerprint) {
        action.current = { fingerprint, key: crypto.randomUUID() }
      }

      const response = await apiRequest<AdminUserMutationResponse>(
        "/api/admin/users",
        {
          method: "POST",
          idempotencyKey: action.current.key,
          body: {
            fullName: fullName.trim(),
            emailAddress: emailAddress.trim(),
            username: username.trim(),
            roles: assignedRoles,
          },
        }
      )
      onCreated(response.user)
    } catch (requestError) {
      setError(adminNoticeForError(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ManagementDialog
      description="Create an internal account and email a single-use password setup link."
      onClose={onClose}
      title="Provision a user"
    >
      {error && <NoticeBanner notice={error} />}
      <form className="mt-5 space-y-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="provision-full-name">
            <input
              autoFocus
              className="field-input"
              id="provision-full-name"
              maxLength={200}
              onChange={(event) => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </Field>
          <Field label="Username" htmlFor="provision-username">
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="field-input"
              id="provision-username"
              maxLength={100}
              minLength={3}
              onChange={(event) =>
                setUsername(event.target.value.toLowerCase())
              }
              pattern="[a-zA-Z0-9._-]+"
              required
              value={username}
            />
          </Field>
        </div>
        <Field label="Email address" htmlFor="provision-email">
          <input
            autoCapitalize="none"
            autoComplete="off"
            className="field-input"
            id="provision-email"
            onChange={(event) =>
              setEmailAddress(event.target.value.toLowerCase())
            }
            required
            type="email"
            value={emailAddress}
          />
        </Field>
        <RolePicker roles={assignedRoles} setRoles={setAssignedRoles} />
        <div className="rounded-xl border border-emerald-900/10 bg-emerald-50/70 p-3 text-xs leading-5 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
          <div className="flex gap-2">
            <MailPlus className="mt-0.5 size-4 shrink-0" />
            The user receives a time-limited setup link. No password is shown to
            the administrator.
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            className="rounded-xl"
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="rounded-xl"
            disabled={busy || assignedRoles.length === 0}
            type="submit"
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}
            {busy ? "Provisioning…" : "Provision user"}
          </Button>
        </div>
      </form>
    </ManagementDialog>
  )
}

function ManageUserDialog({
  canUpdate,
  currentUserId,
  onClose,
  onUpdated,
  user,
}: {
  canUpdate: boolean
  currentUserId: string
  onClose: () => void
  onUpdated: (user: AdminUser, message: string) => void
  user: AdminUser
}) {
  const [assignedRoles, setAssignedRoles] = useState<Role[]>(user.roles)
  const [roleBusy, setRoleBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [confirmStatus, setConfirmStatus] = useState(false)
  const [error, setError] = useState<Notice | null>(null)
  const roleAction = useRef<{ fingerprint: string; key: string } | null>(null)
  const [statusKey] = useState(() => crypto.randomUUID())

  const rolesChanged =
    [...assignedRoles].sort().join(",") !== [...user.roles].sort().join(",")
  const nextStatus = user.accountStatus === "DISABLED" ? "ACTIVE" : "DISABLED"
  const canReactivate = nextStatus !== "ACTIVE" || user.hasMfa

  async function saveRoles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRoleBusy(true)
    setError(null)
    try {
      const fingerprint = [...assignedRoles].sort().join(",")
      if (roleAction.current?.fingerprint !== fingerprint) {
        roleAction.current = { fingerprint, key: crypto.randomUUID() }
      }

      const response = await apiRequest<AdminUserMutationResponse>(
        `/api/admin/users/${encodeURIComponent(user.id)}/roles`,
        {
          method: "PUT",
          idempotencyKey: roleAction.current.key,
          body: { roles: assignedRoles },
        }
      )
      onUpdated(response.user, `${user.fullName}'s roles were updated.`)
    } catch (requestError) {
      setError(adminNoticeForError(requestError))
    } finally {
      setRoleBusy(false)
    }
  }

  async function changeStatus() {
    setStatusBusy(true)
    setError(null)
    try {
      const response = await apiRequest<AdminUserMutationResponse>(
        `/api/admin/users/${encodeURIComponent(user.id)}/status`,
        {
          method: "PATCH",
          idempotencyKey: statusKey,
          body: { status: nextStatus },
        }
      )
      onUpdated(
        response.user,
        nextStatus === "DISABLED"
          ? `${user.fullName}'s account was disabled and active sessions were revoked.`
          : `${user.fullName}'s account was re-enabled.`
      )
    } catch (requestError) {
      setError(adminNoticeForError(requestError))
      setConfirmStatus(false)
    } finally {
      setStatusBusy(false)
    }
  }

  return (
    <ManagementDialog
      description={`Manage @${user.username}. Changes are applied immediately and recorded in the audit trail.`}
      onClose={onClose}
      title={user.fullName}
    >
      {error && <NoticeBanner notice={error} />}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <StatusBadge status={user.accountStatus} />
        {user.roles.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
      </div>

      {user.id === currentUserId && (
        <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          You are managing your own account. Changing your roles or status may
          end this session.
        </div>
      )}

      <form className="mt-6" onSubmit={saveRoles}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Assigned roles</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Roles replace the current set; they are not added incrementally.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <RolePicker
            disabled={!canUpdate || roleBusy || statusBusy}
            roles={assignedRoles}
            setRoles={setAssignedRoles}
          />
        </div>
        {canUpdate && (
          <div className="mt-4 flex justify-end">
            <Button
              className="rounded-xl"
              disabled={roleBusy || assignedRoles.length === 0 || !rolesChanged}
              size="sm"
              type="submit"
            >
              {roleBusy ? <LoaderCircle className="animate-spin" /> : <Check />}
              {roleBusy ? "Saving…" : "Save roles"}
            </Button>
          </div>
        )}
      </form>

      <div className="my-6 h-px bg-border" />

      <section aria-labelledby="account-access-heading">
        <h3 className="text-sm font-semibold" id="account-access-heading">
          Account access
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Disabling an account blocks protected requests and revokes its active
          sessions.
        </p>

        {!canReactivate && (
          <div className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
            This account must complete MFA enrollment before it can be
            activated.
          </div>
        )}

        {canUpdate && !confirmStatus && (
          <Button
            className="mt-4 rounded-xl"
            disabled={!canReactivate}
            onClick={() => setConfirmStatus(true)}
            size="sm"
            type="button"
            variant={nextStatus === "DISABLED" ? "destructive" : "outline"}
          >
            {nextStatus === "DISABLED" ? <ShieldOff /> : <ShieldCheck />}
            {nextStatus === "DISABLED"
              ? "Disable account"
              : "Re-enable account"}
          </Button>
        )}

        {canUpdate && confirmStatus && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-950 dark:bg-red-950/30">
            <p className="text-sm font-semibold text-red-950 dark:text-red-100">
              {nextStatus === "DISABLED"
                ? `Disable ${user.fullName}?`
                : `Re-enable ${user.fullName}?`}
            </p>
            <p className="mt-1 text-xs leading-5 text-red-900/75 dark:text-red-100/70">
              {nextStatus === "DISABLED"
                ? "They will immediately lose access. The last active MFA-enrolled Administrator cannot be disabled."
                : "They will regain access using their existing credentials and authenticator."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className="rounded-xl"
                disabled={statusBusy}
                onClick={() => setConfirmStatus(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl"
                disabled={statusBusy}
                onClick={() => void changeStatus()}
                size="sm"
                type="button"
                variant={nextStatus === "DISABLED" ? "destructive" : "default"}
              >
                {statusBusy ? (
                  <LoaderCircle className="animate-spin" />
                ) : nextStatus === "DISABLED" ? (
                  <ShieldOff />
                ) : (
                  <ShieldCheck />
                )}
                {statusBusy
                  ? "Applying…"
                  : nextStatus === "DISABLED"
                    ? "Confirm disable"
                    : "Confirm re-enable"}
              </Button>
            </div>
          </div>
        )}
      </section>

      <div className="my-6 h-px bg-border" />

      <section className="rounded-2xl border bg-muted/25 p-4">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">MFA recovery</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {user.hasMfa
                ? "This account has verified MFA. Administrator-initiated MFA reset is not exposed by the current API."
                : "This account has not completed MFA enrollment."}
            </p>
          </div>
        </div>
      </section>
    </ManagementDialog>
  )
}

function ManagementDialog({
  children,
  description,
  onClose,
  title,
}: {
  children: React.ReactNode
  description: string
  onClose: () => void
  title: string
}) {
  return (
    <Dialog.Root onOpenChange={(open) => !open && onClose()} open>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-emerald-950/45 backdrop-blur-[2px]" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid items-end overflow-y-auto p-0 sm:items-center sm:justify-items-center sm:p-6">
          <Dialog.Popup className="max-h-[95svh] w-full overflow-y-auto rounded-t-3xl border bg-background p-5 shadow-2xl outline-none sm:max-w-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-5">
              <div>
                <Dialog.Title className="font-heading text-2xl font-semibold tracking-tight">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
              >
                <X className="size-4" />
              </Dialog.Close>
            </div>
            {children}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RolePicker({
  disabled = false,
  roles: assignedRoles,
  setRoles,
}: {
  disabled?: boolean
  roles: Role[]
  setRoles: (roles: Role[]) => void
}) {
  function toggle(role: Role) {
    setRoles(
      assignedRoles.includes(role)
        ? assignedRoles.filter((assigned) => assigned !== role)
        : [...assignedRoles, role]
    )
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold">Roles</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {roles.map((role) => {
          const checked = assignedRoles.includes(role)
          return (
            <label
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                checked
                  ? "border-emerald-700/35 bg-emerald-50/70 dark:bg-emerald-950/35"
                  : "hover:bg-muted/50",
                disabled && "cursor-not-allowed opacity-60"
              )}
              key={role}
            >
              <input
                checked={checked}
                className="mt-0.5 size-4 accent-emerald-700"
                onChange={() => toggle(role)}
                type="checkbox"
              />
              <span>
                <span className="block text-xs font-bold tracking-wide">
                  {roleLabel(role)}
                </span>
                <span className="mt-1 block text-[0.7rem] leading-4 text-muted-foreground">
                  {roleDescriptions[role]}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function Field({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode
  htmlFor: string
  label: string
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-4 shadow-xs">
      <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        {icon}
      </span>
      <div>
        <p className="text-xl leading-none font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-[0.62rem] font-bold tracking-wide text-muted-foreground uppercase">
      {roleLabel(role)}
    </span>
  )
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const styles: Record<AccountStatus, string> = {
    ACTIVE:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-300",
    PROVISIONING:
      "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-950 dark:bg-blue-950/40 dark:text-blue-300",
    PENDING_MFA:
      "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-950 dark:bg-amber-950/40 dark:text-amber-300",
    DISABLED:
      "border-red-200 bg-red-50 text-red-800 dark:border-red-950 dark:bg-red-950/40 dark:text-red-300",
  }
  const labels: Record<AccountStatus, string> = {
    ACTIVE: "Active",
    PROVISIONING: "Provisioning",
    PENDING_MFA: "Pending MFA",
    DISABLED: "Disabled",
  }

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[0.64rem] font-bold tracking-wide uppercase",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  )
}

function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: Notice
  onDismiss?: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm",
        notice.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-100"
          : "border-red-200 bg-red-50 text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
      )}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <div className="flex gap-2.5">
        {notice.tone === "success" ? (
          <Check className="mt-0.5 size-4 shrink-0" />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
        )}
        <div>
          <p>{notice.message}</p>
          {notice.reference && (
            <p className="mt-1 font-mono text-[0.68rem] opacity-65">
              Reference {notice.reference}
            </p>
          )}
        </div>
      </div>
      {onDismiss && (
        <button
          aria-label="Dismiss message"
          className="shrink-0 rounded-lg p-1 opacity-60 hover:bg-black/5 hover:opacity-100"
          onClick={onDismiss}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

function EmptyUsers({ filtered }: { filtered: boolean }) {
  return (
    <div className="grid min-h-72 place-items-center p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <UsersRound className="size-5" />
        </span>
        <h2 className="mt-4 font-heading text-xl font-semibold">
          {filtered ? "No matching users" : "No users on this page"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {filtered
            ? "Adjust the page filter to see other accounts."
            : "Provision an account to begin managing internal access."}
        </p>
      </div>
    </div>
  )
}

function FullPageStatus({ message }: { message: string }) {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f5f7f3] dark:bg-background">
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" />
        {message}
      </div>
    </main>
  )
}

function FullPageError({
  notice,
  onRetry,
}: {
  notice: Notice
  onRetry: () => void
}) {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f5f7f3] p-6 dark:bg-background">
      <div className="w-full max-w-md rounded-3xl border bg-card p-7 text-center shadow-sm">
        <CircleAlert className="mx-auto size-7 text-red-700" />
        <h1 className="mt-4 font-heading text-xl font-semibold">
          Unable to load user administration
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {notice.message}
        </p>
        {notice.reference && (
          <p className="mt-2 font-mono text-[0.68rem] text-muted-foreground">
            Reference {notice.reference}
          </p>
        )}
        <Button className="mt-5 rounded-xl" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    </main>
  )
}

function adminNoticeForError(error: unknown): Notice {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      USER_ALREADY_EXISTS:
        "That username or email address is already assigned.",
      LAST_ADMINISTRATOR_REQUIRED:
        "At least one active, MFA-enrolled Administrator must remain.",
      MFA_REQUIRED:
        "This account must complete MFA enrollment before it can be activated.",
      USER_NOT_FOUND: "This account no longer exists. Refresh the user list.",
      IDEMPOTENCY_KEY_REUSED:
        "This action could not be retried safely. Close it and start again.",
      ADMIN_COMMAND_FAILED:
        "The administrative action previously failed and cannot be replayed.",
    }
    return {
      tone: "error",
      message: messages[error.code] ?? userMessageForApiError(error),
      reference: error.requestId,
    }
  }

  return {
    tone: "error",
    message: userMessageForApiError(error),
  }
}

function roleLabel(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase()
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}
