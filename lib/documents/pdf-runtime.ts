/**
 * Single place that loads pdf.js and points it at the self-hosted worker.
 *
 * The import is dynamic so the library stays out of the initial bundle, and the
 * worker URL is resolved through the bundler so it is served from this origin
 * rather than a CDN. A strict Content-Security-Policy therefore needs only
 * `worker-src 'self'`.
 */
export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString()
  return pdfjs
}

/**
 * pdf.js may transfer the buffer it is given to its worker, which detaches the
 * original. Every call therefore hands over its own copy.
 */
export function detachableCopy(bytes: Uint8Array): Uint8Array {
  return bytes.slice()
}

/**
 * Options every `getDocument` call shares.
 *
 * pdf.js will use `eval` for some font and pattern work when it is allowed to.
 * The production Content-Security-Policy grants no `unsafe-eval`, so the
 * library is told not to reach for it rather than being left to fail at the
 * moment a document happens to need it.
 */
export const pdfDocumentDefaults = {
  isEvalSupported: false,
} as const
