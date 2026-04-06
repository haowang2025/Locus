import type { LocusId } from './types'

export const LOCUS_COUNT = 60

export function locusIdFromRouteIndex(routeIndex: number): LocusId {
  const n = Math.max(1, Math.min(LOCUS_COUNT, Math.floor(routeIndex)))
  const s = String(n).padStart(2, '0')
  return `L${s}` as LocusId
}

export function routeIndexFromLocusId(locusId: string): number | null {
  const m = /^L(\d+)$/.exec(locusId)
  if (!m) return null
  const n = Number.parseInt(m[1]!, 10)
  if (!Number.isFinite(n) || n < 1 || n > LOCUS_COUNT) return null
  return n
}

