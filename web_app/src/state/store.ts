/**
 * App state (zustand). Shape fixed by the coordinator; actions implemented by W7.
 * UI (W8) reads state via useAppStore(selector) and calls actions only — no fetch in components.
 */
import { create } from 'zustand'
import { createApiClient, type ApiClient } from '../core/api/client'
import { ApiError } from '../core/api/errors'
import { loadConnectionConfig, saveConnectionConfig } from '../core/config/storage'
import { boxToNormCxCyWh, isUsableBox } from '../core/geometry/box'
import type {
  BoxXYXY,
  ConnectionConfig,
  HealthResponse,
  Mode,
  PromptSuggestion,
  ScopePreference,
  SegmentResult,
} from '../core/types'

export type RequestStatus = 'idle' | 'loading' | 'success' | 'error'

export interface LoadedImage {
  file: File
  /** Object URL for <img src>. */
  url: string
  naturalWidth: number
  naturalHeight: number
}

export interface AppState {
  // connection
  connection: ConnectionConfig
  health: HealthResponse | null
  healthStatus: RequestStatus
  healthError: ApiError | null

  // input
  image: LoadedImage | null
  imageStatus?: RequestStatus
  imageError?: string | null
  mode: Mode
  box: BoxXYXY | null
  prompt: string
  userRequest: string
  scopePreference: ScopePreference
  confidenceThreshold: number

  // assistant
  suggestion: PromptSuggestion | null
  suggestStatus: RequestStatus
  suggestError: ApiError | null

  // segmentation
  result: SegmentResult | null
  segmentStatus: RequestStatus
  segmentError: ApiError | null
  /** Request start time (ms epoch) to show elapsed time while loading. */
  segmentStartedAt: number | null
  selectedCandidateId: number | null

  // actions
  setConnection: (patch: Partial<ConnectionConfig>) => void
  checkHealth: () => Promise<void>
  loadImage: (file: File) => Promise<void>
  clearImage: () => void
  setMode: (mode: Mode) => void
  setBox: (box: BoxXYXY | null) => void
  setPrompt: (prompt: string) => void
  setUserRequest: (text: string) => void
  setScopePreference: (scope: ScopePreference) => void
  setConfidenceThreshold: (value: number) => void
  askAssistant: () => Promise<void>
  /** Puts an alternative/suggested prompt into the prompt field. Never runs SAM. */
  usePrompt: (prompt: string) => void
  runSegmentation: () => Promise<void>
  cancelSegmentation: () => void
  selectCandidate: (id: number | null) => void
}

type ApiClientFactory = (config: ConnectionConfig) => ApiClient

let apiClientFactory: ApiClientFactory = createApiClient

/**
 * Dependency injection hook for tests to mock ApiClient.
 */
export function setApiClientFactory(factory: ApiClientFactory | null): void {
  apiClientFactory = factory ?? createApiClient
}

function getApiClient(config: ConnectionConfig): ApiClient {
  return apiClientFactory(config)
}

let activeAbortController: AbortController | null = null

async function readNaturalDimensions(
  file: File,
  objectUrl: string,
): Promise<{ naturalWidth: number; naturalHeight: number }> {
  // Check if test provided mock dimensions on the File object
  if ('_mockWidth' in file && '_mockHeight' in file) {
    return {
      naturalWidth: Number((file as unknown as { _mockWidth: number })._mockWidth),
      naturalHeight: Number((file as unknown as { _mockHeight: number })._mockHeight),
    }
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const dims = { naturalWidth: bmp.width, naturalHeight: bmp.height }
      bmp.close?.()
      if (dims.naturalWidth > 0 && dims.naturalHeight > 0) {
        return dims
      }
    } catch {
      // Fallback to Image element
    }
  }

  if (typeof Image !== 'undefined') {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        resolve({
          naturalWidth: img.naturalWidth || img.width,
          naturalHeight: img.naturalHeight || img.height,
        })
      }
      img.onerror = (e) => {
        reject(new Error(`Failed to decode image: ${e}`))
      }
      img.src = objectUrl
    })
  }

  throw new Error('No image decoding facility available in environment')
}

