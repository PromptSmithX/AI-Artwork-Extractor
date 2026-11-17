/**
 * HTTP client for the Colab API. STUB — implemented by W7 (web core).
 * Signatures are fixed; UI code (W8) imports these.
 */
import type {
  ConnectionConfig,
  HealthResponse,
  PromptSuggestion,
  SegmentRequest,
  SegmentResult,
  SuggestRequest,
} from '../types'

export interface ApiClient {
  health(signal?: AbortSignal): Promise<HealthResponse>
  suggestPrompt(req: SuggestRequest, signal?: AbortSignal): Promise<PromptSuggestion>
  segment(req: SegmentRequest, signal?: AbortSignal): Promise<SegmentResult>
}

export function createApiClient(_config: ConnectionConfig): ApiClient {
  throw new Error('not implemented (W7)')
}
