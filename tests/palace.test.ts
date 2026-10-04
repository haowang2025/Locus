import { acknowledgeForTest } from './semanticFixtures'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { mergeUnits, segmentSource, splitUnit } from '../src/lib/palaceSegmentation'
import { requestPlan, parsePlanJson, validateEndpoint } from '../src/lib/palaceProvider'
import { sourceCoverage, validatePlan } from '../src/lib/palaceValidation'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { planToCards } from '../src/lib/palaceStorage'

const scene = getSceneDefinition('reading-hall')
const source = { text: '1. 不得超过 20 mg。\r\n2. E = mc²。\n3. 如果没有水，则不能进行此步骤。😀', title: '程序与条件' }
const draft = () => createOfflinePlan(source.text, source.title, scene)
const approve = () => { const p = draft(); p.units.forEach(u => u.reviewed = true); p.cues.forEach(c => c.reviewed = true); acknowledgeForTest(p); return p }

test('source coverage preserves Chinese, CRLF, emoji, numbers, negation and formula', () => {
  const plan = draft()
  assert.equal(sourceCoverage(plan).percent, 100)
  assert.deepEqual(validatePlan(plan, scene), [])
  assert.ok(plan.units.some(u => u.protectedTokens.includes('不得')))
  assert.ok(plan.units.some(u => u.facts.includes('E = mc²')))
  assert.equal(plan.source.text, source.text)
})
test('all 80 substantive lines survive and overflow is explicit', () => {
  const text = Array.from({ length: 80 }, (_, i) => `第${i + 1}条：不能省略。`).join('\n')
  const p = createOfflinePlan(text, 'large', scene)
  assert.equal(p.units.length, 80)
  assert.equal(sourceCoverage(p).percent, 100)
  assert.ok(validatePlan(p, scene).some(i => i.code === 'unassigned'))
  assert.throws(() => planToCards('p', p, scene))
})
test('split/merge preserve exact evidence and invalidate review', () => {
  const text = '如果满足条件，才允许执行。'
  const unit = segmentSource(text)[0]
  const [a, b] = splitUnit(text, unit, 7)
  const merged = mergeUnits(text, a, b)
  assert.equal(merged.spans.map(s => s.quote).join(''), text)
  assert.equal(merged.reviewed, false)
  assert.throws(() => splitUnit('😀x', segmentSource('😀x')[0], 1))
})
test('cards preserve source order, separate creative notes and reset review', () => {
  const p = approve(), cards = planToCards('palace', p, scene)
  assert.deepEqual(cards.flatMap(c => c.mnemonic!.unitIds), p.units.map(u => u.id))
  assert.ok(cards.every(c => c.reviewCount === undefined && c.revealedCount === 0))
  assert.ok(cards.every(c => c.note?.includes('创意联想，不是原文事实')))
  assert.ok(cards[0].answer.includes('不得超过 20 mg'))
})
test('unreviewed facts or cues cannot be saved', () => {
  const p = approve(); p.cues[0].reviewed = false
  assert.throws(() => planToCards('p', p, scene), /核对/)
})
test('recognizable prop categories keep object/action aligned', () => {
  const p = createOfflinePlan('E = mc²。因为发生关联，因此导致变化。只有条件满足，才解锁。', 'props', scene)
  assert.equal(p.cues[0].visual.shape, 'scale')
  assert.match(p.cues[0].object, /天平/); assert.match(p.cues[0].action, /天平/)
  assert.equal(p.cues[1].visual.shape, 'chain')
  assert.equal(p.cues[2].visual.shape, 'key')
})
test('JSON import strips approvals and unknown credential-like properties', () => {
  const p = approve()
  const parsed = parsePlanJson(JSON.stringify({ ...p, apiKey: 'not-a-real-key', endpoint: 'https://invalid.test' }), source, scene)
  assert.ok(parsed.units.every(u => !u.reviewed)); assert.ok(parsed.cues.every(c => !c.reviewed))
  assert.equal('apiKey' in parsed, false); assert.equal('endpoint' in parsed, false)
})
test('JSON rejects invented facts, partial source coverage, IDs, unknown anchors', () => {
  for (const change of [(p: ReturnType<typeof draft>) => p.units[0].facts = 'invented', (p: ReturnType<typeof draft>) => p.units.pop(), (p: ReturnType<typeof draft>) => { p.units[0].id = ''; p.cues[0].unitId = '' }, (p: ReturnType<typeof draft>) => p.cues[0].anchorId = 'outside-scene']) {
    const p = draft(); change(p)
    assert.throws(() => parsePlanJson(JSON.stringify(p), source, scene))
  }
})
test('source and route reversals are rejected', () => {
  const p = createOfflinePlan(Array.from({ length: 6 }, (_, i) => `${i + 1}. 检查步骤。`).join('\n'), 'order', scene)
  const first = p.cues[0], last = p.cues.at(-1)!
  ;[first.anchorId, last.anchorId] = [last.anchorId, first.anchorId]
  assert.ok(validatePlan(p, scene).some(i => i.code === 'order'))
  const q = draft(); q.units.reverse()
  assert.ok(validatePlan(q, scene).some(i => i.code === 'source-order'))
})
test('mocked provider sends data separately, no credentials, returns checked unreviewed proposal', async () => {
  let sent: Record<string, unknown> | undefined
  const transport: typeof fetch = async (_input, init) => {
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error')
    sent = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ plan: approve() }), { status: 200 })
  }
  const p = await requestPlan({ endpoint: 'https://example.test/plan', model: 'user-verified-id' }, source, scene, { transport, origin: 'https://app.example.test' })
  assert.equal(sent?.operation, 'locus-semantic-proposal-v1'); assert.equal(p.generation.model, 'user-verified-id')
  assert.ok(p.units.every(u => !u.reviewed))
  assert.match(String(sent?.instructions), /UNTRUSTED DATA/)
})
test('provider errors and aborts do not mutate existing plan', async () => {
  const original = draft(), serialized = JSON.stringify(original)
  const settings = { endpoint: 'https://example.test/plan', model: 'verified-id' }
  await assert.rejects(requestPlan(settings, source, scene, { transport: async () => new Response('no', { status: 500 }) }), /HTTP 500/)
  await assert.rejects(requestPlan(settings, source, scene, { transport: async () => new Response('not JSON') }), /合法 JSON/)
  assert.equal(JSON.stringify(original), serialized)
})
test('endpoints reject missing models, URL credentials, query tokens and insecure remote hosts', () => {
  for (const endpoint of ['https://user:password@example.test', 'https://example.test?token=x', 'http://remote.test']) assert.throws(() => validateEndpoint({ endpoint, model: 'id' }, 'https://app.test'))
  assert.throws(() => validateEndpoint({ endpoint: 'https://example.test', model: '' }, 'https://app.test'))
  assert.equal(validateEndpoint({ endpoint: '/api/plan', model: 'id' }, 'https://app.test').origin, 'https://app.test')
})
test('adapter rejects late response when transport ignores an aborted signal', async () => {
  const controller = new AbortController()
  const transport: typeof fetch = async () => { controller.abort(); return new Response(JSON.stringify({ plan: draft() })) }
  await assert.rejects(requestPlan({ endpoint: 'https://example.test/plan', model: 'id' }, source, scene, { transport, signal: controller.signal }), /aborted/)
})
test('all three authored demos are unreviewed, source-complete, ordered and honestly labeled', async () => {
  const { createAuthoredDemo, SAMPLE_MATERIALS } = await import('../src/lib/palaceSamples')
  for (const sample of SAMPLE_MATERIALS) {
    const p = createAuthoredDemo(sample.id)
    assert.equal(p.generation.mode, 'authored-demo')
    assert.equal(p.units.length, 3)
    assert.deepEqual(validatePlan(p, scene), [])
    assert.equal(sourceCoverage(p).percent, 100)
    assert.ok(p.units.every(u => !u.reviewed)); assert.ok(p.cues.every(c => !c.reviewed))
    if (sample.id !== 'procedure') assert.ok(p.source.references?.length)
  }
})
test('maximum offline unbroken input remains responsive and source-complete', () => {
  const text = 'a'.repeat(200_000), started = performance.now()
  const plan = createOfflinePlan(text, 'long uninterrupted material', scene)
  assert.equal(sourceCoverage(plan).percent, 100)
  assert.equal(plan.units[0].facts, text)
  assert.ok(performance.now() - started < 3000, 'bounded token extraction should not rescan every suffix')
})
test('too many offline candidate units fail explicitly without returning a truncated draft', () => {
  const text = '保留这一句。'.repeat(241)
  assert.throws(() => createOfflinePlan(text, 'many chapters', scene), /超过 240.*原文完整保留/)
  assert.equal(text.match(/保留/g)?.length, 241)
})
test('short source material uses distinct anchors; longer material groups contiguously and fits uneven capacity', () => {
  const short = createOfflinePlan('第一点。第二点。第三点。', 'route', scene)
  assert.equal(new Set(short.cues.map(c => c.anchorId)).size, 3)
  const uneven = structuredClone(scene); uneven.anchors = uneven.anchors.slice(0, 3)
  uneven.anchors[0].capacity = 3; uneven.anchors[1].capacity = 1; uneven.anchors[2].capacity = 1
  const p = createOfflinePlan('一。二。三。四。五。', 'uneven', uneven)
  assert.equal(p.cues.length, 5)
  assert.deepEqual(p.cues.map(c => c.anchorId), [uneven.anchors[0].id, uneven.anchors[0].id, uneven.anchors[0].id, uneven.anchors[1].id, uneven.anchors[2].id])
  assert.deepEqual(validatePlan(p, uneven), [])
})
test('local text import preserves valid Unicode and refuses silent decoding corruption', async () => {
  const { decodeTextMaterial } = await import('../src/lib/palaceTextInput')
  const text = '条件不得改写。\r\n😀 F = ma。'
  assert.equal(decodeTextMaterial(new TextEncoder().encode(text).buffer), text)
  assert.throws(() => decodeTextMaterial(new Uint8Array([0xff, 0xfe, 0xd6, 0xd0]).buffer), /UTF-8/)
})
test('default retrieval question does not echo the fact or its target number', () => {
  const p = createOfflinePlan('温度不得超过 73℃。', 'neutral recall', scene)
  assert.equal(p.units[0].question.includes('73'), false)
  assert.equal(p.units[0].question.includes('温度不得超过'), false)
})
