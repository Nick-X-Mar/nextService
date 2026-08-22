'use client'

/**
 * Browser-side image normalisation, run on every photo before it is uploaded.
 *
 * This exists because of three separate failures on the real upload path:
 *
 *  1. **Format.** The pickers accept `image/*`, but the API only ever stored
 *     JPEG and PNG — so an iPhone's HEIC or a Viber/WhatsApp WebP was accepted
 *     by the browser and then rejected by the server, and because validation
 *     was all-or-nothing a single such file discarded the whole batch. Drawing
 *     to a canvas and re-encoding as JPEG makes every upload one known format.
 *  2. **Size.** A modern phone photo is 3–8MB and three of them went up as one
 *     multipart body through the SSR compute layer. Re-encoding at
 *     MAX_DIMENSION lands a typical photo at 200–500KB.
 *  3. **Time.** Uploading 20MB over mobile data is slow enough that people
 *     assume it hung and navigate away mid-request.
 *
 * Anything the browser cannot decode (an old Android WebView with no HEIC
 * support, a corrupt file) is passed through untouched — the server still
 * validates, and a pass-through failure is better than dropping the photo
 * silently here.
 */

// Longest edge, in px. Damage photos are viewed in a grid and opened at most
// full-screen on a phone; beyond this is bytes nobody sees.
const MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.85
// Below this a re-encode usually makes the file *bigger* without helping.
const SKIP_BELOW_BYTES = 200 * 1024

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/** Swap whatever extension the original had for .jpg, since we re-encode. */
function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'photo'
  return `${base}.jpg`
}

/**
 * Returns a JPEG version of `file`, scaled so its longest edge is at most
 * MAX_DIMENSION. Returns the original file unchanged if it is already small
 * and in an accepted format, or if the browser cannot decode it.
 */
export async function compressImage(file: File): Promise<File> {
  const alreadyFine =
    file.size <= SKIP_BELOW_BYTES && (file.type === 'image/jpeg' || file.type === 'image/png')
  if (alreadyFine) return file

  try {
    const img = await loadImage(file)
    const { width, height } = img
    if (!width || !height) return file

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)

    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // JPEG has no alpha; without this, transparent PNGs re-encode to black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await canvasToBlob(canvas, JPEG_QUALITY)
    if (!blob) return file

    // A re-encode that gained bytes is only worth keeping when it also changed
    // the format into one the server accepts.
    const wasAcceptedFormat = file.type === 'image/jpeg' || file.type === 'image/png'
    if (blob.size >= file.size && wasAcceptedFormat) return file

    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

/** Compress a batch, preserving order. */
export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map((f) => compressImage(f)))
}
