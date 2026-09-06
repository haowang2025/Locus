import type { CardRecord, PalaceRecord } from './types'

export type Confidence = 0 | 1 | 2

export function isCardFilled(card: CardRecord) {
  return Boolean(card.prompt.trim() || card.answer.trim() || card.note?.trim() || card.imageIds.length > 0 || card.modelId)
}

export function confidenceLabel(confidence: Confidence) {
  if (confidence === 0) return '忘了'
  if (confidence === 1) return '想了一会'
  return '秒答'
}

function clampDate(date: Date) {
  return Number.isFinite(date.getTime()) ? date : new Date()
}

function parseIso(iso: string | undefined) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : null
}

export function intervalDaysForConfidence(confidence: Confidence) {
  if (confidence === 0) return 1
  if (confidence === 1) return 3
  return 7
}

export function computeNextReviewAtIso(now: Date, confidence: Confidence) {
  const days = intervalDaysForConfidence(confidence)
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function isCardDue(card: Pick<CardRecord, 'confidence' | 'lastReviewedAt' | 'nextReviewAt'>, now: Date) {
  const nowClamped = clampDate(now)
  const last = parseIso(card.lastReviewedAt)
  if (!last) return true

  const next = parseIso(card.nextReviewAt)
  if (next) return next.getTime() <= nowClamped.getTime()

  const confidence = (card.confidence ?? 0) as Confidence
  const dueAt = last.getTime() + intervalDaysForConfidence(confidence) * 24 * 60 * 60 * 1000
  return dueAt <= nowClamped.getTime()
}

function reviewPriorityKey(card: CardRecord, now: Date) {
  const last = parseIso(card.lastReviewedAt)
  const next = parseIso(card.nextReviewAt)
  const isNew = !last
  const confidence = (card.confidence ?? 0) as Confidence

  const nextMs = next?.getTime() ?? Number.POSITIVE_INFINITY
  const lastMs = last?.getTime() ?? 0
  const overdueMs = Math.max(0, now.getTime() - nextMs)

  return {
    isNew: isNew ? 0 : 1,
    confidence,
    overdue: -overdueMs,
    lastReviewedAt: lastMs,
    routeIndex: card.routeIndex,
  }
}

export function buildReviewQueue(
  cards: CardRecord[],
  now: Date,
  maxCount: number,
  options?: { fallbackToFilled?: boolean },
) {
  const filled = cards.filter(isCardFilled)
  const due = filled.filter((c) => isCardDue(c, now))

  // “今日复习” should contain due cards only. A palace-specific free-practice
  // session may explicitly opt in to falling back to all filled cards.
  const candidates = due.length > 0 ? due : options?.fallbackToFilled ? filled : []

  const sorted = candidates
    .slice()
    .sort((a, b) => {
      const ka = reviewPriorityKey(a, now)
      const kb = reviewPriorityKey(b, now)
      if (ka.isNew !== kb.isNew) return ka.isNew - kb.isNew
      if (ka.confidence !== kb.confidence) return ka.confidence - kb.confidence
      if (ka.overdue !== kb.overdue) return ka.overdue - kb.overdue
      if (ka.lastReviewedAt !== kb.lastReviewedAt) return ka.lastReviewedAt - kb.lastReviewedAt
      return ka.routeIndex - kb.routeIndex
    })
    .slice(0, Math.max(0, maxCount))
    .sort((a, b) => a.routeIndex - b.routeIndex)

  const queue = sorted.map((c) => c.locusId)
  const dueCount = due.length

  return { queue, dueCount, filledCount: filled.length }
}

export type PalaceReviewStats = {
  palaceId: string
  filledCount: number
  dueCount: number
  masteredCount: number
  masteryRate: number | null
  lastReviewedAt: string | null
}

export function computePalaceReviewStats(palaceId: string, cards: CardRecord[], now: Date): PalaceReviewStats {
  const filled = cards.filter(isCardFilled)
  const dueCount = filled.filter((c) => isCardDue(c, now)).length
  const masteredCount = filled.filter((c) => c.confidence === 2).length
  const masteryRate = filled.length > 0 ? masteredCount / filled.length : null
  let lastReviewedAt: string | null = null
  for (const c of filled) {
    if (!c.lastReviewedAt) continue
    if (!lastReviewedAt || c.lastReviewedAt > lastReviewedAt) lastReviewedAt = c.lastReviewedAt
  }
  return { palaceId, filledCount: filled.length, dueCount, masteredCount, masteryRate, lastReviewedAt }
}

function palaceSortKey(stats: PalaceReviewStats, palace: PalaceRecord) {
  const lastReviewedAt = parseIso(stats.lastReviewedAt ?? undefined)?.getTime() ?? 0
  const updatedAt = parseIso(palace.updatedAt)?.getTime() ?? 0
  return {
    hasDue: stats.dueCount > 0 ? 0 : 1,
    dueCount: -stats.dueCount,
    lastReviewedAt,
    updatedAt,
  }
}

export function chooseNextPalaceForTodayReview(params: { palaces: PalaceRecord[]; statsByPalaceId: Map<string, PalaceReviewStats> }) {
  const list = params.palaces
    .slice()
    .sort((a, b) => {
      const sa = params.statsByPalaceId.get(a.id) ?? computePalaceReviewStats(a.id, [], new Date())
      const sb = params.statsByPalaceId.get(b.id) ?? computePalaceReviewStats(b.id, [], new Date())
      const ka = palaceSortKey(sa, a)
      const kb = palaceSortKey(sb, b)
      if (ka.hasDue !== kb.hasDue) return ka.hasDue - kb.hasDue
      if (ka.dueCount !== kb.dueCount) return ka.dueCount - kb.dueCount
      if (ka.lastReviewedAt !== kb.lastReviewedAt) return ka.lastReviewedAt - kb.lastReviewedAt
      return ka.updatedAt - kb.updatedAt
    })

  return list[0] ?? null
}
