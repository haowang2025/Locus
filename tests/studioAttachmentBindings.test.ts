import test from 'node:test'
import assert from 'node:assert/strict'
import { compileStudioPalace, emptyProject, studioMediaIssues } from '../src/studio/core'
import { createOfflinePlan, offlineCue } from '../src/lib/palacePlanning'
import { sourceFingerprint } from '../src/lib/palaceModelProposal'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { attachmentRole } from '../src/lib/attachmentBindings'
const scene = getSceneDefinition('reading-hall')
function fixture() {
  const p = emptyProject(); p.title = 'Attachment policy'; p.text = '先登记设备。然后确认许可。'
  p.plan = createOfflinePlan(p.text, p.title, scene); p.plan.cues = p.plan.units.map(u => offlineCue(u, scene.anchors[0]))
  const fp = sourceFingerprint(p.plan.source)
  p.assets = [{ id:'img',mime:'image/png',base64:'aQ==',bytes:1,imageWidth:1,imageHeight:1 }]
  p.media = [{ id:'media',anchorId:scene.anchors[0].id,assetId:'img',kind:'image',fileName:'cue.png',scale:1,reviewed:true,bindings:[{assetId:'img',unitId:p.plan.units[0].id,role:'cue',sourceFingerprint:fp},{assetId:'img',unitId:p.plan.units[1].id,role:'reference',sourceFingerprint:fp}] }]
  return p
}
test('Studio preserves per-unit cue/reference bindings and fingerprints role changes', async () => {
  const p = fixture(), output = await compileStudioPalace(p,[],[],true), card=output.cards[0]
  const context={attachmentBindings:card.attachmentBindings,mnemonic:{unitIds:card.unitIds,sourceFingerprint:sourceFingerprint(p.plan!.source)}}
  assert.equal(attachmentRole(context,'img',card.unitIds[0]),'cue'); assert.equal(attachmentRole(context,'img',card.unitIds[1]),'reference')
  p.media[0].bindings![0].role='reference'; const changed=await compileStudioPalace(p,[],[],true)
  assert.notEqual(output.contentFingerprint,changed.contentFingerprint)
})
test('Studio rejects stale cue source and wrong unit before rendering/export', async () => {
  const p=fixture(); p.media[0].bindings![0].sourceFingerprint='stale'
  assert.ok(studioMediaIssues(p,scene).length); await assert.rejects(compileStudioPalace(p,[],[],true))
  p.media[0].bindings![0].sourceFingerprint=sourceFingerprint(p.plan!.source); p.media[0].bindings![0].unitId='unknown'
  assert.ok(studioMediaIssues(p,scene).length)
})
test('Missing roles stay post-answer references; all-unit cue is explicitly scoped', async () => {
  const p=fixture(); p.media[0].bindings=undefined; let card=(await compileStudioPalace(p,[],[],true)).cards[0]
  assert.equal(attachmentRole({attachmentBindings:card.attachmentBindings,mnemonic:{unitIds:card.unitIds}},'img',card.unitIds[0]),'reference')
  p.media[0].bindings=[{assetId:'img',scope:'anchor',role:'cue',sourceFingerprint:sourceFingerprint(p.plan!.source)}];card=(await compileStudioPalace(p,[],[],true)).cards[0]
  assert.ok(card.unitIds.every(id=>attachmentRole({attachmentBindings:card.attachmentBindings,mnemonic:{unitIds:card.unitIds,sourceFingerprint:sourceFingerprint(p.plan!.source)}},'img',id)==='cue'))
})
