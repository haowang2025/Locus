import type { CardRecord, UnitRecallProgress } from './types'
import type { PalacePlan } from './palaceTypes'
import { computeNextReviewAtIso } from './review'

function assertUnit(card: CardRecord, unitId: string) {
  if (!card.mnemonic?.unitIds.includes(unitId)) throw new Error('此地标没有这个含义单元。')
}
export function recordUnitReveal(card: CardRecord, unitId: string, now = new Date()): CardRecord {
  assertUnit(card, unitId)
  const previous = card.unitProgress?.[unitId]
  const progress: UnitRecallProgress = { rating: 0, reviews: 0, updatedAt: now.toISOString(), ...previous, reveals: (previous?.reveals ?? 0) + 1 }
  return { ...card, unitProgress: { ...card.unitProgress, [unitId]: progress }, revealedCount: (card.revealedCount ?? 0) + 1, updatedAt: now.toISOString() }
}
export function recordUnitRating(card: CardRecord, unitId: string, rating: 0 | 1 | 2, now = new Date()): CardRecord {
  assertUnit(card, unitId)
  const previous = card.unitProgress?.[unitId]
  const progress: UnitRecallProgress = { rating, reviews: (previous?.reviews ?? 0) + 1, updatedAt: now.toISOString(), nextReviewAt: computeNextReviewAtIso(now, rating), reveals: previous?.reveals ?? 0 }
  const unitProgress = { ...card.unitProgress, [unitId]: progress }
  const all = card.mnemonic!.unitIds.map(id => unitProgress[id])
  // Aggregates are conservative legacy compatibility fields; scheduling uses per-unit records.
  const confidence = Math.min(...all.map(p => p?.reviews ? p.rating : 0)) as 0 | 1 | 2
  const nextReviewAt = all.some(p => !p?.reviews) ? now.toISOString() : all.map(p => p.nextReviewAt ?? now.toISOString()).sort()[0]
  return { ...card, unitProgress, confidence, reviewCount: all.reduce((sum, p) => sum + (p?.reviews ?? 0), 0), lastReviewedAt: now.toISOString(), nextReviewAt, updatedAt: now.toISOString() }
}
export function semanticRecallView(card: CardRecord, plan: PalacePlan | undefined, selectedUnitId?: string) {
  if (!card.mnemonic || !plan) return null
  const unitId = selectedUnitId ?? card.mnemonic.unitIds[0]
  const index = card.mnemonic.unitIds.indexOf(unitId), unit = plan.units.find(u => u.id === unitId), cue = plan.cues.find(c => c.unitId === unitId)
  if (index < 0 || !unit || !cue) throw new Error('复习单元与原文方案不一致，请重新打开材料工作台。')
  return { unitId, index, total: card.mnemonic.unitIds.length, question: unit.question, facts: unit.facts, protectedTokens: unit.protectedTokens, cueText: `【创意联想，不是原文事实】${cue.object}\n【想象叙事】${cue.imaginedAction ?? cue.action}\n【实际渲染说明】${cue.renderedDescription ?? '旧版方案尚无独立说明。'}\n【视觉未编码，须准确复述】${cue.semanticReview?.notEncoded ?? '请对照原文核对精确数值、条件与关系。'}\n【映射理由】${cue.rationale}`, progress: card.unitProgress?.[unitId] }
}
