import test from 'node:test'
import assert from 'node:assert/strict'
import { segmentSource } from '../src/lib/palaceSegmentation'
import { createOfflinePlan, offlineCue } from '../src/lib/palacePlanning'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { sourceCoverage, validatePlan } from '../src/lib/palaceValidation'

const scene = getSceneDefinition('reading-hall')
test('English prose yields distinct exact-evidence sentence units', () => {
  const text = 'A force can change motion. Mass measures inertia. Momentum equals mass times velocity. Energy is conserved in an isolated system.'
  const plan = createOfflinePlan(text, 'Physics', scene)
  assert.equal(plan.units.length, 4)
  assert.equal(plan.units.map(u => u.facts).join(''), text)
  assert.equal(sourceCoverage(plan).percent, 100)
  assert.deepEqual(validatePlan(plan, scene), [])
})

test('English fallback preserves abbreviations, decimals, initials and dotted identifiers', () => {
  for (const text of [
    'Dr. Smith measures 3.14 kg.',
    'Prof. Jones refers to Fig. Three for context.',
    'J. Robert describes the U.S. Energy policy.',
    'Use e.g. Newton and Einstein as examples.',
    'See Eq. Newton for this example.',
    'Version 1.2.3 remains supported.',
    'Email a.b@example.com. Reply if needed.',
    'Visit https://example.com/docs. Read the instructions.',
    '1. Check the equipment.',
    'Evaluate F=m.a. Then explain the variables.',
  ]) {
    const units = segmentSource(text)
    assert.equal(units.length, 1, text)
    assert.equal(units[0].facts, text)
  }
  const text = 'The value is 3.14 kg. The sign must not change.'
  assert.equal(segmentSource(text).length, 2)
  assert.equal(segmentSource(text).map(u => u.facts).join(''), text)
})

test('numbered procedures use content before ordinal labels to choose a visual category', () => {
  const facts = ['操作前检查设备并填写记录', '遇到故障立即通知负责人', '隔离现场并暂停作业', '填写记录后提交报告']
  const text = Array.from({ length: 24 }, (_, i) => `第${i + 1}条：${facts[i % facts.length]}。`).join('\n')
  const plan = createOfflinePlan(text, '操作步骤', scene)
  assert.equal(plan.units.length, 24)
  assert.deepEqual(plan.cues.slice(0, 4).map(c => c.visual.shape), ['key', 'ring', 'shield', 'book'])
  assert.equal(new Set(plan.cues.map(c => c.visual.shape)).size, 4)
  assert.equal(sourceCoverage(plan).percent, 100)
  assert.deepEqual(validatePlan(plan, scene), [])
  assert.ok(plan.units[0].protectedTokens.includes('1'))
  assert.equal(plan.units[0].facts, '第1条：操作前检查设备并填写记录。')
})

test('list labels are ignored only for rule matching; factual numbers and restrictions survive', () => {
  for (const label of ['1. ', '2) ', '3、', '(4) ', '（5）', '第6条：']) {
    const facts = label + '叶片呈绿色。'
    const unit = segmentSource(facts)[0]
    const cue = offlineCue(unit, scene.anchors[0])
    assert.equal(cue.visual.shape, 'book', facts)
    assert.equal(unit.facts, facts)
  }
  for (const facts of ['3.14 为测定值。', '1. 测定值为 20。']) {
    assert.equal(offlineCue(segmentSource(facts)[0], scene.anchors[0]).visual.shape, 'cone', facts)
  }
  assert.equal(offlineCue(segmentSource('1. 不得超过 20。')[0], scene.anchors[0]).visual.shape, 'shield')
})
