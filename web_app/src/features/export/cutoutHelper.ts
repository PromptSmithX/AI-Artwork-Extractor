import { useAppStore } from '../../state/store'
import type { CandidateAssets } from '../../core/types'

/**
 * Rebuilds full-canvas cutout losslessly in the browser when lean profile is used.
 * Prefers store.getFullCutoutBlob if implemented by W7, or uses canvas composite.
 */
export async function getFullCutoutBlob(candidate: CandidateAssets): Promise<Blob | null> {
  // If already present (e.g. full profile)
  if (candidate.blobs.cutout) {
    return candidate.blobs.cutout
  }

  // If W7 store provides getFullCutoutBlob action
  const store = useAppStore.getState()
  if (typeof (store as any).getFullCutoutBlob === 'function') {
    try {
      const blob = await (store as any).getFullCutoutBlob(candidate.meta.id)
      if (blob) return blob
    } catch {
      // Fallback to canvas
    }
  }

  // Fallback: reconstruct using canvas with destination-in mask
  const image = store.image
  const maskUrl = candidate.urls.mask
  if (!image || !maskUrl) return null

  if (typeof document === 'undefined') return null

  return new Promise<Blob | null>((resolve) => {
    const origImg = new Image()
    const maskImg = new Image()
    let loadedCount = 0

    const onAssetLoad = () => {
      loadedCount++
      if (loadedCount < 2) return

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }

      // Draw original image
      ctx.drawImage(origImg, 0, 0, canvas.width, canvas.height)
      // Composite mask alpha
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height)

      canvas.toBlob((blob) => resolve(blob), 'image/png')
    }

    origImg.onload = onAssetLoad
    maskImg.onload = onAssetLoad
    origImg.onerror = () => resolve(null)
    maskImg.onerror = () => resolve(null)

    origImg.src = image.url
    maskImg.src = maskUrl
  })
}
