/**
 * Error hierarchy for API calls (docs/API_CONTRACT.md §1 status codes).
 * Owned by W7 (web core). Signatures fixed by the coordinator.
 */

export type ApiErrorKind =
  | 'disconnected' // network error, timeout, Cloudflare 502/530 HTML page
  | 'auth' // 401
  | 'busy' // 409
  | 'too_large' // 413
  | 'unsupported_media' // 415
  | 'validation' // 422
  | 'assistant_bad_output' // 502 JSON from /assistant/prompt
  | 'assistant_unavailable' // 503 from /assistant/prompt
  | 'sam_unavailable' // 503 from /segment
  | 'server' // 500 / other

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly detail: string

  constructor(kind: ApiErrorKind, status: number | null, detail: string) {
    super(detail || kind)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.detail = detail
  }
}
