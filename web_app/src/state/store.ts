/**
 * App state (zustand). Shape fixed by the coordinator; actions implemented by W7.
 * UI (W8) reads state via useAppStore(selector) and calls actions only — no fetch in components.
 */
import { create } from 'zustand'
import type {
  BoxXYXY,
  ConnectionConfig,
  HealthResponse,
  Mode,
  PromptSuggestion,
  ScopePreference,
  SegmentResult,
} from '../core/types'
import type { ApiError } from '../core/api/errors'

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

const notImplemented = () => {
  throw new Error('not implemented (W7)')
}

export const useAppStore = create<AppState>()(() => ({
  connection: { baseUrl: '', token: '', timeoutMs: 180_000 },
  health: null,
  healthStatus: 'idle',
  healthError: null,
  image: null,
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
  setConnection: notImplemented,
  checkHealth: async () => notImplemented(),
  loadImage: async () => notImplemented(),
  clearImage: notImplemented,
  setMode: notImplemented,
  setBox: notImplemented,
  setPrompt: notImplemented,
  setUserRequest: notImplemented,
  setScopePreference: notImplemented,
  setConfidenceThreshold: notImplemented,
  askAssistant: async () => notImplemented(),
  usePrompt: notImplemented,
  runSegmentation: async () => notImplemented(),
  cancelSegmentation: notImplemented,
  selectCandidate: notImplemented,
}))
