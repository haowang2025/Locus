import test from 'node:test'
import assert from 'node:assert/strict'
import { initialAttachmentDraft, replaceAttachmentBinding, remapAttachmentDraft } from '../src/lib/attachmentEditor'
import { attachmentRole } from '../src/lib/attachmentBindings'
import type { CardRecord } from '../src/lib/types'

const card = { imageIds: ['legacy'], modelId: 'model', mnemonic: { unitIds: ['a', 'b'], sourceFingerprint: 'source' } } as CardRecord

test('editor materializes legacy references per unit before adding one explicit cue', () => {
  const initial = initialAttachmentDraft(card)
  assert.equal(initial.length, 4)
  const updated = replaceAttachmentBinding(initial, { assetId: 'legacy', unitId: 'a', role: 'cue', sourceFingerprint: 'source' })
  assert.equal(attachmentRole({ ...card, attachmentBindings: updated }, 'legacy', 'a'), 'cue')
  assert.equal(attachmentRole({ ...card, attachmentBindings: updated }, 'legacy', 'b'), 'reference')
  assert.equal(attachmentRole({ ...card, attachmentBindings: updated }, 'model', 'a'), 'reference')
  assert.equal(initial[0].role, 'reference')
})

test('editing one scoped binding preserves sibling and deliberate anchor bindings', () => {
  const original = [{ assetId: 'legacy', scope: 'anchor' as const, role: 'cue' as const, sourceFingerprint: 'source' }, { assetId: 'legacy', unitId: 'b', role: 'reference' as const }]
  const updated = replaceAttachmentBinding(original, { assetId: 'legacy', unitId: 'a', role: 'reference' })
  assert.deepEqual(updated.slice(0, 2), original)
  assert.equal(updated.length, 3)
  assert.equal(attachmentRole({ ...card, attachmentBindings: updated }, 'legacy', 'a'), 'reference')
})

test('temporary upload IDs remap across all unit bindings and removed files drop out', () => {
  const original = [{ assetId: 'tmp', unitId: 'a', role: 'reference' as const }, { assetId: 'tmp', unitId: 'b', role: 'cue' as const, sourceFingerprint: 'source' }, { assetId: 'removed', role: 'reference' as const }]
  const result = remapAttachmentDraft(original, new Map([['tmp', 'saved']]))
  assert.deepEqual(result.map(item => item.assetId), ['saved', 'saved'])
  assert.deepEqual(result.map(item => item.unitId), ['a', 'b'])
  assert.equal(result[1].sourceFingerprint, 'source')
  assert.equal(original[0].assetId, 'tmp')
})

test('opening existing scoped assets never adds an unintended sibling reference', () => {
  const original = { ...card, attachmentBindings: [{ assetId: 'legacy', unitId: 'a', role: 'reference' as const }] }
  const result = initialAttachmentDraft(original)
  assert.equal(attachmentRole({ ...original, attachmentBindings: result }, 'legacy', 'b'), null)
})

test('attachment upload preflight rejects oversized raster headers before decoding', async () => {
  const { validateAttachmentUpload } = await import('../src/lib/attachmentEditor')
  const png = new Uint8Array(24)
  png.set([137, 80, 78, 71], 0); png.set([73, 72, 68, 82], 12)
  const view = new DataView(png.buffer); view.setUint32(16, 9000); view.setUint32(20, 2)
  await assert.rejects(validateAttachmentUpload(new Blob([png], { type: 'image/png' }), 'image'), /8192/)
  view.setUint32(16, 2)
  await assert.doesNotReject(validateAttachmentUpload(new Blob([png], { type: 'image/png' }), 'image'))
})

test('attachment upload rejects empty and invalid model bytes', async () => {
  const { validateAttachmentUpload } = await import('../src/lib/attachmentEditor')
  await assert.rejects(validateAttachmentUpload(new Blob([]), 'image'), /为空/)
  await assert.rejects(validateAttachmentUpload(new Blob(['not glb']), 'model'))
})

test('explicit anchor cue replaces legacy unscoped reference without ambiguous fallback duplication', async () => {
  const { parseAttachmentBindings } = await import('../src/lib/attachmentBindings')
  const fingerprint = 'fnv1a64-utf16:6:1234567890abcdef'
  const updated = replaceAttachmentBinding([{ assetId: 'asset', role: 'reference' }], { assetId: 'asset', scope: 'anchor', role: 'cue', sourceFingerprint: fingerprint })
  assert.equal(updated.length, 1)
  assert.equal(updated[0].scope, 'anchor')
  assert.doesNotThrow(() => parseAttachmentBindings(updated, ['asset'], ['unit'], fingerprint))
})
