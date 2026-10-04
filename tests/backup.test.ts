import { acknowledgeForTest } from './semanticFixtures'
import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { planToCards } from '../src/lib/palaceStorage'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { buildMpFileV1, parseMpFileV1, validateModelBytes, BACKUP_LIMITS } from '../src/lib/mpalace'
import { prepareMpFileImport } from '../src/lib/backupImport'
import type { PalaceRecord, MpFileV1 } from '../src/lib/types'

const now = '2026-10-03T16:00:00.000Z'
function sample() {
  const scene = getSceneDefinition('reading-hall')
  const plan = createOfflinePlan('不得超过 20 mg。\n公式 E = mc²。', '有条件的材料', scene)
  plan.units.forEach(u => u.reviewed = true); plan.cues.forEach(c => c.reviewed = true); acknowledgeForTest(plan)
  const palace: PalaceRecord = { id: 'old-palace', title: 'Test', templateId: 'dust2_blockout_v2', mnemonicPlan: plan, createdAt: now, updatedAt: now }
  const cards = planToCards(palace.id, plan, scene)
  cards[0].reviewCount = 12; cards[0].confidence = 2; cards[0].lastReviewedAt = now; cards[0].nextReviewAt = now
  return { palace, cards, blobs: [] }
}
function glb(uri?: string): Uint8Array {
  const raw = JSON.stringify({ asset: { version: '2.0' }, ...(uri ? { buffers: [{ byteLength: 0, uri }] } : {}) })
  const json = new TextEncoder().encode(raw.padEnd(Math.ceil(raw.length / 4) * 4, ' '))
  const bytes = new Uint8Array(20 + json.length), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, json.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(json, 20)
  return bytes
}
async function manifestZip(manifest: unknown, files: Record<string, Uint8Array> = {}) {
  const zip = new JSZip(); zip.file('palace.json', JSON.stringify(manifest)); for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes)
  return new File([await zip.generateAsync({ type: 'uint8array' }) as BlobPart], 'test.mpalace')
}
async function baselineManifest(): Promise<MpFileV1> {
  const result = await buildMpFileV1(sample()); const parsed = await parseMpFileV1(new File([result.blob], result.fileName)); return { formatVersion: parsed.formatVersion, exportedAt: parsed.exportedAt, templateId: parsed.templateId, palace: parsed.palace, cards: parsed.cards }
}

