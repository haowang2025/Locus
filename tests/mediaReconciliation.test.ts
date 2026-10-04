import test from 'node:test'
import assert from 'node:assert/strict'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { planToCards } from '../src/lib/palaceStorage'
import { reconcilePalaceMedia } from '../src/lib/palaceMediaReconciliation'
import type { PalaceRecord } from '../src/lib/types'
const scene = getSceneDefinition('reading-hall')
function setup() {
  const plan = createOfflinePlan('第一条完整事实。第二条完整事实。', 'facts', scene)
  const palace: PalaceRecord = { id: 'p', title: 'p', templateId: 'dust2_blockout_v2', createdAt: '', updatedAt: '', mnemonicPlan: plan }
  const cards = planToCards('p', plan, scene, { requireReview: false })
  cards.forEach((card, index) => { card.modelId = `model-${index}`; card.imageIds = [`image-${index}`]; card.attachmentBindings = [...card.imageIds, card.modelId].map(assetId => ({ assetId, unitId: card.mnemonic!.unitIds[0], role: 'cue', sourceFingerprint: card.mnemonic!.sourceFingerprint })) })
  return { palace, plan, cards }
}
test('unchanged source/unit preserves uploaded file bindings on plan save', () => {
  const { palace, plan, cards } = setup(), fresh = planToCards('p', plan, scene, { requireReview: false })
  const next = reconcilePalaceMedia(palace, cards, fresh, plan)
  assert.deepEqual(next.cards.map(card => [card.imageIds, card.modelId, card.attachmentBindings]), cards.map(card => [card.imageIds, card.modelId, card.attachmentBindings]))
  assert.deepEqual(next.unassignedAttachments, [])
})
test('moving an exact unit retains files and scope but resets cue use to reference', () => {
  const { palace, plan, cards } = setup(), changed = structuredClone(plan)
  const anchor = scene.anchors[4]
  changed.cues[0] = { ...changed.cues[0], anchorId: anchor.id, volumeId: anchor.cueVolume.id }
  const fresh = planToCards('p', plan, scene, { requireReview: false }); fresh[0].locusId = anchor.locusId; fresh[0].mnemonic!.anchorId = anchor.id
  const next = reconcilePalaceMedia(palace, cards, fresh, changed)
  assert.equal(next.cards[0].modelId, 'model-0')
  assert.ok(next.cards[0].attachmentBindings!.every(binding => binding.role === 'reference'))
})
test('competing models are kept unassigned while merged image mappings remain exact', () => {
  const { palace, plan, cards } = setup(), combined = structuredClone(cards[0])
  combined.imageIds = []; combined.modelId = undefined; combined.attachmentBindings = undefined
  combined.mnemonic!.unitIds.push(cards[1].mnemonic!.unitIds[0])
  const next = reconcilePalaceMedia(palace, cards, [combined], plan)
  assert.equal(next.cards[0].modelId, undefined)
  assert.deepEqual(next.cards[0].imageIds, ['image-0', 'image-1'])
  assert.deepEqual(next.unassignedAttachments.map(item => item.blobId).sort(), ['model-0', 'model-1'])
})
test('changed source and split/removed units retain orphan uploads with source identity', () => {
  const { palace, plan, cards } = setup(), changed = createOfflinePlan('新的原文。', 'new', scene)
  const next = reconcilePalaceMedia(palace, cards, planToCards('p', changed, scene, { requireReview: false }), changed)
  assert.equal(next.unassignedAttachments.length, 4)
  assert.ok(next.unassignedAttachments.every(item => item.sourceFingerprint === cards[0].mnemonic!.sourceFingerprint))
  const split = structuredClone(plan); split.units[0].id = 'replacement-unit'
  const fresh = planToCards('p', plan, scene, { requireReview: false }); fresh[0].mnemonic!.unitIds = ['replacement-unit']
  const splitResult = reconcilePalaceMedia(palace, cards, fresh, split)
  assert.equal(splitResult.unassignedAttachments.length, 2)
})
