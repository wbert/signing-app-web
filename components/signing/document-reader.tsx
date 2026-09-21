"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import type { PageGeometry } from "@/lib/api/types"
import { surfaceForWidth } from "@/lib/documents/geometry"
import { inspectPdfBytes } from "@/lib/documents/pdf-source"
import {
  detachableCopy,
  loadPdfjs,
  pdfDocumentDefaults,
} from "@/lib/documents/pdf-runtime"
import { fetchPreviewBytes } from "@/lib/signing/client"

type DocumentProxy = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PageProxy>
}

type PageProxy = {
  getViewport: (options: { scale: number }) => { width: number; height: number }
  render: (options: {
    canvas: HTMLCanvasElement
    viewport: { width: number; height: number }
  }) => { promise: Promise<void>; cancel: () => void }
}

/** Pages within this many pixels of the viewport are drawn ahead of time. */
const RENDER_MARGIN_PX = 800

/**
 * The full document, scrolled rather than paged, because a signatory on a phone
 * reads it the way they read anything else.
 *
 * Every page is laid out at its true size from the moment the geometry is
 * known, so the scrollbar never lies about how much is left, and only pages
 * near the viewport are drawn. `onReachedLastPage` fires when the final page
 * actually comes into view — the server then records the review, and it is the
 * server, not this component, that decides whether signing may begin.
 */
export function DocumentReader({
  onReachedLastPage,
  previewUrl,
}: {
  onReachedLastPage: (pageNumber: number) => void
  previewUrl: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<number, HTMLElement>())
  const reachedLastPage = useRef(false)
  const [document, setDocument] = useState<DocumentProxy | null>(null)
  const [pages, setPages] = useState<PageGeometry[]>([])
  const [drawablePages, setDrawablePages] = useState<ReadonlySet<number>>(
    new Set([1])
  )
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

  useEffect(() => {
    const controller = new AbortController()
    let loadingTask: { destroy: () => Promise<void> } | null = null

    void (async () => {
      try {
        const bytes = await fetchPreviewBytes(previewUrl, controller.signal)
        const inspected = await inspectPdfBytes(bytes)
        if (controller.signal.aborted) return

        const pdfjs = await loadPdfjs()
        const task = pdfjs.getDocument({
          ...pdfDocumentDefaults,
          data: detachableCopy(bytes),
        })
        loadingTask = task
        const loaded = (await task.promise) as unknown as DocumentProxy
        if (controller.signal.aborted) return

        setPages(inspected.pageGeometry)
        setDocument(loaded)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      }
    })()

    return () => {
      controller.abort()
      void loadingTask?.destroy()
    }
  }, [previewUrl])

  const lastPageNumber = pages.at(-1)?.pageNumber ?? 0

  const observePage = useCallback(
    (pageNumber: number) => (element: HTMLElement | null) => {
      if (element) pageRefs.current.set(pageNumber, element)
      else pageRefs.current.delete(pageNumber)
    },
    []
  )

  useEffect(() => {
    if (pages.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const seen: number[] = []
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const pageNumber = Number(
            entry.target.getAttribute("data-page-number")
          )
          if (Number.isFinite(pageNumber)) seen.push(pageNumber)
        }
        if (seen.length === 0) return

        setDrawablePages((current) => {
          const next = new Set(current)
          for (const pageNumber of seen) {
            next.add(pageNumber)
            // The following page is usually next under the reader's thumb.
            if (pageNumber < lastPageNumber) next.add(pageNumber + 1)
          }
          return next
        })

        if (!reachedLastPage.current && seen.includes(lastPageNumber)) {
          reachedLastPage.current = true
          onReachedLastPage(lastPageNumber)
        }
      },
      { rootMargin: `${RENDER_MARGIN_PX}px 0px` }
    )

    for (const element of pageRefs.current.values()) observer.observe(element)
    return () => observer.disconnect()
  }, [lastPageNumber, onReachedLastPage, pages.length])

  const surfaces = useMemo(
    () =>
      pages.map((page) => ({
        page,
        surface: surfaceForWidth(page, Math.max(availableWidth, 1)),
      })),
    [availableWidth, pages]
  )

  if (failed) {
    return (
      <p className="rounded-2xl border bg-card px-5 py-10 text-center text-sm leading-6 text-muted-foreground">
        The document could not be loaded. Its secure link is short lived —
        reload this page to request a new one.
      </p>
    )
  }

  return (
    <div ref={container}>
      {pages.length === 0 ? (
        <p
          className="flex items-center justify-center gap-2 rounded-2xl border bg-card py-16 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin" />
          Loading the document…
        </p>
      ) : (
        <ol className="space-y-4">
          {surfaces.map(({ page, surface }) => (
            <li
              className="relative overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-100"
              data-page-number={page.pageNumber}
              key={page.pageNumber}
              ref={observePage(page.pageNumber)}
              style={{ height: surface.height }}
            >
              <span className="absolute top-2 right-2 z-10 rounded-md bg-neutral-900/70 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
                {page.pageNumber} / {pages.length}
              </span>
              {document && drawablePages.has(page.pageNumber) ? (
                <ReaderPage
                  document={document}
                  height={surface.height}
                  pageNumber={page.pageNumber}
                  width={surface.width}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ReaderPage({
  document,
  height,
  pageNumber,
  width,
}: {
  document: DocumentProxy
  height: number
  pageNumber: number
  width: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || height <= 0) return

    let cancelled = false
    let task: ReturnType<PageProxy["render"]> | null = null

    void (async () => {
      try {
        const page = await document.getPage(pageNumber)
        if (cancelled) return

        const base = page.getViewport({ scale: 1 })
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({
          scale: (width / base.width) * pixelRatio,
        })

        canvas.width = Math.max(1, Math.round(viewport.width))
        canvas.height = Math.max(1, Math.round(viewport.height))

        task = page.render({ canvas, viewport })
        await task.promise
        if (!cancelled) setDrawn(true)
      } catch {
        // A cancelled render is expected while resizing or scrolling quickly.
      }
    })()

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [document, height, pageNumber, width])

  return (
    <>
      <canvas
        aria-hidden="true"
        className="absolute inset-0 size-full"
        ref={canvasRef}
      />
      {!drawn && (
        <p className="absolute inset-0 grid place-items-center text-xs text-neutral-500">
          Page {pageNumber}
        </p>
      )}
    </>
  )
}
