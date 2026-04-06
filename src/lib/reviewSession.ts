import type { Confidence } from './review'
import type { LocusId } from './types'

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

export function readActiveReviewSession(): ReviewSessionV1 | null {
  const parsed = readJson<ReviewSessionV1>(ACTIVE_SESSION_KEY)
  if (!parsed || parsed.version !== 1) return null
  if (!parsed.palaceId || !Array.isArray(parsed.queue)) return null
  if (typeof parsed.index !== 'number') return null
  if (!parsed.stats) return null
  return parsed
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