export const useAppStore = create<AppState>()((set, get) => ({
  connection: loadConnectionConfig(),
  health: null,
  healthStatus: 'idle',
  healthError: null,

  image: null,
  imageStatus: 'idle',
  imageError: null,
  mode: 'text',
  box: null,
  prompt: '',
  userRequest: '',
  scopePreference: 'auto',
  confidenceThreshold: 0.35,

  suggestion: null,
  suggestStatus: 'idle',
  suggestError: null,

  result: null,
  segmentStatus: 'idle',
  segmentError: null,
  segmentStartedAt: null,
  selectedCandidateId: null,

  setConnection: (patch: Partial<ConnectionConfig>) => {
    set((state) => {
      const newConfig = { ...state.connection, ...patch }
      saveConnectionConfig(newConfig)
      return { connection: newConfig }
    })
  },

  checkHealth: async () => {
    set({ healthStatus: 'loading', healthError: null })
    try {
      const client = getApiClient(get().connection)
      const res = await client.health()
      set({ health: res, healthStatus: 'success', healthError: null })
    } catch (err: unknown) {
      set({
        health: null,
        healthStatus: 'error',
        healthError: err instanceof ApiError ? err : new ApiError('server', null, String(err)),
      })
    }
  },

  loadImage: async (file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!file.type || !allowed.includes(file.type.toLowerCase())) {
      const errorMsg = `Unsupported image type "${file.type}". Allowed types: JPEG, PNG, WebP.`
      set({ imageStatus: 'error', imageError: errorMsg })
      throw new Error(errorMsg)
    }

    const MAX_SIZE = 20 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      const errorMsg = `Image size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 20 MB limit.`
      set({ imageStatus: 'error', imageError: errorMsg })
      throw new Error(errorMsg)
    }

    const prevImage = get().image
    const prevResult = get().result

    if (prevImage?.url) {
      URL.revokeObjectURL(prevImage.url)
    }
    if (prevResult) {
      prevResult.dispose()
    }

    const url = URL.createObjectURL(file)
    let dimensions: { naturalWidth: number; naturalHeight: number }
    try {
      dimensions = await readNaturalDimensions(file, url)
    } catch (err) {
      URL.revokeObjectURL(url)
      const errorMsg = err instanceof Error ? err.message : String(err)
      set({ imageStatus: 'error', imageError: errorMsg })
      throw err
    }

    set({
      image: {
        file,
        url,
        naturalWidth: dimensions.naturalWidth,
        naturalHeight: dimensions.naturalHeight,
      },
      imageStatus: 'success',
      imageError: null,
      box: null,
      suggestion: null,
      suggestStatus: 'idle',
      suggestError: null,
      result: null,
      segmentStatus: 'idle',
      segmentError: null,
      segmentStartedAt: null,
      selectedCandidateId: null,
    })
  },

  clearImage: () => {
    const prevImage = get().image
    const prevResult = get().result

    if (prevImage?.url) {
      URL.revokeObjectURL(prevImage.url)
    }
    if (prevResult) {
      prevResult.dispose()
    }

    set({
      image: null,
      imageStatus: 'idle',
      imageError: null,
      box: null,
      suggestion: null,
      suggestStatus: 'idle',
      suggestError: null,
      result: null,
      segmentStatus: 'idle',
      segmentError: null,
      segmentStartedAt: null,
      selectedCandidateId: null,
    })
  },

  setMode: (mode: Mode) => {
    set({ mode })
  },

  setBox: (box: BoxXYXY | null) => {
    set({ box })
  },

  setPrompt: (prompt: string) => {
    set({ prompt })
  },

  setUserRequest: (userRequest: string) => {
    set({ userRequest })
  },

  setScopePreference: (scopePreference: ScopePreference) => {
    set({ scopePreference })
  },

  setConfidenceThreshold: (confidenceThreshold: number) => {
    set({ confidenceThreshold })
  },

  askAssistant: async () => {
    const { image, userRequest, scopePreference, connection, prompt, suggestion } = get()

    if (!image) {
      const err = new ApiError('validation', 422, 'Cannot request prompt suggestion without an image.')
      set({ suggestStatus: 'error', suggestError: err })
      return
    }

    const trimmedReq = (userRequest || '').trim()
    if (!trimmedReq) {
      const err = new ApiError('validation', 422, 'User request cannot be empty.')
      set({ suggestStatus: 'error', suggestError: err })
      return
    }

    set({ suggestStatus: 'loading', suggestError: null })

    try {
      const client = getApiClient(connection)
      const res = await client.suggestPrompt({
        image: image.file,
        filename: image.file.name,
        userRequest: trimmedReq,
        scopePreference,
      })

      const prevSuggestedPrompt = suggestion?.sam_prompt
      const shouldUpdatePrompt = !prompt || prompt === prevSuggestedPrompt

      set({
        suggestion: res,
        suggestStatus: 'success',
        suggestError: null,
        prompt: shouldUpdatePrompt ? res.sam_prompt : prompt,
      })
    } catch (err: unknown) {
      set({
        suggestStatus: 'error',
        suggestError: err instanceof ApiError ? err : new ApiError('server', null, String(err)),
      })
    }
  },

  usePrompt: (prompt: string) => {
    set({ prompt })
  },

  runSegmentation: async () => {
    const { image, mode, prompt, box, confidenceThreshold, connection, result: prevResult } = get()

    if (!image) {
      const err = new ApiError('validation', 422, 'Cannot run segmentation without an image.')
      set({ segmentStatus: 'error', segmentError: err })
      return
    }

    const trimmedPrompt = (prompt || '').trim()
    if ((mode === 'text' || mode === 'text_box') && !trimmedPrompt) {
      const err = new ApiError('validation', 422, 'Prompt is required for text and text_box mode.')
      set({ segmentStatus: 'error', segmentError: err })
      return
    }

    if ((mode === 'box' || mode === 'text_box') && !isUsableBox(box)) {
      const err = new ApiError('validation', 422, 'A usable bounding box is required for box and text_box mode.')
      set({ segmentStatus: 'error', segmentError: err })
      return
    }

    let normBbox: [number, number, number, number] | undefined
    if ((mode === 'box' || mode === 'text_box') && box) {
      try {
        normBbox = boxToNormCxCyWh(box, image.naturalWidth, image.naturalHeight)
      } catch (err) {
        const errObj = new ApiError(
          'validation',
          422,
          `Invalid bounding box: ${err instanceof Error ? err.message : String(err)}`,
        )
        set({ segmentStatus: 'error', segmentError: errObj })
        return
      }
    }

    if (prevResult) {
      prevResult.dispose()
    }

    if (activeAbortController) {
      activeAbortController.abort()
    }
    const controller = new AbortController()
    activeAbortController = controller

    set({
      result: null,
      segmentStatus: 'loading',
      segmentError: null,
      segmentStartedAt: Date.now(),
      selectedCandidateId: null,
    })

    try {
      const client = getApiClient(connection)
      const res = await client.segment(
        {
          image: image.file,
          filename: image.file.name,
          mode,
          prompt: mode === 'box' ? undefined : trimmedPrompt,
          bbox: normBbox,
          confidenceThreshold,
        },
        controller.signal,
      )

      if (activeAbortController === controller) {
        activeAbortController = null
        set({
          result: res,
          segmentStatus: 'success',
          segmentError: null,
          segmentStartedAt: null,
          selectedCandidateId: null,
        })
      }
    } catch (err: unknown) {
      const wasAborted =
        controller.signal.aborted || (err as Error)?.name === 'AbortError'

      if (activeAbortController === controller) {
        activeAbortController = null
      }

      if (wasAborted) {
        // User cancel: return to idle without error
        set({
          segmentStatus: 'idle',
          segmentError: null,
          segmentStartedAt: null,
        })
        return
      }

      set({
        segmentStatus: 'error',
        segmentError: err instanceof ApiError ? err : new ApiError('server', null, String(err)),
        segmentStartedAt: null,
      })
    }
  },

  cancelSegmentation: () => {
    if (activeAbortController) {
      activeAbortController.abort()
      activeAbortController = null
    }
    set({
      segmentStatus: 'idle',
      segmentStartedAt: null,
    })
  },

  selectCandidate: (id: number | null) => {
    set({ selectedCandidateId: id })
  },
}))
