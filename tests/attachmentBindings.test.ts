import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentRole, parseAttachmentBindings, visibleAttachmentIds } from '../src/lib/attachmentBindings'
import { sourceFingerprint } from '../src/lib/palaceModelProposal'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { planToCards } from '../src/lib/palaceStorage'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
const fingerprint = sourceFingerprint({ title: 'Test', text: '第一句。第二句。' })
const mnemonic = { unitIds: ['u1', 'u2'], sourceFingerprint: fingerprint }
test('legacy assets are references and specific-unit assets never leak to siblings', () => {
  assert.equal(attachmentRole({ mnemonic }, 'image', 'u1'), 'reference')
  const attachmentBindings = [{ assetId: 'image', unitId: 'u1', role: 'cue' as const, sourceFingerprint: fingerprint }, { assetId: 'image', unitId: 'u2', role: 'reference' as const, sourceFingerprint: fingerprint }]
  assert.equal(attachmentRole({ mnemonic, attachmentBindings }, 'image', 'u1'), 'cue')
  assert.equal(attachmentRole({ mnemonic, attachmentBindings }, 'image', 'u2'), 'reference')
  assert.equal(attachmentRole({ mnemonic, attachmentBindings: attachmentBindings.slice(0, 1) }, 'image', 'u2'), null)
  assert.equal(attachmentRole({ mnemonic, attachmentBindings: [{ ...attachmentBindings[0], sourceFingerprint: 'stale' }] }, 'image', 'u1'), null)
  assert.equal(attachmentRole({ mnemonic, attachmentBindings: [{ ...attachmentBindings[0], sourceFingerprint: undefined }] }, 'image', 'u1'), null)
})
test('explicit anchor-wide cue works, scoped reference overrides it, unknown scope cannot reveal cues', () => {
  const attachmentBindings = [{ assetId: 'image', scope: 'anchor' as const, role: 'cue' as const, sourceFingerprint: fingerprint }, { assetId: 'image', unitId: 'u2', role: 'reference' as const, sourceFingerprint: fingerprint }]
  assert.equal(attachmentRole({ mnemonic, attachmentBindings }, 'image', 'u1'), 'cue')
  assert.equal(attachmentRole({ mnemonic, attachmentBindings }, 'image', 'u2'), 'reference')
  assert.equal(attachmentRole({ mnemonic, attachmentBindings: [{ assetId: 'image', role: 'cue' }] }, 'image', 'u1'), 'reference')
})
test('binding parser validates provenance, file IDs, unit IDs and duplicates', () => {
  const good = { assetId: 'image', unitId: 'u1', role: 'cue', sourceFingerprint: fingerprint, secret: 'omit' }
  assert.deepEqual(parseAttachmentBindings([good], ['image'], mnemonic.unitIds, fingerprint), [{ assetId: 'image', unitId: 'u1', role: 'cue', sourceFingerprint: fingerprint }])
  for (const change of [{ assetId: 'unknown' }, { unitId: 'other' }, { sourceFingerprint: 'stale' }, { sourceFingerprint: undefined }, { scope: 'anchor' }]) assert.throws(() => parseAttachmentBindings([{ ...good, ...change }], ['image'], mnemonic.unitIds, fingerprint))
  assert.equal(parseAttachmentBindings([{ ...good, role: 'unknown' }], ['image'], mnemonic.unitIds, fingerprint)![0].role, 'reference')
  assert.throws(() => parseAttachmentBindings([good, good], ['image'], mnemonic.unitIds, fingerprint))
})
test('visible attachments show assigned cues before reveal and references only after', () => {
  const scene = getSceneDefinition('reading-hall'), plan = createOfflinePlan('第一句。', 'Test', scene)
  const card = planToCards('palace', plan, scene, { requireReview: false })[0]
  card.imageIds = ['cue', 'reference']; card.modelId = 'model'
  card.attachmentBindings = [{ assetId: 'cue', unitId: card.mnemonic!.unitIds[0], role: 'cue', sourceFingerprint: card.mnemonic!.sourceFingerprint }]
  assert.deepEqual(visibleAttachmentIds(card, card.mnemonic!.unitIds[0], false), { imageIds: ['cue'] })
  assert.deepEqual(visibleAttachmentIds(card, card.mnemonic!.unitIds[0], true), { imageIds: ['cue', 'reference'], modelId: 'model' })
})