test('roundtrip preserves full source, cues, review approvals and spaced repetition fields', async () => {
  const original = sample(), result = await buildMpFileV1(original)
  const restored = await prepareMpFileImport(new File([result.blob], result.fileName))
  assert.deepEqual(restored.palace.mnemonicPlan, original.palace.mnemonicPlan)
  assert.deepEqual(restored.cards[0].mnemonic, original.cards[0].mnemonic)
  assert.equal(restored.cards[0].reviewCount, 12); assert.equal(restored.cards[0].confidence, 2)
  assert.notEqual(restored.palace.id, original.palace.id)
})
test('custom map and attachments are included and every blob ID is remapped', async () => {
  const original = sample(), bytes = glb()
  const palace = { ...original.palace, customMap: { blobId: 'shared-model', fileName: 'scene.glb', mime: 'model/gltf-binary', size: bytes.length, importedAt: now } }
  original.cards[0].modelId = 'shared-model'; original.cards[0].modelScale = 2
  const blob = { id: 'shared-model', mime: 'model/gltf-binary', data: new Blob([bytes as BlobPart]), createdAt: now }
  const result = await buildMpFileV1({ palace, cards: original.cards, blobs: [blob] })
  const restored = await prepareMpFileImport(new File([result.blob], result.fileName))
  assert.equal(restored.blobs.length, 1)
  assert.notEqual(restored.blobs[0].id, 'shared-model')
  assert.equal(restored.palace.customMap?.blobId, restored.cards[0].modelId)
  assert.deepEqual(new Uint8Array(await restored.blobs[0].data.arrayBuffer()), bytes)
})
test('missing assets fail during preparation, before a palace can be created', async () => {
  const manifest = await baselineManifest()
  manifest.cards[0].images = [{ id: 'missing', file: 'images/missing.png', mime: 'image/png' }]
  await assert.rejects(prepareMpFileImport(await manifestZip(manifest)), /缺少资源/)
})
test('export fails rather than silently dropping missing custom map assets', async () => {
  const data = sample(); data.palace.customMap = { blobId: 'missing', fileName: 'map.glb', mime: 'model/gltf-binary', size: 20, importedAt: now }
  await assert.rejects(buildMpFileV1(data), /缺少备份资源/)
})
test('tampered source/card consistency and asset paths are rejected', async () => {
  const manifest = await baselineManifest(); manifest.cards[0].answer = 'invented answer'
  await assert.rejects(prepareMpFileImport(await manifestZip(manifest)), /答案与原文方案不一致/)
  const other = await baselineManifest(); other.cards[0].images = [{ id: 'bad', file: '../evil.png', mime: 'image/png' }]
  await assert.rejects(prepareMpFileImport(await manifestZip(other)), /不安全/)
})
test('archive path traversal and compressed-size limits are rejected', async () => {
  await assert.rejects(parseMpFileV1(await manifestZip(await baselineManifest(), { '../escape.bin': new Uint8Array([1]) })), /不安全路径/)
  await assert.rejects(parseMpFileV1({ size: BACKUP_LIMITS.compressedBytes + 1 } as File), /64 MB/)
})
test('self-contained glTF accepted, remote and relative model resources rejected', () => {
  assert.doesNotThrow(() => validateModelBytes(glb(), 'model/gltf-binary'))
  for (const uri of ['https://evil.test/tracker', '//evil.test/model.bin', 'texture.png', 'file:///secret', 'javascript:alert(1)']) assert.throws(() => validateModelBytes(glb(uri), 'model/gltf-binary'), /外部资源/)
})
test('unknown sensitive metadata is not copied into backup', async () => {
  const data = sample(); Object.assign(data.palace.mnemonicPlan!, { apiKey: 'not-real', endpoint: 'https://private.invalid' })
  const result = await buildMpFileV1(data)
  const parsed = await parseMpFileV1(new File([result.blob], result.fileName))
  assert.equal('apiKey' in parsed.palace.mnemonicPlan!, false)
  assert.equal('endpoint' in parsed.palace.mnemonicPlan!, false)
})
test('authored-demo provenance and external source citations survive backup', async () => {
  const { createAuthoredDemo } = await import('../src/lib/palaceSamples')
  const plan = createAuthoredDemo('science'); plan.units.forEach(u => u.reviewed = true); plan.cues.forEach(c => c.reviewed = true); acknowledgeForTest(plan)
  const original = sample(); original.palace.mnemonicPlan = plan
  original.cards = planToCards(original.palace.id, plan, getSceneDefinition(plan.sceneId))
  const result = await buildMpFileV1(original)
  const restored = await prepareMpFileImport(new File([result.blob], result.fileName))
  assert.equal(restored.palace.mnemonicPlan?.generation.mode, 'authored-demo')
  assert.deepEqual(restored.palace.mnemonicPlan?.source.references, plan.source.references)
})
test('studio-only draft sanitizer preserves repairable edits but never evidence corruption', async () => {
  const { sanitizeBackupPlan } = await import('../src/lib/palaceBackupValidation')
  const draft = sample().palace.mnemonicPlan!
  draft.units[0].title = ''; draft.units[0].question = ''; draft.cues[0].action = ''; draft.cues.pop()
  assert.throws(() => sanitizeBackupPlan(draft))
  const restored = sanitizeBackupPlan(draft, { allowIncompleteDraft: true })
  assert.equal(restored.units[0].title, '')
  assert.equal(restored.cues.length, draft.cues.length)
  const corrupt = structuredClone(draft); corrupt.units[0].spans[0].quote = 'forged'
  assert.throws(() => sanitizeBackupPlan(corrupt, { allowIncompleteDraft: true }))
  draft.ordering = 'semantic'
  assert.equal(sanitizeBackupPlan(draft, { allowIncompleteDraft: true }).ordering, 'semantic')
})
test('backup rejects oversized raster headers before creating imported blobs', async () => {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer)
  bytes.set([137,80,78,71,13,10,26,10]); bytes.set(new TextEncoder().encode('IHDR'), 12)
  view.setUint32(16, 65535); view.setUint32(20, 65535)
  const manifest = await baselineManifest()
  manifest.cards[0].images = [{ id: 'huge', file: 'images/huge.png', mime: 'image/png' }]
  await assert.rejects(prepareMpFileImport(await manifestZip(manifest, { 'images/huge.png': bytes })), /1600 万像素|8192/)
})
test('backup self-contained JSON glTF shares graph and buffer preflight with portable GLB', () => {
  const encode = (json: unknown) => new TextEncoder().encode(JSON.stringify(json))
  assert.doesNotThrow(() => validateModelBytes(encode({ asset: { version: '2.0' } }), 'model/gltf+json'))
  assert.throws(() => validateModelBytes(encode({ asset: { version: '2.0' }, nodes: [{ children: [0] }] }), 'model/gltf+json'), /循环/)
  assert.throws(() => validateModelBytes(encode({ asset: { version: '2.0' }, buffers: [{ byteLength: 100 }] }), 'model/gltf+json'), /缓冲区长度/)
})

