/**
 * Parse the /api/v1/segment ZIP (contract §2) into a SegmentResult.
 */
import JSZip from 'jszip'
import { ApiError } from '../api/errors'
import type {
  CandidateAssets,
  CandidateFileKey,
  SegmentMetadata,
  SegmentResult,
} from '../types'

const FILE_KEYS: CandidateFileKey[] = ['mask', 'overlay', 'cutout', 'cutout_crop']

export async function parseSegmentZip(zipBlob: Blob): Promise<SegmentResult> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(zipBlob)
  } catch (err) {
    throw new ApiError('server', null, `Failed to unpack ZIP archive: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Look for result/metadata.json with fallback to metadata.json
  let metadataFile = zip.file('result/metadata.json')
  let folderPrefix = 'result/'
  if (!metadataFile) {
    metadataFile = zip.file('metadata.json')
    folderPrefix = ''
  }

  if (!metadataFile) {
    throw new ApiError('server', null, 'Missing metadata.json in segment ZIP')
  }

  let metadataText: string
  try {
    metadataText = await metadataFile.async('string')
  } catch (err) {
    throw new ApiError('server', null, `Failed to read metadata.json: ${err instanceof Error ? err.message : String(err)}`)
  }

  let metadata: SegmentMetadata
  try {
    metadata = JSON.parse(metadataText)
  } catch (err) {
    throw new ApiError('server', null, `Malformed JSON in metadata.json: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Validate minimal shape per contract §2
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    typeof metadata.prompt !== 'string' ||
    typeof metadata.mode !== 'string' ||
    !Array.isArray(metadata.image_size) ||
    metadata.image_size.length !== 2 ||
    typeof metadata.confidence_threshold !== 'number' ||
    typeof metadata.num_candidates !== 'number' ||
    !Array.isArray(metadata.candidates)
  ) {
    throw new ApiError('server', null, 'Malformed metadata.json shape in segment ZIP')
  }

  const createdUrls: string[] = []
  const candidates: CandidateAssets[] = []

  for (const candidateMeta of metadata.candidates) {
    const urls: Partial<Record<CandidateFileKey, string>> = {}
    const blobs: Partial<Record<CandidateFileKey, Blob>> = {}

    if (candidateMeta.files && typeof candidateMeta.files === 'object') {
      for (const key of FILE_KEYS) {
        const relativeName = candidateMeta.files[key]
        if (!relativeName) {
          continue
        }

        // Search using folderPrefix + relativeName, then relativeName
        const fileEntry =
          zip.file(folderPrefix + relativeName) ||
          zip.file(relativeName)

        if (fileEntry) {
          const buffer = await fileEntry.async('arraybuffer')
          const blob = new Blob([buffer], { type: 'image/png' })
          const url = URL.createObjectURL(blob)
          createdUrls.push(url)
          urls[key] = url
          blobs[key] = blob
        }
      }
    }

    candidates.push({
      meta: candidateMeta,
      urls,
      blobs,
    })
  }

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const url of createdUrls) {
      URL.revokeObjectURL(url)
    }
  }

  return {
    metadata,
    candidates,
    zipBlob,
    dispose,
  }
}
