"use client"

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"

import { PdfPageCanvas } from "@/components/documents/pdf-page-canvas"
import type { DraftFieldInput, PageGeometry } from "@/lib/api/types"
import { fieldKindLabels } from "@/lib/documents/drafts"
import {
  constrainToPage,
  displayedPageSize,
  moveRect,
  type NormalizedRect,
  resizeRect,
  surfaceForWidth,
  toNormalized,
  toPixels,
} from "@/lib/documents/geometry"
import { cn } from "@/lib/utils"

export type PlacedField = DraftFieldInput & { key: string }

const NUDGE = 0.005
const COARSE_NUDGE = 0.05
const DEFAULT_FIELD = { width: 0.22, height: 0.07 }

/** Distinguishes each signatory's fields without relying on colour alone. */
export const signatoryPalette = [
  "border-emerald-600 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  "border-sky-600 bg-sky-500/15 text-sky-900 dark:text-sky-200",
  "border-violet-600 bg-violet-500/15 text-violet-900 dark:text-violet-200",
  "border-amber-600 bg-amber-500/15 text-amber-900 dark:text-amber-200",
  "border-rose-600 bg-rose-500/15 text-rose-900 dark:text-rose-200",
]

export function paletteFor(index: number): string {
  return (
    signatoryPalette[index % signatoryPalette.length] ?? signatoryPalette[0]!
  )
}

export function PageSurface({
  armed,
  fields,
  onChange,
  onPlace,
  onRemove,
  onSelect,
  page,
  paletteIndexFor,
  pdfBytes,
  pdfSourceKey,
  readOnly = false,
  selectedKey,
  zoom,
}: {
  armed: { signatoryReference: string; kind: DraftFieldInput["kind"] } | null
  fields: PlacedField[]
  onChange: (key: string, rect: NormalizedRect) => void
  onPlace: (rect: NormalizedRect) => void
  onRemove: (key: string) => void
  onSelect: (key: string | null) => void
  page: PageGeometry
  paletteIndexFor: (signatoryReference: string) => number
  pdfBytes: Uint8Array | null
  pdfSourceKey: string
  readOnly?: boolean
  selectedKey: string | null
  zoom: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const drag = useRef<{
    key: string
    mode: "move" | "resize"
    originX: number
    originY: number
    start: NormalizedRect
  } | null>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setAvailableWidth(width)
    })
    observer.observe(element)
    setAvailableWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const surface = surfaceForWidth(page, Math.max(availableWidth, 1), zoom)
  const points = displayedPageSize(page)

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const active = drag.current
      if (!active) return
      const deltaX = (event.clientX - active.originX) / surface.width
      const deltaY = (event.clientY - active.originY) / surface.height
      const next =
        active.mode === "move"
          ? moveRect(active.start, deltaX, deltaY)
          : resizeRect(active.start, deltaX, deltaY)
      onChange(active.key, next)
    },
    [onChange, surface.height, surface.width]
  )

  const stopDrag = useCallback(() => {
    drag.current = null
  }, [])

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopDrag)
    window.addEventListener("pointercancel", stopDrag)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopDrag)
      window.removeEventListener("pointercancel", stopDrag)
    }
  }, [handlePointerMove, stopDrag])

  function startDrag(
    event: ReactPointerEvent,
    field: PlacedField,
    mode: "move" | "resize"
  ) {
    if (readOnly) return
    // preventDefault stops text selection while dragging, but it also
    // suppresses the button's default focus, so focus is moved explicitly —
    // otherwise a field clicked with the mouse could not be nudged by keyboard.
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).closest("button")?.focus()
    onSelect(field.key)
    drag.current = {
      key: field.key,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      start: field,
    }
  }

  function placeAtPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly || !armed) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const rect = toNormalized(
      {
        left:
          event.clientX -
          bounds.left -
          (DEFAULT_FIELD.width * surface.width) / 2,
        top:
          event.clientY -
          bounds.top -
          (DEFAULT_FIELD.height * surface.height) / 2,
        width: DEFAULT_FIELD.width * surface.width,
        height: DEFAULT_FIELD.height * surface.height,
      },
      surface
    )
    onPlace(constrainToPage(rect))
  }

  function handleFieldKey(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    field: PlacedField
  ) {
    if (readOnly) return
    const step = event.shiftKey ? COARSE_NUDGE : NUDGE
    const resizing = event.altKey

    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const delta = moves[event.key]
    if (delta) {
      event.preventDefault()
      onChange(
        field.key,
        resizing
          ? resizeRect(field, delta[0], delta[1])
          : moveRect(field, delta[0], delta[1])
      )
      return
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      onRemove(field.key)
    }
  }

  return (
    <div className="w-full" ref={container}>
      <div
        className={cn(
          "relative mx-auto overflow-hidden rounded-lg border-2 bg-white shadow-sm dark:bg-neutral-100",
          armed && !readOnly
            ? "cursor-crosshair border-emerald-600"
            : "border-border"
        )}
        onPointerDown={placeAtPointer}
        style={{ width: surface.width, height: surface.height }}
      >
        {/*
          The box always keeps the page's exact displayed proportions, so
          placement and the stored fractions agree with what the API stamps
          whether or not the page image is available.
        */}
        {pdfBytes ? (
          <PdfPageCanvas
            bytes={pdfBytes}
            height={surface.height}
            key={pdfSourceKey}
            pageNumber={page.pageNumber}
            width={surface.width}
          />
        ) : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.045) 1px, transparent 1px)",
              backgroundSize: `${surface.width / 8}px ${surface.height / 11}px`,
            }}
          >
            <p className="px-4 text-center text-[0.7rem] font-medium tracking-wide text-neutral-400">
              Page {page.pageNumber} · {Math.round(points.width)} ×{" "}
              {Math.round(points.height)} pt
              {page.rotationDegrees
                ? ` · rotated ${page.rotationDegrees}°`
                : ""}
            </p>
          </div>
        )}

        {fields.map((field) => {
          const box = toPixels(field, surface)
          const selected = field.key === selectedKey
          return (
            <button
              aria-label={`${fieldKindLabels[field.kind]} for ${field.signatoryReference} on page ${field.pageNumber}, ${Math.round(
                field.x * 100
              )} percent from the left and ${Math.round(field.y * 100)} percent from the top`}
              aria-pressed={selected}
              className={cn(
                "absolute flex items-center justify-center overflow-hidden rounded border-2 text-[0.6rem] font-bold tracking-wide uppercase transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                paletteFor(paletteIndexFor(field.signatoryReference)),
                selected && "ring-2 ring-ring",
                readOnly ? "cursor-default" : "cursor-move"
              )}
              key={field.key}
              onFocus={() => onSelect(field.key)}
              onKeyDown={(event) => handleFieldKey(event, field)}
              onPointerDown={(event) => startDrag(event, field, "move")}
              style={{
                left: box.left,
                top: box.top,
                width: box.width,
                height: box.height,
              }}
              type="button"
            >
              <span className="truncate px-1">
                {fieldKindLabels[field.kind]}
              </span>
              {!readOnly && (
                <span
                  aria-hidden="true"
                  className="absolute right-0 bottom-0 size-3 cursor-nwse-resize rounded-tl border-t-2 border-l-2 border-current bg-background/70"
                  onPointerDown={(event) => startDrag(event, field, "resize")}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
