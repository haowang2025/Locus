import { acknowledgeForTest } from './semanticFixtures'
import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { planToCards } from '../src/lib/palaceStorage'
import { recordUnitReveal, recordUnitRating, semanticRecallView } from '../src/lib/palaceRecall'
import { buildReviewQueue, computePalaceReviewStats } from '../src/lib/review'
import TrainPanel from '../src/ui/TrainPanel'
import { buildMpFileV1 } from '../src/lib/mpalace'
import { prepareMpFileImport } from '../src/lib/backupImport'
// The root tsconfig is a references-only file; support tsx's classic JSX transform in this pure SSR test.
Object.assign(globalThis, { React })
const scene = getSceneDefinition('reading-hall'), now = new Date('2026-10-03T12:00:00Z')
function sample() {
  const plan = createOfflinePlan('甲单元：不得超过20。\n乙单元：公式 F = ma。\n丙单元：只有条件满足才执行。', 'Grouped', scene)
  plan.units.forEach(u => u.reviewed = true); plan.cues.forEach(c => { c.reviewed = true; c.anchorId = scene.anchors[0].id; c.volumeId = scene.anchors[0].cueVolume.id })
  acknowledgeForTest(plan)
  const cards = planToCards('palace', plan, scene)
  assert.equal(cards.length, 1)
  return { plan, card: cards[0] }
}
test('grouped anchor expands to three independently scheduled units', () => {
  const { card } = sample(), queue = buildReviewQueue([card], now, 10)
  assert.equal(queue.queue.length, 3)
  assert.deepEqual(queue.queue, ['L01', 'L01', 'L01'])
  assert.deepEqual(queue.unitQueue, card.mnemonic!.unitIds)
  assert.equal(queue.filledCount, 3)
})
test('rating one unit neither rates nor schedules its siblings', () => {
  const { card } = sample(), ids = card.mnemonic!.unitIds
  const next = recordUnitRating(recordUnitReveal(card, ids[0], now), ids[0], 2, now)
  assert.equal(next.unitProgress?.[ids[0]].reviews, 1)
  assert.equal(next.unitProgress?.[ids[0]].reveals, 1)
  assert.equal(next.unitProgress?.[ids[1]], undefined)
  assert.equal(next.confidence, 0)
  const queue = buildReviewQueue([next], now, 10)
  assert.deepEqual(queue.unitQueue, [ids[1], ids[2]])
  const stats = computePalaceReviewStats('palace', [next], now)
  assert.equal(stats.masteredCount, 1); assert.equal(stats.dueCount, 2); assert.equal(stats.masteryRate, 1 / 3)
})
test('revealing an already rated unit does not shift its review schedule or score', () => {
  const { card } = sample(), id = card.mnemonic!.unitIds[0]
  const rated = recordUnitRating(card, id, 1, now), later = new Date(now.getTime() + 3600000)
  const revealed = recordUnitReveal(rated, id, later)
  assert.equal(revealed.unitProgress?.[id].updatedAt, rated.unitProgress?.[id].updatedAt)
  assert.equal(revealed.unitProgress?.[id].nextReviewAt, rated.unitProgress?.[id].nextReviewAt)
  assert.equal(revealed.unitProgress?.[id].reviews, 1)
})
test('recall view exposes exactly the selected unit and rejects unknown IDs', () => {
  const { card, plan } = sample(), id = card.mnemonic!.unitIds[1], view = semanticRecallView(card, plan, id)!
  assert.equal(view.index, 1); assert.equal(view.total, 3)
  assert.equal(view.facts, plan.units[1].facts)
  assert.equal(view.facts.includes('甲单元'), false)
  assert.throws(() => recordUnitRating(card, 'not-a-unit', 2, now))
  assert.throws(() => semanticRecallView(card, plan, 'not-a-unit'))
})
test('server-rendered practice front hides all facts/questions/cue prose, back reveals one unit only', () => {
  const { card, plan } = sample(), view = semanticRecallView(card, plan, card.mnemonic!.unitIds[1])!
  const common = { locusId: card.locusId, card, semantic: view, showRating: true, onReveal() {}, onEdit() {}, onClose() {} }
  const front = renderToStaticMarkup(React.createElement(TrainPanel, { ...common, stage: 'front' }))
  assert.equal(front.includes('F = ma'), false); assert.equal(front.includes('甲单元'), false); assert.equal(front.includes(view.question), false)
  const back = renderToStaticMarkup(React.createElement(TrainPanel, { ...common, stage: 'back' }))
  assert.equal(back.includes('F = ma'), true); assert.equal(back.includes('甲单元'), false); assert.equal(back.includes('丙单元'), false)
})
test('unit progress survives .mpalace backup with IDs unchanged', async () => {
  const { card, plan } = sample(), id = card.mnemonic!.unitIds[1], rated = recordUnitRating(recordUnitReveal(card, id, now), id, 1, now)
  const palace = { id: 'palace', title: 'progress', templateId: 'dust2_blockout_v2' as const, mnemonicPlan: plan, createdAt: now.toISOString(), updatedAt: now.toISOString() }
  const result = await buildMpFileV1({ palace, cards: [rated], blobs: [] })
  const restored = await prepareMpFileImport(new File([result.blob], result.fileName))
  assert.deepEqual({ ...restored.cards[0].unitProgress }, { ...rated.unitProgress })
})
test('review session rejects malformed storage and detects changed unit/source bindings', async () => {
  const { parseReviewSession, isReviewSessionCompatible, reviewPlanFingerprint } = await import('../src/lib/reviewSession')
  const { card, plan } = sample(), queue = buildReviewQueue([card], now, 10)
  const session = { version: 1 as const, id: 'review-1', kind: 'palace' as const, palaceId: 'palace', queue: queue.queue, unitQueue: queue.unitQueue, index: 0, startedAt: now.toISOString(), stats: { rated: 0, c0: 0, c1: 0, c2: 0 }, contentFingerprint: reviewPlanFingerprint(plan) }
  assert.ok(parseReviewSession(session)); assert.equal(isReviewSessionCompatible(session, [card], plan), true)
  for (const patch of [{ index: -1 }, { index: 0.5 }, { index: 99 }, { queue: ['javascript:bad'] }, { unitQueue: {} }, { stats: { rated: 1, c0: 0, c1: 0, c2: 0 } }, { startedAt: 'not-date' }]) assert.equal(parseReviewSession({ ...session, ...patch }), null)
  const changed = structuredClone(plan); changed.units[0].spans[0].quote += ' changed'
  assert.equal(isReviewSessionCompatible(session, [card], changed), false)
  assert.equal(isReviewSessionCompatible({ ...session, unitQueue: ['deleted', ...session.unitQueue.slice(1)] }, [card], plan), false)
})
test('card projection keeps within-anchor unit order even if cue array arrives shuffled', () => {
  const { plan } = sample(); plan.cues.reverse()
  const cards = planToCards('palace', plan, scene)
  assert.deepEqual(cards[0].mnemonic!.unitIds, plan.units.map(u => u.id))
  assert.equal(cards[0].answer, plan.units.map(u => u.facts).join('\n\n'))
})
