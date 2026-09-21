"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"

import {
  detachableCopy,
  loadPdfjs,
  pdfDocumentDefaults,
} from "@/lib/documents/pdf-runtime"

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

type RenderStatus = "loading" | "ready" | "error"

/**
 * Draws one page of the PDF behind the field overlay.
 *
 * The canvas fills exactly the box the normalized field coordinates are
 * measured against, so the page image follows the coordinates rather than the
 * other way round. If a PDF's crop box differs from its media box the image may
 * be scaled very slightly, but no field moves.
 *
 * The caller mounts this with a `key` tied to the source, so a new document
 * remounts with a fresh loading state instead of mutating state in an effect.
 */
export function PdfPageCanvas({
  bytes,
  height,
  pageNumber,
  width,
}: {
  bytes: Uint8Array
  height: number
  pageNumber: number
  width: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<{ cancel: () => void } | null>(null)
  const [document, setDocument] = useState<DocumentProxy | null>(null)
  const [status, setStatus] = useState<RenderStatus>("loading")

  useEffect(() => {
    let cancelled = false
    let loadingTask: { destroy: () => Promise<void> } | null = null

    void (async () => {
      try {
        const pdfjs = await loadPdfjs()
        if (cancelled) return
        const task = pdfjs.getDocument({
          ...pdfDocumentDefaults,
          data: detachableCopy(bytes),
        })
        loadingTask = task
        const loaded = (await task.promise) as unknown as DocumentProxy
        if (!cancelled) setDocument(loaded)
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()

    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [bytes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!document || !canvas || width <= 0 || height <= 0) return

    let cancelled = false
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

        taskRef.current?.cancel()
        const task = page.render({ canvas, viewport })
        taskRef.current = task
        await task.promise
        if (!cancelled) setStatus("ready")
      } catch (error) {
        // Cancelling an in-flight render is expected while zooming or paging.
        if (!cancelled && !isCancellation(error)) setStatus("error")
      }
    })()

    return () => {
      cancelled = true
      taskRef.current?.cancel()
      taskRef.current = null
    }
  }, [document, height, pageNumber, width])

  return (
    <>
      <canvas
        aria-hidden="true"
        className="absolute inset-0 size-full"
        ref={canvasRef}
      />
      {status === "loading" && (
        <p
          className="absolute inset-0 grid place-items-center text-xs text-neutral-500"
          role="status"
        >
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-3.5 animate-spin" />
            Rendering page {pageNumber}…
          </span>
        </p>
      )}
      {status === "error" && (
        <p
          className="absolute inset-0 grid place-items-center px-6 text-center text-xs leading-5 text-neutral-500"
          role="status"
        >
          This page could not be drawn. Field positions are still exact, because
          they use the page size reported for this PDF.
        </p>
      )}
    </>
  )
}

function isCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    String((error as { name: unknown }).name).includes("Cancel")
  )
}
