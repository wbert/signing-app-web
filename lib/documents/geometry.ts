import type { PageGeometry } from "@/lib/api/types"

/**
 * Field rectangles are stored as page fractions. The backend's
 * `mapNormalizedBox` treats `x` as a fraction of the *visually rotated* page
 * width measured left to right, and `y` as a fraction of the visually rotated
 * height measured from the top down. A rendered page in the browser uses the
 * same frame, so converting between the two is a plain multiply once the
 * surface uses the rotation-aware aspect ratio.
 */
export type NormalizedRect = {
  x: number
  y: number
  width: number
  height: number
}

export type PixelRect = {
  left: number
  top: number
  width: number
  height: number
}

export type SurfaceSize = {
  width: number
  height: number
}

/** The API rejects any other page rotation with `UNSUPPORTED_PAGE_ROTATION`. */
export const supportedRotations = [0, 90, 180, 270] as const

/** Coordinates are persisted with `toFixed(8)`, so 8 decimals round-trip exactly. */
export const COORDINATE_PRECISION = 8

/** Keeps a field large enough to remain visible and clickable. */
export const MIN_FIELD_SIZE = 0.01

export function normalizeRotation(rotationDegrees: number): number {
  return ((Math.trunc(rotationDegrees) % 360) + 360) % 360
}

export function isSupportedRotation(rotationDegrees: number): boolean {
  return (supportedRotations as readonly number[]).includes(
    normalizeRotation(rotationDegrees)
  )
}

/** Page dimensions as the reader sees them: swapped for quarter turns. */
export function displayedPageSize(page: PageGeometry): SurfaceSize {
  const rotation = normalizeRotation(page.rotationDegrees)
  const quarterTurn = rotation === 90 || rotation === 270
  return {
    width: quarterTurn ? page.heightPoints : page.widthPoints,
    height: quarterTurn ? page.widthPoints : page.heightPoints,
  }
}

export function pageAspectRatio(page: PageGeometry): number {
  const size = displayedPageSize(page)
  return size.height === 0 ? 1 : size.width / size.height
}

export function findPage(
  pages: readonly PageGeometry[],
  pageNumber: number
): PageGeometry | null {
  return pages.find((page) => page.pageNumber === pageNumber) ?? null
}

export function toPixels(
  rect: NormalizedRect,
  surface: SurfaceSize
): PixelRect {
  return {
    left: rect.x * surface.width,
    top: rect.y * surface.height,
    width: rect.width * surface.width,
    height: rect.height * surface.height,
  }
}

export function toNormalized(
  pixels: PixelRect,
  surface: SurfaceSize
): NormalizedRect {
  if (surface.width <= 0 || surface.height <= 0) {
    return { x: 0, y: 0, width: MIN_FIELD_SIZE, height: MIN_FIELD_SIZE }
  }
  return {
    x: pixels.left / surface.width,
    y: pixels.top / surface.height,
    width: pixels.width / surface.width,
    height: pixels.height / surface.height,
  }
}

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION))
}

export function roundRect(rect: NormalizedRect): NormalizedRect {
  return {
    x: roundCoordinate(rect.x),
    y: roundCoordinate(rect.y),
    width: roundCoordinate(rect.width),
    height: roundCoordinate(rect.height),
  }
}

/**
 * Clamps a rectangle so it satisfies the API's field schema: every edge within
 * the page, and a width and height strictly greater than zero.
 */
export function constrainToPage(rect: NormalizedRect): NormalizedRect {
  const width = clamp(rect.width, MIN_FIELD_SIZE, 1)
  const height = clamp(rect.height, MIN_FIELD_SIZE, 1)
  return roundRect({
    x: clamp(rect.x, 0, 1 - width),
    y: clamp(rect.y, 0, 1 - height),
    width,
    height,
  })
}

export function moveRect(
  rect: NormalizedRect,
  deltaX: number,
  deltaY: number
): NormalizedRect {
  return constrainToPage({
    ...rect,
    x: rect.x + deltaX,
    y: rect.y + deltaY,
  })
}

/** Resizes from the top-left corner, keeping the rectangle on the page. */
export function resizeRect(
  rect: NormalizedRect,
  deltaWidth: number,
  deltaHeight: number
): NormalizedRect {
  const width = clamp(rect.width + deltaWidth, MIN_FIELD_SIZE, 1 - rect.x)
  const height = clamp(rect.height + deltaHeight, MIN_FIELD_SIZE, 1 - rect.y)
  return constrainToPage({ ...rect, width, height })
}

/** True when a rectangle is already valid for the API without correction. */
export function isWithinPage(rect: NormalizedRect): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x + rect.width <= 1 &&
    rect.y + rect.height <= 1
  )
}

export function rectsEqual(
  left: NormalizedRect,
  right: NormalizedRect,
  tolerance = 1e-8
): boolean {
  return (
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance
  )
}

/**
 * Fits a page into an available width, preserving the displayed aspect ratio.
 * Used for both zoom steps and container resizes so the two share one path.
 */
export function surfaceForWidth(
  page: PageGeometry,
  availableWidth: number,
  zoom = 1
): SurfaceSize {
  const width = Math.max(1, availableWidth * zoom)
  const ratio = pageAspectRatio(page)
  return { width, height: ratio === 0 ? width : width / ratio }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (Number.isNaN(value)) return minimum
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}
