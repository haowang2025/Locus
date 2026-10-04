import type { PalacePlan } from '../src/lib/palaceTypes'
import { initializeSemanticCue } from '../src/lib/palaceSemanticReview'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
/** Test-only simulation of all explicit review actions; never called by application code. */
export function acknowledgeForTest(plan: PalacePlan): PalacePlan {
  const scene = getSceneDefinition(plan.sceneId)
  plan.units.forEach(unit => unit.reviewed = true)
  plan.cues = plan.cues.map(cue => {
    const unit = plan.units.find(u => u.id === cue.unitId)!, anchor = scene.anchors.find(a => a.id === cue.anchorId)!
    const next = initializeSemanticCue(unit, cue, anchor)
    next.semanticReview!.sourceChecks.forEach(check => check.checked = true)
    next.semanticReview!.renderedConfirmed = true; next.semanticReview!.limitationsConfirmed = true; next.reviewed = true
    return next
  })
  return plan
}
