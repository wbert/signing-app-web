import type { PageGeometry } from "@/lib/api/types"
import {
  isSupportedRotation,
  normalizeRotation,
} from "@/lib/documents/geometry"
import {
  detachableCopy,
  loadPdfjs,
  pdfDocumentDefaults,
} from "@/lib/documents/pdf-runtime"

export type InspectedPdfSource = {
  pageCount: number
  pageGeometry: PageGeometry[]
  bytes: Uint8Array
}

export type PdfInspectionCode =
  | "INVALID_PDF"
  | "EMPTY_DOCUMENT"
  | "UNREADABLE_PDF"
  | "UNSUPPORTED_PAGE_ROTATION"

/** Mirrors the API's own PDF rejection codes so both sides use one vocabulary. */
export class PdfInspectionError extends Error {
  readonly code: PdfInspectionCode

  constructor(code: PdfInspectionCode, message: string) {
    super(message)
    this.name = "PdfInspectionError"
    this.code = code
  }
}

export const pdfInspectionMessages: Record<PdfInspectionCode, string> = {
  INVALID_PDF: "The selected file is not a PDF.",
  EMPTY_DOCUMENT: "The selected PDF has no pages.",
  UNREADABLE_PDF:
    "The PDF could not be read. It may be corrupt or password protected.",
  UNSUPPORTED_PAGE_ROTATION:
    "The PDF contains a page rotated by something other than 90, 180, or 270 degrees, which the API rejects.",
}

/**
 * Reads page dimensions in the browser.
 *
 * `POST /api/documents` takes the PDF and its field rectangles in one request
 * and rejects any field whose page is out of range, so the geometry has to be
 * known before the document exists on the server. The API returns the same
 * values on the created draft; these are used only to place fields.
 *
 * The library is imported dynamically so it stays out of the initial bundle.
 */
export async function inspectPdfSource(
  file: File
): Promise<InspectedPdfSource> {
  return inspectPdfBytes(new Uint8Array(await file.arrayBuffer()))
}

/** Same inspection for bytes already in memory, such as a fetched preview. */
export async function inspectPdfBytes(
  data: Uint8Array
): Promise<InspectedPdfSource> {
  if (!hasPdfHeader(data)) {
    throw new PdfInspectionError(
      "INVALID_PDF",
      pdfInspectionMessages.INVALID_PDF
    )
  }

  const pdfjs = await loadPdfjs()
  const loadingTask = pdfjs.getDocument({
    ...pdfDocumentDefaults,
    data: detachableCopy(data),
    disableAutoFetch: true,
  })

  try {
    const document = await loadingTask.promise

    if (document.numPages === 0) {
      throw new PdfInspectionError(
        "EMPTY_DOCUMENT",
        pdfInspectionMessages.EMPTY_DOCUMENT
      )
    }

    const pageGeometry: PageGeometry[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const [left, bottom, right, top] = page.view
      const rotationDegrees = normalizeRotation(page.rotate)
      if (!isSupportedRotation(rotationDegrees)) {
        throw new PdfInspectionError(
          "UNSUPPORTED_PAGE_ROTATION",
          pdfInspectionMessages.UNSUPPORTED_PAGE_ROTATION
        )
      }
      pageGeometry.push({
        pageNumber,
        widthPoints: Math.abs((right ?? 0) - (left ?? 0)),
        heightPoints: Math.abs((top ?? 0) - (bottom ?? 0)),
        rotationDegrees,
      })
    }

    return { pageCount: document.numPages, pageGeometry, bytes: data }
  } catch (error) {
    if (error instanceof PdfInspectionError) throw error
    throw new PdfInspectionError(
      "UNREADABLE_PDF",
      pdfInspectionMessages.UNREADABLE_PDF
    )
  } finally {
    await loadingTask.destroy()
  }
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) return false
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  )
}
