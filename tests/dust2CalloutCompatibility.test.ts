import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { getSceneDefinition, listCreatableSceneDefinitions, validateSceneDefinition, isDust2Scene } from '../src/lib/sceneRegistry'
import { createOfflinePlan } from '../src/lib/palacePlanning'
import { sanitizeBackupPlan } from '../src/lib/palaceBackupValidation'
import { emptyProject, serializeStudioBackup, parseStudioBackup, compileSceneTour } from '../src/studio/core'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
test('Legacy v4 and reading hall registry geometry and routes are byte-for-byte unchanged', () => {
  assert.equal(digest(getSceneDefinition('dust2')), 'c091126185fd7697b110a559218bbc063d962cbf8e7e0b2d17587ece8f37872c')
  assert.equal(digest(getSceneDefinition('reading-hall')), '45a4e0a0bf30326063986a7e0ca9916b9549bafed8724617245699b14ecdde86')
})
test('Old v4 plan and Studio backup retain original scene, anchors, and version', async () => {
  const scene = getSceneDefinition('dust2'), p = { ...emptyProject(), sceneId: scene.id, title: '兼容性', text: '第一条不应丢失。第二条只有核对后才能执行。' }
  const plan = createOfflinePlan(p.text, p.title, scene), restored = sanitizeBackupPlan(plan, { allowIncompleteDraft: true })
  assert.equal(restored.sceneId, 'dust2'); assert.equal(restored.sceneVersion, scene.version)
  assert.deepEqual(restored.cues.map(c => c.anchorId), plan.cues.map(c => c.anchorId))
  const project = await parseStudioBackup(serializeStudioBackup({ ...p, plan }))
  assert.equal(project.sceneId, 'dust2'); assert.equal(project.plan!.sceneVersion, scene.version)
  assert.deepEqual(project.plan!.cues.map(c => c.anchorId), plan.cues.map(c => c.anchorId))
})
test('New scene selection hides legacy v4 while existing v4 remains selectable', () => {
  assert.ok(!listCreatableSceneDefinitions().some(s => s.id === 'dust2'))
  assert.ok(listCreatableSceneDefinitions('dust2').some(s => s.id === 'dust2'))
  assert.equal(isDust2Scene('dust2-callouts'), true)
})
test('Dust2 scene tours require the embedded model', async () => {
  await assert.rejects(compileSceneTour('dust2', [], []), /GLB|缺少场景模型/)
})
test('Legacy registry remains structurally valid', () => { assert.deepEqual(validateSceneDefinition(getSceneDefinition('dust2')), []) })
test('Player callouts use a distinct valid scene identity and disjoint semantic anchor IDs', () => {
  const scene = getSceneDefinition('dust2-callouts'), old = getSceneDefinition('dust2')
  assert.equal(scene.version, 'dust2-vrchris-08f7ab9c-v5'); assert.deepEqual(validateSceneDefinition(scene), [])
  assert.ok(scene.anchors.every(a => a.id.startsWith('dust2v5-') && !old.anchors.some(b => b.id === a.id)))
  assert.ok(scene.anchors.every(a => a.zone.trim() && a.calloutAliases?.length && a.playerCallout?.regionZh))
  assert.ok(listCreatableSceneDefinitions().some(s => s.id === scene.id))
})
test('Changing only scene identity cannot silently migrate an old plan to player callouts', () => {
  const old = createOfflinePlan('第一条不应丢失。第二条只有核对后才能执行。', '兼容性', getSceneDefinition('dust2'))
  assert.throws(() => sanitizeBackupPlan({ ...old, sceneId: 'dust2-callouts' }, { allowIncompleteDraft: true }))
  assert.throws(() => sanitizeBackupPlan({ ...old, sceneId: 'dust2-callouts', sceneVersion: 'dust2-vrchris-08f7ab9c-v5' }, { allowIncompleteDraft: true }))
})
test('Player-callout Studio backup roundtrip preserves the independent scene identity', async () => {
  const scene = getSceneDefinition('dust2-callouts'), p = { ...emptyProject(), sceneId: scene.id, title: '报点备份', text: '不能改写原句。必须先核对再确认。' }
  const plan = createOfflinePlan(p.text, p.title, scene), restored = await parseStudioBackup(serializeStudioBackup({ ...p, plan }))
  assert.equal(restored.sceneId, scene.id); assert.equal(restored.plan!.sceneVersion, scene.version)
  assert.deepEqual(restored.plan!.cues.map(c => c.anchorId), plan.cues.map(c => c.anchorId))
  await assert.rejects(compileSceneTour(scene.id, [], []), /GLB|缺少场景模型/)
})
