import test from 'node:test'
import assert from 'node:assert/strict'
import { materializeChapter, parseChapterCollection, partitionMaterial, validateChapterCollection } from '../src/lib/palaceChapters'

test('chapter headings and budgets preserve every original byte-equivalent character', () => {
  const source = { title: '多章材料', text: '  \r\n# 第一章\r\n不得超过20。😀\r\n公式 F = ma。\r\n# 第二章\r\n第二部分保持原样。\r\n  ' }
  const collection = partitionMaterial(source, { maxUnits: 2 })
  assert.ok(collection.chapters.length >= 2)
  assert.equal(collection.chapters.map(c => c.span.quote).join(''), source.text)
  assert.doesNotThrow(() => validateChapterCollection(collection))
  assert.equal(collection.chapters.at(-1)?.span.end, source.text.length)
})
test('numbered procedure steps are not mistaken for chapter headings', () => {
  const collection = partitionMaterial({ title: '步骤', text: '1. 检查条件。\n2. 准备材料。\n3. 完成任务。' })
  assert.equal(collection.chapters.length, 1)
  assert.equal(collection.chapters[0].candidateUnits, 3)
})
test('large unit collections are partitioned without dropping any unit and with distinct chapter IDs', () => {
  const source = { title: '100条', text: Array.from({ length: 100 }, (_, i) => `第${i + 1}条：完整保留。`).join('\n') }
  const collection = partitionMaterial(source)
  assert.equal(collection.chapters.length, 3)
  assert.deepEqual(collection.chapters.map(c => c.candidateUnits), [36, 36, 28])
  assert.equal(collection.chapters.map(c => c.span.quote).join(''), source.text)
  const first = materializeChapter(collection, collection.chapters[0].id)
  assert.equal(first.origin.start, 0); assert.equal(first.origin.chapterCount, 3)
  assert.notEqual(collection.chapters[0].id, collection.chapters[1].id)
})
test('oversized single sentence or formula is retained intact and marked for manual splitting', () => {
  const source = { title: '长公式', text: 'F = ' + 'x'.repeat(400) }
  const collection = partitionMaterial(source, { maxCharacters: 100 })
  assert.equal(collection.chapters[0].span.quote, source.text)
  assert.equal(collection.chapters[0].ready, false)
  assert.match(collection.chapters[0].warnings[0], /没有截断/)
})
test('tampering, overlap and missing tail fail collection validation', () => {
  const original = partitionMaterial({ title: 'test', text: '第一句。第二句。第三句。' }, { maxUnits: 1 })
  for (const change of [(x: typeof original) => x.chapters[0].span.quote = '改写', (x: typeof original) => x.chapters[1].span.start--, (x: typeof original) => { x.chapters.pop() }]) {
    const next = structuredClone(original); change(next); assert.throws(() => validateChapterCollection(next))
  }
})
test('partition budget failure is explicit and never returns a partial collection', () => {
  const source = { title: 'many', text: '完整的一句。'.repeat(10) }
  assert.throws(() => partitionMaterial(source, { maxUnits: 1, maxChapters: 2 }), /原文.*截断/)
  assert.equal(source.text, '完整的一句。'.repeat(10))
})
test('deterministic mixed-heading chapter fuzz retains exact source coverage', () => {
  let seed = 0x12345678
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  const pieces = ['保留中文。', '😀不要删除。', '\r\n', '\n# 新章节\n', '\n第二章 后续\n', 'F = ma。', '1. 第一步。\n', '2. 第二步。\n', '   ', 'A & B < C。']
  for (let trial = 0; trial < 200; trial++) {
    const text = Array.from({ length: 30 }, () => pieces[Math.floor(random() * pieces.length)]).join('')
    if (!text.trim()) continue
    const collection = partitionMaterial({ title: 'mixed', text }, { maxCharacters: 120, maxUnits: 3 })
    assert.equal(collection.chapters.map(c => c.span.quote).join(''), text)
    assert.doesNotThrow(() => validateChapterCollection(collection))
  }
})

test('collection parser strips unknown metadata and preserves full source references', () => {
  const original = partitionMaterial({ title: '标题', text: '# 一章\r\n保留😀。\r\n# 二章\n不得超过20。', references: [{ title: '参考', url: 'https://example.com/source' }] }, { maxUnits: 2 })
  const raw = { ...original, secret: 'not-persisted', notice: 'untrusted instructions', source: { ...original.source, apiKey: 'not-persisted' } }
  const restored = parseChapterCollection(raw)
  assert.deepEqual(restored, original)
  assert.notEqual(restored, original)
  const selected = materializeChapter(restored, restored.chapters.at(-1)!.id)
  assert.equal(selected.source.text, original.source.text.slice(selected.origin.start, selected.origin.end))
  assert.equal(selected.origin.totalCharacters, original.source.text.length)
  assert.deepEqual(selected.source.references, original.source.references)
})
test('collection schema rejects malformed integers, metadata and derived state', () => {
  const original = partitionMaterial({ title: '标题', text: '第一句。第二句。第三句。' }, { maxUnits: 1 })
  const changes: Array<(raw: typeof original) => void> = [
    raw => { raw.chapters[0].span.start = 0.5 },
    raw => { raw.chapters[0].span.end += 0.5 },
    raw => { raw.chapters[0].id = ' ' },
    raw => { raw.chapters[0].candidateUnits = 100 },
    raw => { raw.chapters[0].ready = false },
    raw => { raw.chapters[0].warnings = ['forged'] },
    raw => { raw.chapters[0].title = 'different source label' },
    raw => { raw.budget.maxUnits = 1.1 },
    raw => { raw.budget.maxChapters = 121 },
    raw => { raw.source.references = [{ title: 'bad', url: 'javascript:alert(1)' }] },
    raw => { raw.source.references = [{ title: 'bad', url: 'https://user:secret@example.com/' }] },
    raw => { raw.source.title = 'x'.repeat(501) },
  ]
  for (const change of changes) { const raw = structuredClone(original); change(raw); assert.throws(() => parseChapterCollection(raw)) }
  for (const raw of [null, [], {}, { ...original, chapters: {} }]) assert.throws(() => parseChapterCollection(raw))
})
test('long original titles survive while each derived plan title fits 240 UTF-16 units', () => {
  const source = { title: '😀'.repeat(250), text: '完整句子。'.repeat(100) }
  const collection = partitionMaterial(source)
  assert.equal(collection.source.title, source.title)
  assert.ok(collection.chapters.length > 1)
  for (const chapter of collection.chapters) {
    assert.ok(chapter.title.length <= 240)
    assert.equal(/[\uD800-\uDBFF]$/.test(chapter.title), false)
    assert.equal(materializeChapter(collection, chapter.id).source.title, chapter.title)
  }
  assert.deepEqual(parseChapterCollection(collection), collection)
})
