import test from 'node:test'
import assert from 'node:assert/strict'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { nextUnreviewedUnit, unitReviewStatus } from '../src/lib/palaceReviewNavigation'
import { acknowledgeForTest } from './semanticFixtures'
const scene = getSceneDefinition('reading-hall')
test('next-unreviewed navigation wraps, skips complete fragments and reports completion', () => {
  const plan = acknowledgeForTest(createOfflinePlan('第一点。第二点。第三点。', 'navigation', scene))
  const ids = plan.units.map(unit => unit.id)
  plan.units[1].reviewed = false
  assert.equal(nextUnreviewedUnit(plan, ids[0]), ids[1])
  assert.equal(nextUnreviewedUnit(plan, ids[2]), ids[1])
  assert.equal(unitReviewStatus(plan, ids[1]).complete, false)
  assert.ok(unitReviewStatus(plan, ids[1]).pending.includes('确认原文与回忆问题'))
  plan.units[1].reviewed = true
  assert.equal(nextUnreviewedUnit(plan, ids[0]), null)
})
test('novice status identifies the exact outstanding review categories', () => {
  const plan = createOfflinePlan('不得超过20。', 'status', scene), unitId = plan.units[0].id
  const status = unitReviewStatus(plan, unitId)
  assert.equal(status.sourceChecksTotal, 1); assert.equal(status.sourceChecksDone, 0)
  assert.equal(status.pending.length, 4)
  plan.cues = []
  assert.ok(unitReviewStatus(plan, unitId).pending.includes('选择可用地标'))
})
