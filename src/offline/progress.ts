export interface ProgressEntry { rating: 0 | 1 | 2; reviews: number; updatedAt: string }
export interface ProgressFile { version: 1; palaceId: string; contentFingerprint: string; seedResetAt?: string; entries: Record<string, ProgressEntry> }
export function validateProgress(value: unknown, palaceId: string, allowed: Set<string>, contentFingerprint: string): ProgressFile {
  if (!value || typeof value !== 'object') throw new Error('进度文件格式错误')
  const x = value as ProgressFile
  if (x.version !== 1 || x.palaceId !== palaceId || x.contentFingerprint !== contentFingerprint || !x.entries || typeof x.entries !== 'object' || Array.isArray(x.entries)) throw new Error('进度文件不属于这个宫殿')
  if (x.seedResetAt !== undefined && (typeof x.seedResetAt !== 'string' || !Number.isFinite(Date.parse(x.seedResetAt)))) throw new Error('进度重置时间无效')
  const entries: Record<string, ProgressEntry> = Object.create(null)
  for (const [id, entry] of Object.entries(x.entries)) {
    if (!allowed.has(id)) throw new Error('进度文件包含未知材料单元')
    if (!entry || ![0, 1, 2].includes(entry.rating) || !Number.isSafeInteger(entry.reviews) || entry.reviews < 0 || entry.reviews > 10000000 || typeof entry.updatedAt !== 'string' || !Number.isFinite(Date.parse(entry.updatedAt))) throw new Error('进度记录无效')
    entries[id] = { rating: entry.rating, reviews: entry.reviews, updatedAt: entry.updatedAt }
  }
  return { version: 1, palaceId, contentFingerprint, entries, ...(x.seedResetAt ? { seedResetAt: x.seedResetAt } : {}) }
}

export function mergeInitialProgress(initial: Record<string, ProgressEntry>, saved: ProgressFile): ProgressFile {
  const entries: Record<string, ProgressEntry> = Object.assign(Object.create(null), saved.entries), resetAt = saved.seedResetAt ? Date.parse(saved.seedResetAt) : -Infinity
  for (const [id, entry] of Object.entries(initial)) if (Date.parse(entry.updatedAt) > resetAt && (!entries[id] || Date.parse(entry.updatedAt) > Date.parse(entries[id].updatedAt))) entries[id] = entry
  return { ...saved, entries }
}
