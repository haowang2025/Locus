import type { Confidence } from './review'
import type { PalacePlan } from './palaceTypes'
import { sourceFingerprint } from './palaceModelProposal'
import type { CardRecord, LocusId } from './types'

type ReviewStats = {
  rated: number
  c0: number
  c1: number
  c2: number
}

export type ReviewSessionKind = 'today' | 'palace'

export type ReviewSessionV1 = {
  version: 1
  id: string
  kind: ReviewSessionKind
  palaceId: string
  queue: LocusId[]
  /** Parallel IDs for semantic cards; null entries preserve legacy card review. */
  unitQueue?: Array<string | null>
  contentFingerprint?: string
  index: number
  startedAt: string
  stats: ReviewStats
}

export type ReviewSummaryV1 = {
  version: 1
  sessionId: string
  kind: ReviewSessionKind
  palaceId: string
  startedAt: string
  finishedAt: string
  stats: ReviewStats
}

const ACTIVE_SESSION_KEY = 'mpalace_activeReviewSession_v1'
const LAST_SUMMARY_KEY = 'mpalace_lastReviewSummary_v1'

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function parseReviewSession(value: unknown): ReviewSessionV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const parsed = value as ReviewSessionV1
  const validId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(v)
  if (parsed.version !== 1 || !validId(parsed.id) || !validId(parsed.palaceId) || !['today', 'palace'].includes(parsed.kind)) return null
  if (!Array.isArray(parsed.queue) || parsed.queue.length < 1 || parsed.queue.length > 1000 || parsed.queue.some(id => typeof id !== 'string' || !/^L(?:0[1-9]|[1-5][0-9]|60)$/.test(id))) return null
  if (!Number.isSafeInteger(parsed.index) || parsed.index < 0 || parsed.index >= parsed.queue.length) return null
  if (typeof parsed.startedAt !== 'string' || !Number.isFinite(Date.parse(parsed.startedAt))) return null
  if (!parsed.stats || typeof parsed.stats !== 'object' || Array.isArray(parsed.stats)) return null
  const { rated, c0, c1, c2 } = parsed.stats
  if (![rated, c0, c1, c2].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000000) || rated !== c0 + c1 + c2) return null
  if (parsed.unitQueue !== undefined && (!Array.isArray(parsed.unitQueue) || parsed.unitQueue.length !== parsed.queue.length || parsed.unitQueue.some(id => id !== null && !validId(id)))) return null
  if (parsed.contentFingerprint !== undefined && (typeof parsed.contentFingerprint !== 'string' || parsed.contentFingerprint.length > 256)) return null
  return { version: 1, id: parsed.id, kind: parsed.kind, palaceId: parsed.palaceId, queue: [...parsed.queue], index: parsed.index, startedAt: parsed.startedAt, stats: { rated, c0, c1, c2 }, ...(parsed.unitQueue ? { unitQueue: [...parsed.unitQueue] } : {}), ...(parsed.contentFingerprint ? { contentFingerprint: parsed.contentFingerprint } : {}) }
}
export function readActiveReviewSession(): ReviewSessionV1 | null { return parseReviewSession(readJson<unknown>(ACTIVE_SESSION_KEY)) }

export function reviewPlanFingerprint(plan: PalacePlan): string {
  return sourceFingerprint({ title: 'locus-review-plan-v1', text: JSON.stringify({ source: plan.source.text, sceneId: plan.sceneId, sceneVersion: plan.sceneVersion, units: plan.units.map(u => ({ id: u.id, spans: u.spans })), bindings: plan.cues.map(c => ({ unitId: c.unitId, anchorId: c.anchorId })) }) })
}
export function isReviewSessionCompatible(session: ReviewSessionV1, cards: CardRecord[], plan?: PalacePlan, expectedFingerprint?: string): boolean {
  if (!parseReviewSession(session)) return false
  if (plan && session.contentFingerprint !== (expectedFingerprint ?? reviewPlanFingerprint(plan))) return false
  const byId = new Map(cards.map(c => [c.locusId, c]))
  return session.queue.every((locusId, i) => {
    const card = byId.get(locusId), unitId = session.unitQueue?.[i]
    if (!card || card.palaceId !== session.palaceId) return false
    if (card.mnemonic) return typeof unitId === 'string' && card.mnemonic.unitIds.includes(unitId) && !!plan?.units.some(u => u.id === unitId)
    return !unitId
  })
}

export function writeActiveReviewSession(session: ReviewSessionV1 | null) {
  try {
    if (!session) {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY)
      return
    }
  } catch {
    // ignore
  }
  writeJson(ACTIVE_SESSION_KEY, session)
}

export function clearActiveReviewSession() {
  writeActiveReviewSession(null)
}

export function updateActiveReviewSession(patch: (prev: ReviewSessionV1) => ReviewSessionV1) {
  const prev = readActiveReviewSession()
  if (!prev) return null
  const next = patch(prev)
  writeActiveReviewSession(next)
  return next
}

export function bumpReviewStats(stats: ReviewStats, confidence: Confidence) {
  const next: ReviewStats = { ...stats, rated: stats.rated + 1 }
  if (confidence === 0) next.c0 += 1
  if (confidence === 1) next.c1 += 1
  if (confidence === 2) next.c2 += 1
  return next
}

export function defaultReviewStats(): ReviewStats {
  return { rated: 0, c0: 0, c1: 0, c2: 0 }
}

export function writeLastReviewSummary(summary: ReviewSummaryV1) {
  writeJson(LAST_SUMMARY_KEY, summary)
}

export function readLastReviewSummary(): ReviewSummaryV1 | null {
  const parsed = readJson<ReviewSummaryV1>(LAST_SUMMARY_KEY)
  if (!parsed || parsed.version !== 1) return null
  return parsed
}

