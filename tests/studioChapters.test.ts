import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyProject, serializeStudioBackup, parseStudioBackup, compileStudioPalace } from '../src/studio/core'
import { startStudioChapters, selectStudioChapter } from '../src/studio/chapters'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { validateOfflinePalace } from '../src/offline/serialize'
const source = '# 开始\n第一项保留原句。\n第二项必须核对。\n# 后续\n第三项不可遗漏。\n第四项只有确认后执行。\n'
const root = () => startStudioChapters({ ...emptyProject(), title: '完整程序', text: source }, 2)
test('Studio chapter layout retains full source and exact contiguous offsets', () => {
  const p = root(), chapters = p.chapters!.collection.chapters
  assert.equal(chapters.map(c => c.span.quote).join(''), source)
  assert.equal(p.text, source); assert.equal(p.chapters!.activeId, null)
})
test('Selected chapter backup roundtrips full origin, current draft and confirmed records', async () => {
  const p = selectStudioChapter(root(), 'chapter-002')
  p.plan = createOfflinePlan(p.text, p.title, getSceneDefinition(p.sceneId))
  p.chapters!.confirmedDownloads = [{ chapterId: 'chapter-001', exportedAt: '2026-10-03T00:00:00.000Z' }]
  const restored = await parseStudioBackup(serializeStudioBackup(p))
  assert.equal(restored.chapters!.collection.source.text, source)
  assert.equal(restored.plan!.source.text, p.text)
  assert.deepEqual(restored.chapters, p.chapters)
})
test('Chapter switch clears only active palace work and preserves full material/status', () => {
  const p = selectStudioChapter(root(), 'chapter-001'); p.plan = createOfflinePlan(p.text, p.title, getSceneDefinition(p.sceneId))
  const next = selectStudioChapter(p, 'chapter-002')
  assert.equal(next.plan, null); assert.equal(next.chapters!.collection.source.text, source); assert.notEqual(next.id, p.id)
  assert.equal(selectStudioChapter(next, null).text, source)
})
test('Chapter origin rejects changed active source and duplicate save records', async () => {
  const p = selectStudioChapter(root(), 'chapter-001'), raw = JSON.parse(serializeStudioBackup(p))
  raw.text += '改写'; await assert.rejects(parseStudioBackup(JSON.stringify(raw)), /不一致/)
  raw.text = p.text; raw.chapters.confirmedDownloads = [{ chapterId: 'chapter-001', exportedAt: '2026-10-03' }, { chapterId: 'chapter-001', exportedAt: '2026-10-03' }]
  await assert.rejects(parseStudioBackup(JSON.stringify(raw)), /确认/)
})
test('Draft chapter HTML payload contains provenance but only current chapter text/cards', async () => {
  const p = selectStudioChapter(root(), 'chapter-002'); p.plan = createOfflinePlan(p.text, p.title, getSceneDefinition(p.sceneId))
  const data = await compileStudioPalace(p, [], [], true)
  assert.equal(data.chapterOrigin!.sourceTitle, '完整程序')
  const { buildOfflineHtml } = await import('../src/offline/serialize')
  assert.ok(!buildOfflineHtml(data, '').includes('第一项保留原句'))
  assert.equal((data.plan as typeof p.plan)!.source.text, p.text)
  assert.equal(data.cards.flatMap(c => c.unitIds).length, p.plan.units.length)
  validateOfflinePalace(data)
  const changed = structuredClone(data); changed.chapterOrigin!.start++
  assert.throws(() => validateOfflinePalace(changed), /不一致/)
})
test('Chapter serialization strips unknown original material and secret metadata', async () => {
  const p = selectStudioChapter(root(), 'chapter-001'); p.plan = createOfflinePlan(p.text, p.title, getSceneDefinition(p.sceneId))
  const data = await compileStudioPalace(p, [], [], true)
  const dirty = data.chapterOrigin as unknown as Record<string, unknown>; dirty.collection = { source: 'OTHER_CHAPTER_SECRET' }; dirty.apiKey = 'SHOULD_NOT_SHIP'
  const { buildOfflineHtml } = await import('../src/offline/serialize')
  const html = buildOfflineHtml(data, '')
  assert.ok(!html.includes('SHOULD_NOT_SHIP')); assert.ok(!html.includes('OTHER_CHAPTER_SECRET'))
})
