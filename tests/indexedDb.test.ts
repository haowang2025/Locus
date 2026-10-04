import { acknowledgeForTest } from './semanticFixtures'
/** Pure IndexedDB emulation. This file does not create/control a browser. */
import 'fake-indexeddb/auto'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPalace, getBlob, getCards, getPalace, listPalaces, nowIso, tx } from '../src/lib/db'
import { createAuthoredDemo } from '../src/lib/palaceSamples'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { planToCards, savePalacePlan } from '../src/lib/palaceStorage'
import { buildMpFileV1 } from '../src/lib/mpalace'
import { importMpFileAsNewPalace } from '../src/lib/backupImport'

beforeEach(() => { globalThis.indexedDB = new IDBFactory() })
const samplePlan = () => { const plan = createAuthoredDemo('science'); plan.units.forEach(u => u.reviewed = true); plan.cues.forEach(c => c.reviewed = true); acknowledgeForTest(plan); return plan }
const png = () => new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7fQAAAAASUVORK5CYII=', 'base64'))], { type: 'image/png' })
async function archive() {
  const plan = samplePlan(), t = nowIso(), palace = { id: 'source', title: 'Atomic test', templateId: 'dust2_blockout_v2' as const, mnemonicPlan: plan, createdAt: t, updatedAt: t }, cards = planToCards(palace.id, plan, getSceneDefinition(plan.sceneId))
  cards[0].imageIds = ['original-blob']
  const result = await buildMpFileV1({ palace, cards, blobs: [{ id: 'original-blob', mime: 'image/png', data: png(), createdAt: t }] })
  return new File([result.blob], result.fileName)
}
async function storeCounts() {
  return tx('readonly', ['palace', 'cards', 'blobs'], async ({ palace, cards, blobs }) => ({ palaces: await palace.count(), cards: await cards.count(), blobs: await blobs.count() }))
}

test('explicit JavaScript exception rolls back already completed requests in all stores', async () => {
  const existing = await createPalace('before')
  await assert.rejects(tx('readwrite', ['palace', 'cards', 'blobs'], async ({ palace, cards, blobs }) => {
    await palace.put({ ...existing, title: 'should-not-commit' })
    await blobs.put({ id: 'new-blob', mime: 'image/png', data: png(), createdAt: nowIso() })
    await cards.put({ palaceId: existing.id, locusId: 'L01', routeIndex: 1, prompt: 'new', answer: 'new', imageIds: [], updatedAt: nowIso(), revealedCount: 0 })
    throw new Error('injected application exception')
  }), /injected application exception/)
  assert.equal((await getPalace(existing.id))?.title, 'before')
  assert.equal(await getBlob('new-blob'), undefined)
  assert.equal((await getCards(existing.id)).length, 0)
})
test('IndexedDB constraint failure aborts earlier successful writes', async () => {
  const existing = await createPalace('before')
  await assert.rejects(tx('readwrite', 'palace', async ({ palace, blobs }) => {
    await blobs.put({ id: 'new-blob', mime: 'image/png', data: png(), createdAt: nowIso() })
    await palace.add(existing)
  }))
  assert.equal(await getBlob('new-blob'), undefined)
  assert.equal((await listPalaces()).length, 1)
})
test('saving reviewed plan commits matching cards and original evidence together', async () => {
  const existing = await createPalace('semantic'), plan = samplePlan()
  await savePalacePlan(existing.id, plan, getSceneDefinition(plan.sceneId))
  assert.deepEqual((await getPalace(existing.id))?.mnemonicPlan, plan)
  const cards = await getCards(existing.id)
  assert.equal(cards.length, 3)
  assert.deepEqual(cards.flatMap(c => c.mnemonic!.unitIds), plan.units.map(u => u.id))
})
test('unreviewed plan fails before deleting existing saved cards', async () => {
  const existing = await createPalace('semantic'), plan = samplePlan(), scene = getSceneDefinition(plan.sceneId)
  await savePalacePlan(existing.id, plan, scene)
  const before = await getCards(existing.id)
  plan.units[0].reviewed = false
  await assert.rejects(savePalacePlan(existing.id, plan, scene), /核对/)
  assert.deepEqual(await getCards(existing.id), before)
  assert.equal((await getPalace(existing.id))?.mnemonicPlan?.units[0].reviewed, true)
})
test('import preserves existing assets with colliding archived blob IDs and remaps new references', async () => {
  await tx('readwrite', 'blobs', async ({ blobs }) => { await blobs.put({ id: 'original-blob', mime: 'text/plain', data: new Blob(['keep-existing']), createdAt: nowIso() }) })
  const imported = await importMpFileAsNewPalace(await archive()), cards = await getCards(imported.id)
  assert.equal(await (await getBlob('original-blob'))!.data.text(), 'keep-existing')
  const imageId = cards[0].imageIds[0]
  assert.notEqual(imageId, 'original-blob')
  assert.equal((await getBlob(imageId))?.mime, 'image/png')
  assert.equal((await getPalace(imported.id))?.mnemonicPlan?.generation.mode, 'authored-demo')
})
test('import failure after blob insertion rolls back palace, cards and blobs', async () => {
  const file = await archive(), originalPut = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof originalPut>) {
    if (this.name === 'cards') throw new Error('injected card write failure')
    return originalPut.apply(this, args)
  }
  try { await assert.rejects(importMpFileAsNewPalace(file), /injected card write failure/) }
  finally { IDBObjectStore.prototype.put = originalPut }
  assert.deepEqual(await storeCounts(), { palaces: 0, cards: 0, blobs: 0 })
})
test('plan replacement failure after deletion restores previous cards and metadata', async () => {
  const palace = await createPalace('before'), first = samplePlan(), scene = getSceneDefinition(first.sceneId)
  await savePalacePlan(palace.id, first, scene)
  await tx('readwrite', ['cards', 'blobs'], async ({ cards, blobs }) => {
    const row = (await cards.index('byPalace').getAll(palace.id))[0]
    row.imageIds = ['preserved-upload']; await cards.put(row)
    await blobs.put({ id: 'preserved-upload', mime: 'image/png', data: png(), createdAt: nowIso() })
  })
  const beforeCards = await getCards(palace.id), originalPut = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof originalPut>) {
    if (this.name === 'cards') throw new Error('injected replacement failure')
    return originalPut.apply(this, args)
  }
  const next = structuredClone(first); next.units[0].title = 'new title'
  try { await assert.rejects(savePalacePlan(palace.id, next, scene), /injected replacement failure/) }
  finally { IDBObjectStore.prototype.put = originalPut }
  assert.deepEqual(await getCards(palace.id), beforeCards)
  assert.deepEqual((await getPalace(palace.id))?.mnemonicPlan, first)
  assert.ok(await getBlob('preserved-upload'))
})

