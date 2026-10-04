import { reconcilePalaceMedia } from './palaceMediaReconciliation'
import { sourceFingerprint } from './palaceModelProposal'
import { tx, nowIso } from './db'
import type { CardRecord, PalaceRecord } from './types'
import type { PalacePlan } from './palaceTypes'
import type { SceneDefinition } from './sceneRegistry'
import { validatePlan } from './palaceValidation'

export function planToCards(palaceId: string, plan: PalacePlan, scene: SceneDefinition, options: { requireReview?: boolean } = {}): CardRecord[] {
  const issues = validatePlan(plan, scene, options.requireReview !== false)
  if (issues.length) throw new Error(issues[0].message)
  const updatedAt = nowIso()
  const unitOrder = new Map(plan.units.map((unit, index) => [unit.id, index]))
  return scene.anchors.flatMap(anchor => {
    const cues = plan.cues.filter(c => c.anchorId === anchor.id).sort((a, b) => (unitOrder.get(a.unitId) ?? 0) - (unitOrder.get(b.unitId) ?? 0))
    if (!cues.length) return []
    const units = cues.map(c => plan.units.find(u => u.id === c.unitId)!)
    return [{ palaceId, locusId: anchor.locusId, routeIndex: anchor.routeOrder, prompt: `${anchor.label} · 回忆 ${units.length} 个含义单元`, answer: units.map(u => u.facts).join('\n\n'), note: units.map((u, i) => `【原文单元 ${i + 1}】${u.title}\n【回忆问题】${u.question}\n【创意联想，不是原文事实】${cues[i].object}；${cues[i].action}\n【映射理由】${cues[i].rationale}`).join('\n\n'), imageIds: [], revealedCount: 0, updatedAt, mnemonic: { sourceFingerprint: sourceFingerprint(plan.source), schemaVersion: 1 as const, anchorId: anchor.id, unitIds: units.map(u => u.id), cues: cues.map(({ unitId, volumeId, object, visual, action, imaginedAction, renderedDescription, semanticReview, spatialRelation, relationId, rationale }) => ({ unitId, volumeId, object, visual, action, imaginedAction, renderedDescription, semanticReview, spatialRelation, relationId, rationale })) } }]
  })
}

/** One transaction prevents a partial card/plan update if any write fails. */
export async function savePalacePlan(palaceId: string, plan: PalacePlan, scene: SceneDefinition): Promise<void> {
  const newCards = planToCards(palaceId, plan, scene)
  await tx('readwrite', ['palace', 'cards'], async ({ palace, cards }) => {
    const current = await palace.get(palaceId) as PalaceRecord | undefined
    if (!current) throw new Error('宫殿不存在或已删除。')
    const previousCards = await cards.index('byPalace').getAll(palaceId) as CardRecord[]
    const reconciled = reconcilePalaceMedia(current, previousCards, newCards, plan)
    const keys = await cards.index('byPalace').getAllKeys(palaceId) as IDBValidKey[]
    for (const key of keys) await cards.delete(key)
    for (const card of reconciled.cards) await cards.put(card)
    await palace.put({ ...current, mnemonicPlan: plan, unassignedAttachments: reconciled.unassignedAttachments, updatedAt: nowIso() })
  })
}
