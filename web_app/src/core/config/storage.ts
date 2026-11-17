/**
 * Persist connection settings in localStorage (try/catch guarded).
 */
import type { ConnectionConfig } from '../types'

export const DEFAULT_TIMEOUT_MS = 180_000

const KEY_BASE_URL = 'aae.baseUrl'
const KEY_TOKEN = 'aae.token'
const KEY_TIMEOUT_MS = 'aae.timeoutMs'

export function loadConnectionConfig(): ConnectionConfig {
  try {
    const baseUrl = localStorage.getItem(KEY_BASE_URL) ?? ''
    const token = localStorage.getItem(KEY_TOKEN) ?? ''
    const timeoutRaw = localStorage.getItem(KEY_TIMEOUT_MS)
    let timeoutMs = DEFAULT_TIMEOUT_MS
    if (timeoutRaw !== null) {
      const parsed = Number(timeoutRaw)
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed
      }
    }
    return { baseUrl, token, timeoutMs }
  } catch {
    return { baseUrl: '', token: '', timeoutMs: DEFAULT_TIMEOUT_MS }
  }
}

export function saveConnectionConfig(config: ConnectionConfig): void {
  try {
    localStorage.setItem(KEY_BASE_URL, config.baseUrl)
    localStorage.setItem(KEY_TOKEN, config.token)
    localStorage.setItem(KEY_TIMEOUT_MS, String(config.timeoutMs))
  } catch {
    // Ignore storage quota / private mode errors
  }
}

/** True when the prompt has non-ASCII chars (SAM 3 only understands English). */
export function isLikelyNonEnglish(prompt: string): boolean {
  for (let i = 0; i < prompt.length; i++) {
    if (prompt.charCodeAt(i) > 0x7f) {
      return true
    }
  }
  return false
}
