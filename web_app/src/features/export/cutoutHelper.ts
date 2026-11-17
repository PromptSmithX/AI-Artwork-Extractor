import { useAppStore } from '../../state/store'
import type { CandidateAssets } from '../../core/types'

/**
 * Rebuilds full-canvas cutout losslessly in the browser using the store's action.
 */
export async function getFullCutoutBlob(candidate: CandidateAssets): Promise<Blob | null> {
  const store = useAppStore.getState()
  if (typeof store.getFullCutoutBlob === 'function') {
    return store.getFullCutoutBlob(candidate.meta.id)
  }
  return candidate.blobs.cutout || null
}
