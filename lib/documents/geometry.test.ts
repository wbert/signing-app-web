import { describe, expect, it } from "vitest"

import type { PageGeometry } from "@/lib/api/types"
import {
  MIN_FIELD_SIZE,
  constrainToPage,
  displayedPageSize,
  findPage,
  isSupportedRotation,
  isWithinPage,
  moveRect,
  normalizeRotation,
  pageAspectRatio,
  rectsEqual,
  resizeRect,
  roundCoordinate,
  roundRect,
  surfaceForWidth,
  toNormalized,
  toPixels,
} from "@/lib/documents/geometry"

const portraitPage: PageGeometry = {
  pageNumber: 1,
  widthPoints: 612,
  heightPoints: 792,
  rotationDegrees: 0,
}

describe("PDF page geometry", () => {
  it("normalizes rotations and accepts only the four backend rotations", () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450.8)).toBe(90)
    expect(isSupportedRotation(-90)).toBe(true)
    expect(isSupportedRotation(180)).toBe(true)
    expect(isSupportedRotation(45)).toBe(false)
  })

  it("uses visually rotated dimensions for quarter turns", () => {
    expect(displayedPageSize(portraitPage)).toEqual({
      width: 612,
      height: 792,
    })
    expect(displayedPageSize({ ...portraitPage, rotationDegrees: 90 })).toEqual(
      { width: 792, height: 612 }
    )
    expect(
      displayedPageSize({ ...portraitPage, rotationDegrees: 270 })
    ).toEqual({ width: 792, height: 612 })
    expect(pageAspectRatio(portraitPage)).toBeCloseTo(612 / 792)
  })

  it("finds a page by its one-based page number", () => {
    const secondPage = { ...portraitPage, pageNumber: 2 }
    expect(findPage([portraitPage, secondPage], 2)).toBe(secondPage)
    expect(findPage([portraitPage], 3)).toBeNull()
  })

  it("round-trips normalized coordinates through a rendered surface", () => {
    const rect = { x: 0.125, y: 0.25, width: 0.3, height: 0.1 }
    const surface = { width: 800, height: 1_000 }

    expect(toPixels(rect, surface)).toEqual({
      left: 100,
      top: 250,
      width: 240,
      height: 100,
    })
    expect(toNormalized(toPixels(rect, surface), surface)).toEqual(rect)
  })

  it("returns a safe minimum rectangle for an unusable surface", () => {
    expect(
      toNormalized(
        { left: 10, top: 20, width: 30, height: 40 },
        { width: 0, height: 500 }
      )
    ).toEqual({
      x: 0,
      y: 0,
      width: MIN_FIELD_SIZE,
      height: MIN_FIELD_SIZE,
    })
  })

  it("rounds persisted coordinates to the API precision", () => {
    expect(roundCoordinate(0.123456789)).toBe(0.12345679)
    expect(
      roundRect({
        x: 0.123456789,
        y: 0.234567891,
        width: 0.345678912,
        height: 0.456789123,
      })
    ).toEqual({
      x: 0.12345679,
      y: 0.23456789,
      width: 0.34567891,
      height: 0.45678912,
    })
  })

  it("constrains fields to the page and enforces a clickable minimum", () => {
    expect(
      constrainToPage({ x: 0.95, y: -0.2, width: 0.2, height: 0 })
    ).toEqual({ x: 0.8, y: 0, width: 0.2, height: MIN_FIELD_SIZE })
    expect(
      constrainToPage({
        x: Number.NaN,
        y: Number.NaN,
        width: Number.NaN,
        height: Number.NaN,
      })
    ).toEqual({
      x: 0,
      y: 0,
      width: MIN_FIELD_SIZE,
      height: MIN_FIELD_SIZE,
    })
  })

  it("keeps moved and resized fields inside the page", () => {
    const rect = { x: 0.8, y: 0.8, width: 0.15, height: 0.1 }

    expect(moveRect(rect, 0.2, -1)).toEqual({
      x: 0.85,
      y: 0,
      width: 0.15,
      height: 0.1,
    })
    expect(resizeRect(rect, 0.5, 0.5)).toEqual({
      x: 0.8,
      y: 0.8,
      width: 0.2,
      height: 0.2,
    })
  })

  it("checks page bounds and compares rectangles with a tolerance", () => {
    const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }

    expect(isWithinPage(rect)).toBe(true)
    expect(isWithinPage({ ...rect, x: 0.8 })).toBe(false)
    expect(isWithinPage({ ...rect, width: 0 })).toBe(false)
    expect(rectsEqual(rect, { ...rect, x: 0.100000005 })).toBe(true)
    expect(rectsEqual(rect, { ...rect, x: 0.10000002 })).toBe(false)
  })

  it("fits a page to available width while preserving visual proportions", () => {
    expect(surfaceForWidth(portraitPage, 306, 1.5)).toEqual({
      width: 459,
      height: 594,
    })
    expect(surfaceForWidth(portraitPage, 0)).toEqual({
      width: 1,
      height: 792 / 612,
    })
  })
})
