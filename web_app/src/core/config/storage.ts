/**
 * Persist connection settings in localStorage (try/catch guarded). STUB — implemented by W7.
 */
import type { ConnectionConfig } from '../types'

export const DEFAULT_TIMEOUT_MS = 180_000

export function loadConnectionConfig(): ConnectionConfig {
  throw new Error('not implemented (W7)')
}

export function saveConnectionConfig(_config: ConnectionConfig): void {
  throw new Error('not implemented (W7)')
}

/** True when the prompt has non-ASCII chars (SAM 3 only understands English). */
export function isLikelyNonEnglish(_prompt: string): boolean {
  throw new Error('not implemented (W7)')
}
