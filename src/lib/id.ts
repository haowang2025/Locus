export function newId(prefix = ''): string {
  const cryptoAny = globalThis.crypto as Crypto | undefined
  const uuid = cryptoAny?.randomUUID?.()
  if (uuid) return prefix ? `${prefix}_${uuid}` : uuid
  return `${prefix ? `${prefix}_` : ''}${Date.now()}_${Math.random().toString(16).slice(2)}`
}

