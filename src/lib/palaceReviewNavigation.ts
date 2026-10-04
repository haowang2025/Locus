import type { PalacePlan } from './palaceTypes'
import { semanticChecksComplete } from './palaceSemanticReview'

export function unitReviewStatus(plan: PalacePlan, unitId: string) {
  const unit = plan.units.find(u => u.id === unitId), cue = plan.cues.find(c => c.unitId === unitId), review = cue?.semanticReview
  const pending: string[] = []
  if (!unit?.reviewed) pending.push('确认原文与回忆问题')
  if (!cue) pending.push('选择可用地标')
  else {
    const unchecked = review?.sourceChecks.filter(check => !check.checked || !check.explanation.trim()).length ?? 0
    if (!review || unchecked) pending.push(unchecked ? `核对 ${unchecked} 条原文与联想的对应` : '核对完整的原文与联想对应')
    if (!review?.renderedConfirmed) pending.push('区分实际画面与想象')
    if (!review?.limitationsConfirmed || !review.notEncoded.trim()) pending.push('确认还需要口头补全的内容')
    if (unit?.reviewed && semanticChecksComplete(review) && !cue.reviewed) pending.push('确认本片段审核完成')
  }
  return { complete: !!unit?.reviewed && !!cue?.reviewed && semanticChecksComplete(review), pending, sourceChecksTotal: review?.sourceChecks.length ?? 0, sourceChecksDone: review?.sourceChecks.filter(check => check.checked && check.explanation.trim()).length ?? 0 }
}
export function nextUnreviewedUnit(plan: PalacePlan, afterUnitId?: string): string | null {
  const index = Math.max(-1, plan.units.findIndex(unit => unit.id === afterUnitId))
  const ordered = [...plan.units.slice(index + 1), ...plan.units.slice(0, index + 1)]
  return ordered.find(unit => !unitReviewStatus(plan, unit.id).complete)?.id ?? null
}
