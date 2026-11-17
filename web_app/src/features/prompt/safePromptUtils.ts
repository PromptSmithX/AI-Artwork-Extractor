import * as storageCore from '../../core/config/storage'

export function safeIsLikelyNonEnglish(prompt: string): boolean {
  if (!prompt || prompt.trim() === '') return false
  try {
    return storageCore.isLikelyNonEnglish(prompt)
  } catch {
    // Non-ASCII check fallback (character code > 127)
    for (let i = 0; i < prompt.length; i++) {
      if (prompt.charCodeAt(i) > 127) return true
    }
    return false
  }
}
