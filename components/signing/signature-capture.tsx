"use client"

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react"
import { Eraser, PenLine, Type, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { CaptureMethod } from "@/lib/api/types"
import {
  CAPTURE_IMAGE_PATTERN,
  MAX_TYPED_SIGNATURE_CHARACTERS,
  validateSignatureCapture,
} from "@/lib/signing/signing"
import { cn } from "@/lib/utils"

export type CaptureValue = {
  captureMethod: CaptureMethod
  captureData: string
}

/** Wide enough for a legible signature, small enough to stay well under 1 MB. */
const MAX_UPLOAD_WIDTH_PX = 1_200
const MAX_UPLOAD_HEIGHT_PX = 600
/** Refused before reading, so an oversized file never enters memory. */
const MAX_UPLOAD_FILE_BYTES = 4_000_000

const methods: Array<{
  description: string
  icon: typeof PenLine
  label: string
  method: CaptureMethod
}> = [
  {
    description: "Sign with your finger, a stylus, or a mouse.",
    icon: PenLine,
    label: "Draw",
    method: "DRAWN",
  },
  {
    description:
      "Type your full name. This needs no pointing device and is a complete alternative to drawing.",
    icon: Type,
    label: "Type",
    method: "TYPED",
  },
  {
    description: "Upload a PNG or JPEG photograph or scan of your signature.",
    icon: Upload,
    label: "Upload",
    method: "UPLOADED_IMAGE",
  },
]

/**
 * Collects the signature three ways so no signatory is excluded by their
 * device. Every capture stays in component memory: nothing is written to
 * `localStorage`, `sessionStorage`, or IndexedDB, so an interrupted session
 * leaves no partial signature behind on a shared or borrowed device.
 */
export function SignatureCapture({
  disabled,
  onChange,
  signatoryName,
}: {
  disabled: boolean
  onChange: (value: CaptureValue | null) => void
  signatoryName: string
}) {
  const [method, setMethod] = useState<CaptureMethod>("DRAWN")
  const [typed, setTyped] = useState("")
  const [drawn, setDrawn] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function publish(nextMethod: CaptureMethod, data: string | null) {
    if (data === null || data.length === 0) {
      onChange(null)
      return
    }
    onChange({ captureMethod: nextMethod, captureData: data })
  }

  function selectMethod(nextMethod: CaptureMethod) {
    setMethod(nextMethod)
    publish(
      nextMethod,
      nextMethod === "TYPED" ? typed : nextMethod === "DRAWN" ? drawn : uploaded
    )
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploadError(null)
    try {
      const data = await normalizeUploadedSignature(file)
      const problem = validateSignatureCapture({
        captureMethod: "UPLOADED_IMAGE",
        captureData: data,
      })
      if (problem) {
        setUploadError(problem)
        setUploaded(null)
        publish("UPLOADED_IMAGE", null)
        return
      }
      setUploaded(data)
      publish("UPLOADED_IMAGE", data)
    } catch (error) {
      setUploaded(null)
      publish("UPLOADED_IMAGE", null)
      setUploadError(
        error instanceof Error
          ? error.message
          : "That image could not be read. Choose another file."
      )
    }
  }

  return (
    <div>
      {/* Native radios, so arrow keys move between the methods and a screen
          reader announces how many alternatives there are, with no roving
          tabindex to keep correct. */}
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">How would you like to sign?</legend>
        {methods.map((entry) => (
          <label
            className={cn(
              "cursor-pointer rounded-none border px-3 py-2.5 transition has-focus-visible:ring-2 has-focus-visible:ring-ring/30",
              method === entry.method
                ? "border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
                : "bg-card hover:bg-muted"
            )}
            key={entry.method}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <input
                checked={method === entry.method}
                className="sr-only"
                disabled={disabled}
                name="signature-method"
                onChange={() => selectMethod(entry.method)}
                type="radio"
                value={entry.method}
              />
              <entry.icon className="size-4" />
              {entry.label}
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {entry.description}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="mt-4">
        {method === "DRAWN" && (
          <DrawingPad
            disabled={disabled}
            onChange={(data) => {
              setDrawn(data)
              publish("DRAWN", data)
            }}
          />
        )}

        {method === "TYPED" && (
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="typed-signature"
            >
              Your full name
            </label>
            <input
              aria-describedby="typed-signature-description"
              autoComplete="name"
              className="field-input font-heading text-xl"
              disabled={disabled}
              id="typed-signature"
              maxLength={MAX_TYPED_SIGNATURE_CHARACTERS}
              onChange={(event) => {
                setTyped(event.target.value)
                publish("TYPED", event.target.value)
              }}
              placeholder={signatoryName}
              type="text"
              value={typed}
            />
            <p
              className="mt-1.5 text-xs leading-5 text-muted-foreground"
              id="typed-signature-description"
            >
              Your typed name is applied to the document as your signature,
              alongside your name and the time you signed.
            </p>
          </div>
        )}

        {method === "UPLOADED_IMAGE" && (
          <div>
            <label
              className="mb-2 block text-sm font-semibold"
              htmlFor="signature-image"
            >
              Signature image
            </label>
            <input
              accept="image/png,image/jpeg"
              aria-describedby="signature-image-description"
              className="field-input h-auto py-2.5 file:mr-3 file:rounded-none file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              disabled={disabled}
              id="signature-image"
              onChange={(event) => void handleFile(event.target.files?.[0])}
              type="file"
            />
            <p
              className="mt-1.5 text-xs leading-5 text-muted-foreground"
              id="signature-image-description"
            >
              PNG or JPEG only. The image is trimmed to size and re-encoded in
              your browser before it is sent, so nothing else the file carries
              is uploaded.
            </p>
            {uploadError && (
              <p className="mt-2 text-xs leading-5 text-red-700" role="alert">
                {uploadError}
              </p>
            )}
            {uploaded && (
              /* The preview is an in-memory data URL of the signatory's own
                 signature. next/image would send it to the image optimizer,
                 which is exactly what must not happen to a signature. */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="The signature image you selected"
                className="mt-3 max-h-32 rounded-none border bg-white p-2"
                src={uploaded}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DrawingPad({
  disabled,
  onChange,
}: {
  disabled: boolean
  onChange: (data: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const bounds = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(bounds.width * ratio))
    canvas.height = Math.max(1, Math.round(bounds.height * ratio))
    const context = canvas.getContext("2d")
    if (!context) return
    context.scale(ratio, ratio)
    context.lineCap = "round"
    context.lineJoin = "round"
    context.lineWidth = 2.4
    context.strokeStyle = "#0f172a"
  }, [])

  function positionOf(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    const context = canvasRef.current?.getContext("2d")
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    const { x, y } = positionOf(event)
    context.beginPath()
    context.moveTo(x, y)
  }

  function extend(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const context = canvasRef.current?.getContext("2d")
    if (!context) return
    const { x, y } = positionOf(event)
    context.lineTo(x, y)
    context.stroke()
    if (!hasInk) setHasInk(true)
  }

  function finish() {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas || !hasInk) return
    onChange(canvas.toDataURL("image/png"))
  }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <canvas
        aria-label="Signature drawing area"
        className="h-44 w-full touch-none rounded-none border bg-white dark:bg-neutral-100"
        onPointerCancel={finish}
        onPointerDown={start}
        onPointerLeave={finish}
        onPointerMove={extend}
        onPointerUp={finish}
        ref={canvasRef}
        role="img"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs leading-5 text-muted-foreground">
          Drawing needs a finger, stylus, or mouse. If you cannot draw, use Type
          instead — it is accepted in exactly the same way.
        </p>
        <Button
          className="shrink-0 rounded-none"
          disabled={disabled || !hasInk}
          onClick={clear}
          size="sm"
          type="button"
          variant="outline"
        >
          <Eraser />
          Clear
        </Button>
      </div>
    </div>
  )
}

/**
 * Re-encodes a chosen file as a bounded PNG. Decoding and redrawing the image
 * discards everything the original file carried besides its pixels, and keeps
 * the result inside the API's 1 MB decoded-image limit.
 */
async function normalizeUploadedSignature(file: File): Promise<string> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    throw new Error("Only a PNG or JPEG image can be used as a signature.")
  }
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new Error("That file is too large. Choose an image under 4 MB.")
  }

  const source = await readDataUrl(file)
  if (!CAPTURE_IMAGE_PATTERN.test(source)) {
    throw new Error("That file is not a usable PNG or JPEG image.")
  }

  const image = await decodeImage(source)
  const scale = Math.min(
    1,
    MAX_UPLOAD_WIDTH_PX / image.width,
    MAX_UPLOAD_HEIGHT_PX / image.height
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("That image could not be prepared.")
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/png")
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("That file could not be read."))
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(file)
  })
}

function decodeImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error("That file is not a usable PNG or JPEG image."))
    image.src = dataUrl
  })
}
