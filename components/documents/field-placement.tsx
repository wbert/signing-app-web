"use client"

import { useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Minus,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react"

import { Field } from "@/components/admin/admin-ui"
import {
  PageSurface,
  paletteFor,
  type PlacedField,
} from "@/components/documents/page-surface"
import { Button } from "@/components/ui/button"
import type {
  DraftSignatoryInput,
  FieldKind,
  PageGeometry,
} from "@/lib/api/types"
import { fieldKinds } from "@/lib/api/types"
import { fieldKindLabels, type DraftProblem } from "@/lib/documents/drafts"
import {
  constrainToPage,
  findPage,
  type NormalizedRect,
} from "@/lib/documents/geometry"
import { cn } from "@/lib/utils"

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
const CENTRED = { x: 0.39, y: 0.465, width: 0.22, height: 0.07 }

export function FieldPlacement({
  fields,
  onChange,
  pages,
  pdfBytes,
  pdfSourceKey,
  problems,
  signatories,
}: {
  fields: PlacedField[]
  onChange: (fields: PlacedField[]) => void
  pages: PageGeometry[]
  pdfBytes: Uint8Array | null
  pdfSourceKey: string
  problems: DraftProblem[]
  signatories: DraftSignatoryInput[]
}) {
  const [pageNumber, setPageNumber] = useState(1)
  const [zoomIndex, setZoomIndex] = useState(2)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [signatoryReference, setSignatoryReference] = useState(
    signatories[0]?.reference ?? ""
  )
  const [kind, setKind] = useState<FieldKind>("SIGNATURE")

  const page = findPage(pages, pageNumber) ?? pages[0] ?? null
  const zoom = ZOOM_STEPS[zoomIndex] ?? 1
  const activeReference =
    signatories.find((entry) => entry.reference === signatoryReference)
      ?.reference ??
    signatories[0]?.reference ??
    ""

  const paletteIndexFor = useMemo(() => {
    const order = new Map(
      signatories.map((signatory, index) => [signatory.reference, index])
    )
    return (reference: string) => order.get(reference) ?? 0
  }, [signatories])

  const pageFields = fields.filter((field) => field.pageNumber === pageNumber)
  const fieldProblems = problems.filter((problem) =>
    problem.path.startsWith("fields")
  )

  function addField(rect: NormalizedRect) {
    if (!activeReference || !page) return
    const placed: PlacedField = {
      key: crypto.randomUUID(),
      signatoryReference: activeReference,
      kind,
      pageNumber: page.pageNumber,
      ...constrainToPage(rect),
    }
    onChange([...fields, placed])
    setSelectedKey(placed.key)
    setArmed(false)
  }

  function updateField(key: string, rect: NormalizedRect) {
    onChange(
      fields.map((field) => (field.key === key ? { ...field, ...rect } : field))
    )
  }

  function removeField(key: string) {
    onChange(fields.filter((field) => field.key !== key))
    setSelectedKey((current) => (current === key ? null : current))
  }

  if (!page) {
    return (
      <p className="rounded-none border bg-muted/30 p-4 text-sm text-muted-foreground">
        This document reported no pages, so fields cannot be placed.
      </p>
    )
  }

  const noSignatories = signatories.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-none border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <Field htmlFor="field-signatory" label="Signatory">
            <select
              className="field-input h-11"
              disabled={noSignatories}
              id="field-signatory"
              onChange={(event) => setSignatoryReference(event.target.value)}
              value={activeReference}
            >
              {signatories.map((signatory) => (
                <option key={signatory.reference} value={signatory.reference}>
                  {signatory.fullName.trim() || signatory.reference}
                </option>
              ))}
            </select>
          </Field>
          <Field htmlFor="field-kind" label="Field type">
            <select
              className="field-input h-11"
              disabled={noSignatories}
              id="field-kind"
              onChange={(event) => setKind(event.target.value as FieldKind)}
              value={kind}
            >
              {fieldKinds.map((value) => (
                <option key={value} value={value}>
                  {fieldKindLabels[value]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            aria-pressed={armed}
            className="rounded-none"
            disabled={noSignatories}
            onClick={() => setArmed((current) => !current)}
            size="sm"
            type="button"
            variant={armed ? "default" : "outline"}
          >
            <Crosshair />
            {armed ? "Click the page" : "Place by clicking"}
          </Button>
          <Button
            className="rounded-none"
            disabled={noSignatories}
            onClick={() => addField(CENTRED)}
            size="sm"
            type="button"
          >
            <Plus />
            Add to centre
          </Button>
        </div>
      </div>

      {noSignatories && (
        <p className="rounded-none border border-amber-300/70 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          Add a signatory before placing fields. Every field must belong to one.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-none border bg-muted/25 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            aria-label="Previous page"
            className="rounded-none"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <p className="text-xs font-semibold" aria-live="polite">
            Page {pageNumber} of {pages.length}
          </p>
          <Button
            aria-label="Next page"
            className="rounded-none"
            disabled={pageNumber >= pages.length}
            onClick={() =>
              setPageNumber((current) => Math.min(pages.length, current + 1))
            }
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Zoom out"
            className="rounded-none"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Minus />
          </Button>
          <p className="w-12 text-center text-xs font-semibold">
            {Math.round(zoom * 100)}%
          </p>
          <Button
            aria-label="Zoom in"
            className="rounded-none"
            disabled={zoomIndex === ZOOM_STEPS.length - 1}
            onClick={() =>
              setZoomIndex((current) =>
                Math.min(ZOOM_STEPS.length - 1, current + 1)
              )
            }
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Plus />
          </Button>
        </div>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Select a field and use the arrow keys to move it, <kbd>Shift</kbd> with
        an arrow for larger steps, <kbd>Alt</kbd> with an arrow to resize, and{" "}
        <kbd>Delete</kbd> to remove it. Fields are kept inside the page
        automatically.
      </p>

      <div className="overflow-x-auto rounded-none border bg-muted/20 p-4">
        <PageSurface
          armed={
            armed && activeReference
              ? { signatoryReference: activeReference, kind }
              : null
          }
          fields={pageFields}
          onChange={updateField}
          onPlace={addField}
          onRemove={removeField}
          onSelect={setSelectedKey}
          page={page}
          paletteIndexFor={paletteIndexFor}
          pdfBytes={pdfBytes}
          pdfSourceKey={pdfSourceKey}
          selectedKey={selectedKey}
          zoom={zoom}
        />
      </div>

      {fieldProblems.length > 0 && (
        <div
          className="rounded-none border border-red-200 bg-red-50 p-4 text-sm text-red-950 dark:border-red-950 dark:bg-red-950/35 dark:text-red-100"
          role="alert"
        >
          <ul className="list-disc space-y-1 pl-5">
            {fieldProblems.map((problem) => (
              <li key={`${problem.path}-${problem.message}`}>
                {problem.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="placed-fields-heading">
        <h3 className="text-sm font-semibold" id="placed-fields-heading">
          Placed fields ({fields.length})
        </h3>
        {fields.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No fields yet. At least one is required before the draft can be
            saved.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-none border bg-card">
            {fields.map((field) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                key={field.key}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-3 shrink-0 rounded-full border-2",
                      paletteFor(paletteIndexFor(field.signatoryReference))
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {fieldKindLabels[field.kind]} ·{" "}
                      <span className="font-mono text-xs">
                        {field.signatoryReference}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Page {field.pageNumber} · {Math.round(field.x * 100)}%
                      from left, {Math.round(field.y * 100)}% from top
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="rounded-none"
                    onClick={() => {
                      setPageNumber(field.pageNumber)
                      setSelectedKey(field.key)
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PenLine />
                    Show
                  </Button>
                  <Button
                    aria-label={`Remove ${fieldKindLabels[field.kind]} for ${field.signatoryReference}`}
                    className="rounded-none"
                    onClick={() => removeField(field.key)}
                    size="icon-sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
