import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCopyablePrompt, buildModelInput, MODEL_BUDGET, normalizeModelProposal, prepareIndexedSegments, sourceFingerprint } from '../src/lib/palaceModelProposal'
import { parsePlanJson, requestPlan } from '../src/lib/palaceProvider'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { sourceCoverage } from '../src/lib/palaceValidation'
const scene = getSceneDefinition('reading-hall')
const source = { text: '😀第一步：不得超过 20 g。\r\n第二步：如果符合条件，则计算 F = ma。', title: '来源片段' }
const cue = (unitId: string) => ({ unitId, anchorId: scene.anchors[0].id, relationId: 'ordered-row', object: '可见天平', action: '天平静止，想象核对两侧关系。', rationale: '天平提示质量；原文公式需要准确复述。', visual: { shape: 'scale', color: '#edba64', motion: 'none' } })
const proposal = (text = source.text) => ({ format: 'locus-semantic-proposal-v1', sourceFingerprint: sourceFingerprint({text,title:source.title}), sceneId:scene.id, sceneVersion:scene.version, units: prepareIndexedSegments(text).map((s, i) => ({ id: `u${i + 1}`, title: `单元 ${i + 1}`, question: '完整回忆原文？', parts: [{ segmentId: s.id }] })), cues: prepareIndexedSegments(text).map((_, i) => cue(`u${i + 1}`)) })

test('segment IDs reconstruct original Unicode/CRLF facts without model offsets', () => {
  const p = parsePlanJson(JSON.stringify(proposal()), source, scene)
  assert.equal(sourceCoverage(p).percent, 100)
  assert.equal(p.source.text, source.text)
  assert.equal(p.units[0].facts, '😀第一步：不得超过 20 g。')
  assert.equal(p.cues[0].volumeId, scene.anchors[0].cueVolume.id)
  assert.equal(p.generation.mode, 'structured-import')
})
test('model can group whole segment IDs with no rewriting or artificial line breaks', () => {
  const raw = proposal()
  raw.units = [{ id: 'u1', title: '完整程序', question: '先后步骤是什么？', parts: prepareIndexedSegments(source.text).map(s => ({ segmentId: s.id })) }]
  raw.cues = [cue('u1')]
  const p = parsePlanJson(JSON.stringify(raw), source, scene)
  assert.equal(p.units[0].facts, source.text)
  assert.equal(p.units[0].spans.length, 1)
})
test('exact unique subquotes split a source segment safely', () => {
  const input = { text: '只有符合条件，才可执行。', title: 'split' }
  const raw = { format: 'locus-semantic-proposal-v1', sourceFingerprint: sourceFingerprint(input), sceneId:scene.id, sceneVersion:scene.version, units: [ { id: 'u1', title: '条件', question: '条件？', parts: [{ segmentId: 'segment-001', quote: '只有符合条件，' }] }, { id: 'u2', title: '动作', question: '动作？', parts: [{ segmentId: 'segment-001', quote: '才可执行。' }] } ], cues: [cue('u1'), cue('u2')] }
  const p = parsePlanJson(JSON.stringify(raw), input, scene)
  assert.equal(sourceCoverage(p).percent, 100)
  assert.equal(p.units[1].spans[0].start, 7)
})
test('repeated subquote, invented segment IDs, paraphrased quotes and omissions are rejected', () => {
  const input = { text: '甲乙甲乙。', title: 'repeated' }
  const raw = { format: 'locus-semantic-proposal-v1', sourceFingerprint: sourceFingerprint(input), sceneId:scene.id, sceneVersion:scene.version, units: [{ id: 'u1', title: 'part', question: 'what?', parts: [{ segmentId: 'segment-001', quote: '甲乙' }] }], cues: [cue('u1')] }
  assert.throws(() => normalizeModelProposal(raw, input, scene), /重复出现/)
  raw.units[0].parts[0].quote = '改写'
  assert.throws(() => normalizeModelProposal(raw, input, scene), /精确文字/)
  raw.units[0].parts[0].segmentId = 'evil-id'
  assert.throws(() => normalizeModelProposal(raw, input, scene), /未知来源片段/)
  const omitted = proposal(); omitted.units.pop(); omitted.cues.pop()
  assert.throws(() => parsePlanJson(JSON.stringify(omitted), source, scene), /未覆盖/)
})
test('Unicode surrogate halves are never accepted as separate facts', () => {
  const input = { text: '😀', title: 'unicode' }
  const raw = { format: 'locus-semantic-proposal-v1', sourceFingerprint: sourceFingerprint(input), sceneId:scene.id, sceneVersion:scene.version, units: [{ id: 'a', title: 'a', question: 'a?', parts: [{ segmentId: 'segment-001', quote: '\ud83d' }] }, { id: 'b', title: 'b', question: 'b?', parts: [{ segmentId: 'segment-001', quote: '\ude00' }] }], cues: [cue('a'), cue('b')] }
  assert.throws(() => parsePlanJson(JSON.stringify(raw), input, scene), /Unicode/)
})
test('long unbroken segments split locally without breaking emoji', () => {
  const text = '😀'.repeat(1000)
  const segments = prepareIndexedSegments(text)
  assert.ok(segments.every(s => s.text.length <= 600 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(s.text)))
  assert.equal(segments.map(s => s.text).join(''), text)
  assert.ok(segments[1].continuesPrevious)
})
test('source/context/capacity budgets are explicit and no network runs for oversized source', async () => {
  const input = buildModelInput(source, scene)
  assert.equal(input.budget.maxUnits, 36)
  assert.ok(input.budget.estimatedInputTokens < MODEL_BUDGET.maxEstimatedInputTokens)
  let called = false
  await assert.rejects(requestPlan({ endpoint: 'https://example.test/plan', model: 'configured-id' }, { text: '大'.repeat(MODEL_BUDGET.maxSourceCharacters + 1), title: 'large' }, scene, { transport: async () => { called = true; throw Error('unexpected') } }), /不会自动截断/)
  assert.equal(called, false)
})
test('copyable package includes schema and rich landmarks without endpoint or credentials', () => {
  const prompt = buildCopyablePrompt(source, scene)
  assert.match(prompt, /OUTPUT JSON SCHEMA/); assert.match(prompt, /UNTRUSTED DATA/); assert.match(prompt, /segment-001/); assert.match(prompt, /landmark/)
  assert.equal(prompt.includes('Authorization'), false)
})
test('mock transport accepts compact model output and ignores invented full-source fields', async () => {
  let body: Record<string, unknown> = {}
  const raw = { ...proposal(), source: { text: '恶意重写' }, facts: 'fake' }
  const plan = await requestPlan({ endpoint: 'https://example.test/plan', model: 'configured-id' }, source, scene, { transport: async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify(raw)) } })
  assert.equal(plan.source.text, source.text)
  assert.equal(plan.generation.mode, 'model-assisted')
  const data = body.data as { source: Record<string, unknown>; budget: { maxUnits: number } }
  assert.equal(data.source.text, undefined); assert.ok(Array.isArray(data.source.segments)); assert.equal(data.budget.maxUnits, 36)
})
test('old proposal is rejected after source or scene changes even when segment IDs still exist', () => {
  const raw = proposal()
  assert.throws(() => parsePlanJson(JSON.stringify(raw), { ...source, text: source.text.replace('20 g', '30 g') }, scene), /材料版本不匹配/)
  raw.sceneVersion = 'old'
  assert.throws(() => parsePlanJson(JSON.stringify(raw), source, scene), /场景版本不匹配/)
})