async function seedVersionOne(options: { palace?: boolean; ambiguous?: boolean } = {}) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('memory-palace-mvp', 1)
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('palace', { keyPath: 'id' }); db.createObjectStore('cards', { keyPath: 'locusId' }); db.createObjectStore('blobs', { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
  })
  const legacy = { locusId: 'L01', routeIndex: 1, prompt: '旧问题', answer: '旧答案：不得删除。', note: '旧备注', imageIds: ['legacy-image'], modelId: 'legacy-model', modelScale: 2, confidence: 2, reviewCount: 7, revealedCount: 9, lastReviewedAt: '2026-10-01T00:00:00Z', nextReviewAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', customLegacyField: 'keep unknown field too' }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['palace', 'cards', 'blobs'], 'readwrite')
    if (options.palace !== false) transaction.objectStore('palace').put({ id: options.ambiguous ? 'first' : 'current', title: '旧宫殿', templateId: 'dust2_blockout_v2', createdAt: nowIso(), updatedAt: nowIso() })
    if (options.ambiguous) transaction.objectStore('palace').put({ id: 'second', title: '第二宫殿', templateId: 'dust2_blockout_v2', createdAt: nowIso(), updatedAt: nowIso() })
    transaction.objectStore('cards').put(legacy)
    transaction.objectStore('blobs').put({ id: 'legacy-image', mime: 'image/png', data: png(), createdAt: nowIso() })
    transaction.objectStore('blobs').put({ id: 'legacy-model', mime: 'model/gltf-binary', data: new Blob(['preserve-original-bytes']), createdAt: nowIso() })
    transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error)
  })
  database.close()
  return legacy
}
async function readRawVersionOne() {
  const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('memory-palace-mvp'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  const version = database.version
  const card = await new Promise<unknown>((resolve, reject) => { const request = database.transaction('cards').objectStore('cards').get('L01'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  database.close(); return { version, card }
}
test('v1 migration preserves every card field, attachment reference and blob while creating compound indexes', async () => {
  const legacy = await seedVersionOne()
  const cards = await getCards('current')
  assert.equal(cards.length, 1)
  assert.deepEqual(cards[0], { ...legacy, palaceId: 'current' })
  assert.equal(await (await getBlob('legacy-model'))!.data.text(), 'preserve-original-bytes')
  assert.ok(await getBlob('legacy-image'))
  await tx('readonly', 'cards', async ({ cards }) => { assert.equal((await cards.index('byRoute').get(['current', 1])).answer, legacy.answer) })
})
test('v1 orphaned cards remain reachable through a recovered palace', async () => {
  await seedVersionOne({ palace: false })
  assert.equal((await getCards('current')).length, 1)
  assert.equal((await getPalace('current'))?.title, '恢复的旧版宫殿')
})
test('ambiguous v1 migration aborts and leaves the original version and records intact', async () => {
  const legacy = await seedVersionOne({ ambiguous: true })
  await assert.rejects(getCards('current'), /原数据库保持未修改/)
  const original = await readRawVersionOne()
  assert.equal(original.version, 1); assert.deepEqual(original.card, legacy)
})
test('failure during v1 copying rolls back even after the old store was replaced', async () => {
  const legacy = await seedVersionOne(), originalPut = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...args: Parameters<typeof originalPut>) {
    if (this.name === 'cards' && Array.isArray(this.keyPath)) throw new Error('injected migration-copy failure')
    return originalPut.apply(this, args)
  }
  try { await assert.rejects(getCards('current'), /原数据库保持未修改/) }
  finally { IDBObjectStore.prototype.put = originalPut }
  const original = await readRawVersionOne()
  assert.equal(original.version, 1); assert.deepEqual(original.card, legacy)
})
