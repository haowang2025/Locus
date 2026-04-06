const SIGNAL_URL_KEY = 'mpalace_signalUrl'

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 chars, avoids I/O/1/0

export function defaultSignalUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.hostname || 'localhost'
  return `${proto}://${host}:8787`
}

export function readSignalUrl(): string {
  try {
    const v = window.localStorage.getItem(SIGNAL_URL_KEY)
    if (v && v.trim()) return v.trim()
  } catch {
    // ignore
  }
  return defaultSignalUrl()
}

export function writeSignalUrl(url: string) {
  try {
    window.localStorage.setItem(SIGNAL_URL_KEY, url)
  } catch {
    // ignore
  }
}

export function normalizeSignalUrl(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (v.startsWith('ws://') || v.startsWith('wss://')) return v
  if (v.startsWith('http://')) return `ws://${v.slice('http://'.length)}`
  if (v.startsWith('https://')) return `wss://${v.slice('https://'.length)}`
  return null
}

export function newRoomCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length]
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}`
}

export function normalizeRoomCode(input: string): string | null {
  const v = input.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, '')
  if (v.length !== 8) return null
  const grouped = `${v.slice(0, 4)}-${v.slice(4, 8)}`
  for (const ch of v) {
    if (!ROOM_ALPHABET.includes(ch)) return null
  }
  return grouped
}

