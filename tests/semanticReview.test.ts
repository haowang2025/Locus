import test from 'node:test'
import assert from 'node:assert/strict'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { acknowledgeSemanticUnit, describeRenderedCue, initializeSemanticCue, invalidateSemanticCue, semanticChecksComplete, sourceSemanticInventory } from '../src/lib/palaceSemanticReview'
import { getSceneDefinition, EXECUTABLE_CUE_RELATIONS } from '../src/lib/sceneRegistry'
import { validatePlan } from '../src/lib/palaceValidation'
import { parsePlanJson } from '../src/lib/palaceProvider'
import { buildMnemonicCueGroup } from '../src/three/mnemonicCues'
import { acknowledgeForTest } from './semanticFixtures'
const scene = getSceneDefinition('reading-hall')
function draft() { return createOfflinePlan('只有主管和复核人同时同意，才允许执行；没有书面许可时，不得超过 95℃。', 'protected clauses', scene) }

test('semantic inventory keeps the whole condition/operator/scope rather than isolated numbers', () => {
  const p = draft(), inventory = sourceSemanticInventory(p.units[0])
  assert.equal(inventory.length, 1)
  assert.equal(inventory[0].quote, p.source.text)
  assert.ok(inventory[0].kinds.some(k => k.includes('条件')))
  assert.ok(inventory[0].kinds.some(k => k.includes('并列')))
  assert.ok(inventory[0].kinds.some(k => k.includes('数字')))
})
test('blanket unit/cue reviewed flags cannot bypass structured semantic acknowledgment', () => {
  const p = draft(); p.units[0].reviewed = true; p.cues[0].reviewed = true
  assert.ok(validatePlan(p, scene, true).some(i => i.code === 'semantic-review'))
  acknowledgeForTest(p)
  assert.deepEqual(validatePlan(p, scene, true), [])
})
test('model/import approval flags are discarded and renderer prose cannot be forged', () => {
  const p = acknowledgeForTest(draft()); p.cues[0].renderedDescription = '真实激光会自动执行许可审批'
  const parsed = parsePlanJson(JSON.stringify(p), p.source, scene), cue = parsed.cues[0]
  assert.equal(cue.reviewed, false)
  assert.ok(cue.semanticReview!.sourceChecks.every(c => !c.checked))
  assert.equal(cue.semanticReview!.renderedConfirmed, false)
  assert.equal(cue.renderedDescription?.includes('真实激光'), false)
})
test('rendered descriptions match relation-driven orbit and rise override behavior', () => {
  const p = draft(), base = p.cues[0], anchor = scene.anchors[0]
  const orbit = { ...base, relationId: 'orbit' as const, spatialRelation: EXECUTABLE_CUE_RELATIONS.orbit, visual: { ...base.visual, motion: 'none' as const } }
  assert.match(describeRenderedCue(orbit, anchor), /小圆轨道移动/)
  assert.equal(describeRenderedCue(orbit, anchor).includes('道具保持静止'), false)
  const rise = { ...base, relationId: 'rise' as const, spatialRelation: EXECUTABLE_CUE_RELATIONS.rise, visual: { ...base.visual, motion: 'spin' as const } }
  const group = buildMnemonicCueGroup({ cues: [rise] }, anchor)
  assert.equal(group.children[0].userData.motion, 'bounce')
  assert.match(describeRenderedCue(rise, anchor), /周期上下起伏/)
  assert.match(describeRenderedCue(rise, anchor), /减少动画模式/)
})
test('editing or reanchoring invalidates source checks and rendering/limitations confirmations', () => {
  const p = acknowledgeForTest(draft()), old = p.cues[0]
  const invalid = invalidateSemanticCue(old)
  assert.equal(semanticChecksComplete(invalid.semanticReview), false)
  assert.ok(invalid.semanticReview!.sourceChecks.every(c => !c.checked))
  const next = initializeSemanticCue(p.units[0], { ...old, anchorId: scene.anchors[1].id, volumeId: scene.anchors[1].cueVolume.id, action: '新的想象', imaginedAction: '新的想象' }, scene.anchors[1])
  assert.equal(next.action, '新的想象'); assert.equal(next.imaginedAction, '新的想象')
  assert.equal(next.reviewed, false); assert.equal(next.semanticReview!.renderedConfirmed, false)
})
test('empty explanations or missing-visual-details acknowledgment cannot be marked complete', () => {
  const p = acknowledgeForTest(draft()), review = p.cues[0].semanticReview!
  review.sourceChecks[0].explanation = ''
  assert.equal(semanticChecksComplete(review), false)
  review.sourceChecks[0].explanation = '按完整原文复述'; review.limitationsConfirmed = false
  assert.equal(semanticChecksComplete(review), false)
})
test('invented source-mapping quotations are rejected, rather than treated as facts', () => {
  const p = draft(), raw = structuredClone(p) as typeof p & { cues: Array<typeof p.cues[number] & { sourceMappings?: { quote: string; explanation: string }[] }> }
  raw.cues[0].sourceMappings = [{ quote: '任何温度都可以', explanation: '模型捏造的引用' }]
  assert.throws(() => parsePlanJson(JSON.stringify(raw), p.source, scene), /并非该单元的精确证据/)
})

test('explicit single-unit confirmation sets canonical attestations without touching siblings', () => {
  const plan = createOfflinePlan('第一句。第二句。', 'two units', scene)
  const cue = plan.cues[0], unit = plan.units[0], anchor = scene.anchors.find(a => a.id === cue.anchorId)!
  const confirmed = acknowledgeSemanticUnit(unit, cue, anchor)
  assert.equal(confirmed.unit.reviewed, true)
  assert.equal(confirmed.cue.reviewed, true)
  assert.equal(semanticChecksComplete(confirmed.cue.semanticReview), true)
  assert.equal(unit.reviewed, false)
  assert.equal(plan.units[1].reviewed, false)
  assert.equal(plan.cues[1].reviewed, false)
  assert.throws(() => acknowledgeSemanticUnit(unit, { ...cue, renderedDescription: 'invented motion' }, anchor))
  const incomplete = structuredClone(cue); incomplete.semanticReview!.sourceChecks[0].explanation = ''
  assert.throws(() => acknowledgeSemanticUnit(unit, incomplete, anchor))
})
