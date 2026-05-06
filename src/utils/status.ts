export const OFFLINE_AFTER_MS = 5 * 60_000

export function isOnline(timestamp?: number | null, now = Date.now()) {
  return !!timestamp && now - timestamp < OFFLINE_AFTER_MS
}
