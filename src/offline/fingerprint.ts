/** Content identity only, not authentication. A deterministic 128-bit fallback supports non-secure local origins. */
export async function contentFingerprint(text: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('')
  }
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
  return seeds.map((seed, j) => { let hash = seed; for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i) + j * 257; hash = Math.imul(hash, 0x01000193); hash ^= hash >>> 13 } return (hash >>> 0).toString(16).padStart(8, '0') }).join('')
}
