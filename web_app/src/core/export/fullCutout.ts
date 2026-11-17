/**
 * Pure helper for composing a full-canvas cutout from a crop and cropBox coordinates.
 * contract §2 lean profile: Web UI rebuilds the full-canvas cutout losslessly
 * by placing cutout_crop at crop_box_xyxy_px on a transparent canvas of image_size.
 */

export type CropBoxXYXY = [number, number, number, number]
export type ImageSizeWH = [number, number]

export interface Canvas2DContextLike {
  drawImage(image: unknown, dx: number, dy: number): void
  getImageData?(sx: number, sy: number, sw: number, sh: number): ImageData
}

export interface CanvasElementLike {
  width: number
  height: number
  getContext(type: '2d'): Canvas2DContextLike | null
  convertToBlob?(options?: { type?: string }): Promise<Blob>
  toBlob?(callback: (blob: Blob | null) => void, type?: string): void
}

export type CanvasFactory = (width: number, height: number) => CanvasElementLike
export type ImageBitmapLoader = (blob: Blob) => Promise<unknown>

let customCanvasFactory: CanvasFactory | null = null
let customBitmapLoader: ImageBitmapLoader | null = null

export function setCanvasFactory(factory: CanvasFactory | null): void {
  customCanvasFactory = factory
}

export function setImageBitmapLoader(loader: ImageBitmapLoader | null): void {
  customBitmapLoader = loader
}

function defaultCanvasFactory(width: number, height: number): CanvasElementLike {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height) as unknown as CanvasElementLike
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const el = document.createElement('canvas')
    el.width = width
    el.height = height
    return el as unknown as CanvasElementLike
  }
  throw new Error('No Canvas implementation available in environment')
}

async function defaultBitmapLoader(blob: Blob): Promise<unknown> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    })
  }
  if (typeof Image !== 'undefined') {
    const url = URL.createObjectURL(blob)
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = (e) => {
        URL.revokeObjectURL(url)
        reject(new Error(`Failed to load crop image: ${e}`))
      }
      img.src = url
    })
  }
  throw new Error('No image bitmap loader available in environment')
}

export async function composeFullCutout(
  cropBlob: Blob,
  cropBox: CropBoxXYXY,
  imageSize: ImageSizeWH,
): Promise<Blob> {
  if (!cropBlob) {
    throw new Error('cropBlob is required')
  }

  if (!cropBox || cropBox.length !== 4) {
    throw new Error('cropBox must be a 4-element tuple [x0, y0, x1, y1]')
  }

  const [x0, y0, x1, y1] = cropBox
  if (
    !Number.isFinite(x0) ||
    !Number.isFinite(y0) ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1)
  ) {
    throw new Error('cropBox coordinates must be finite numbers')
  }

  const cropW = x1 - x0
  const cropH = y1 - y0
  if (cropW <= 0 || cropH <= 0) {
    throw new Error(`Zero or negative crop box dimensions: width=${cropW}, height=${cropH}`)
  }

  if (!imageSize || imageSize.length !== 2) {
    throw new Error('imageSize must be a 2-element tuple [width, height]')
  }

  const [imgW, imgH] = imageSize
  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW <= 0 || imgH <= 0) {
    throw new Error(`Invalid imageSize: width=${imgW}, height=${imgH}`)
  }

  const canvasFactory = customCanvasFactory ?? defaultCanvasFactory
  const canvas = canvasFactory(imgW, imgH)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to acquire 2D rendering context')
  }

  const bitmapLoader = customBitmapLoader ?? defaultBitmapLoader
  const bitmap = await bitmapLoader(cropBlob)

  try {
    ctx.drawImage(bitmap, x0, y0)
  } finally {
    if (bitmap && typeof (bitmap as { close?: () => void }).close === 'function') {
      ;(bitmap as { close: () => void }).close()
    }
  }

  if (typeof canvas.convertToBlob === 'function') {
    return await canvas.convertToBlob({ type: 'image/png' })
  }

  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob!((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas toBlob returned null'))
        }
      }, 'image/png')
    })
  }

  throw new Error('Canvas does not support convertToBlob or toBlob')
}
