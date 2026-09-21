"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"

import { PdfPageCanvas } from "@/components/documents/pdf-page-canvas"
import { Button } from "@/components/ui/button"
import type { PageGeometry } from "@/lib/api/types"
import { surfaceForWidth } from "@/lib/documents/geometry"
import { inspectPdfBytes } from "@/lib/documents/pdf-source"

/**
 * Read-only viewer for a document an approver is reviewing. The short-lived
 * preview URL is fetched once and only its bytes are kept.
 */
export function PdfPreview({
  previewUrl,
  sourceKey,
}: {
  previewUrl: string
  sourceKey: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [pages, setPages] = useState<PageGeometry[]>([])
  const [pageNumber, setPageNumber] = useState(1)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      setAvailableWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(element)
    setAvailableWidth(element.clientWidth)
    return () => observer.disconnect()
  }, [])

  const load = useCallback(async () => {
    const response = await fetch(previewUrl, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    })
    if (!response.ok) throw new Error(`preview responded ${response.status}`)
    const loaded = new Uint8Array(await response.arrayBuffer())
    const inspected = await inspectPdfBytes(loaded)
    return { loaded, inspected }
  }, [previewUrl])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { loaded, inspected } = await load()
        if (cancelled) return
        setBytes(loaded)
        setPages(inspected.pageGeometry)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const page =
    pages.find((entry) => entry.pageNumber === pageNumber) ?? pages[0]
  const surface = page
    ? surfaceForWidth(page, Math.max(availableWidth, 1))
    : { width: 0, height: 0 }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/25 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            aria-label="Previous page"
            className="rounded-xl"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <p aria-live="polite" className="text-xs font-semibold">
            {pages.length > 0
              ? `Page ${pageNumber} of ${pages.length}`
              : "Loading document"}
          </p>
          <Button
            aria-label="Next page"
            className="rounded-xl"
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
      </div>

      <div className="mt-3 rounded-2xl border bg-muted/20 p-4" ref={container}>
        {failed ? (
          <p className="py-10 text-center text-sm leading-6 text-muted-foreground">
            The document could not be loaded from storage. Its preview link is
            short lived — reload this page to request a new one.
          </p>
        ) : !bytes || !page ? (
          <p
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="size-4 animate-spin" />
            Loading the document…
          </p>
        ) : (
          <div
            className="relative mx-auto overflow-hidden rounded-lg border bg-white dark:bg-neutral-100"
            style={{ width: surface.width, height: surface.height }}
          >
            <PdfPageCanvas
              bytes={bytes}
              height={surface.height}
              key={sourceKey}
              pageNumber={page.pageNumber}
              width={surface.width}
            />
          </div>
        )}
      </div>
    </div>
  )
}