test('per-unit cue binding survives backup with blob ID remapping and source identity', async () => {
  const original = sample(), bytes = glb(), id = 'cue-model'
  original.cards[0].modelId = id
  original.cards[0].attachmentBindings = [{ assetId: id, unitId: original.cards[0].mnemonic!.unitIds[0], role: 'cue', sourceFingerprint: original.cards[0].mnemonic!.sourceFingerprint }]
  const result = await buildMpFileV1({ ...original, blobs: [{ id, mime: 'model/gltf-binary', data: new Blob([bytes as BlobPart]), createdAt: now }] })
  const restored = await prepareMpFileImport(new File([result.blob], result.fileName))
  assert.equal(restored.cards[0].attachmentBindings![0].assetId, restored.cards[0].modelId)
  assert.notEqual(restored.cards[0].attachmentBindings![0].assetId, id)
  assert.equal(restored.cards[0].attachmentBindings![0].sourceFingerprint, original.cards[0].mnemonic!.sourceFingerprint)
  assert.equal(restored.cards[0].attachmentBindings![0].unitId, original.cards[0].mnemonic!.unitIds[0])
})
test('unassigned uploads and their provenance survive backup with remapped IDs', async () => {
  const original = sample(), bytes = glb(), id = 'unassigned-model'
  original.palace.unassignedAttachments = [{ blobId: id, kind: 'model', originalLocusId: 'L02', unitIds: ['former-unit'], sourceFingerprint: original.cards[0].mnemonic!.sourceFingerprint, reason: '模型合并冲突，待选择。', modelScale: 2 }]
  const result = await buildMpFileV1({ ...original, blobs: [{ id, mime: 'model/gltf-binary', data: new Blob([bytes as BlobPart]), createdAt: now }] })
  const restored = await prepareMpFileImport(new File([result.blob], result.fileName))
  const archived = restored.palace.unassignedAttachments![0]
  assert.notEqual(archived.blobId, id)
  assert.equal(archived.blobId, restored.blobs[0].id)
  assert.equal(archived.reason, original.palace.unassignedAttachments[0].reason)
  assert.deepEqual(archived.unitIds, ['former-unit'])
  assert.equal(archived.modelScale, 2)
})
