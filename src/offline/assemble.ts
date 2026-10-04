import { sourceFingerprint } from '../lib/palaceModelProposal'
import { parseAttachmentBindings } from '../lib/attachmentBindings'
import type { PalaceRecord, CardRecord } from '../lib/types'
import type { SceneDefinition } from '../lib/sceneRegistry'
import type { OfflinePalace, OfflineAsset, OfflineAnchor } from './types'
import { contentFingerprint } from './fingerprint'
import { snapshotSemanticReview } from './semanticSnapshot'
import { validateProgress, type ProgressEntry } from './progress'
import { validatePlan } from '../lib/palaceValidation'
import { validateOfflinePalace } from './serialize'

/** Pure packaging boundary used by the app and build-time examples. No database, network or provider configuration. */
export async function assembleOfflinePalace(input: {
  palace: PalaceRecord
  cards: CardRecord[]
  scene: SceneDefinition
  assets: OfflineAsset[]
  anchors: OfflineAnchor[]
  sceneTargetSpan?: number
  sceneAssetId?: string
  licenses?: string[]
  /** Build-time authored sample preview only; never used by the normal export UI. */
  previewOnly?: boolean
  /** In-memory authoring preview: source/capacity validation remains strict; review flags stay false. */
  draftPreview?: boolean
}): Promise<OfflinePalace> {
  const { palace, cards, scene, assets, anchors, sceneTargetSpan, sceneAssetId, licenses = [] } = input
  const plan = palace.mnemonicPlan
  if (input.previewOnly && plan?.generation.mode !== 'authored-demo') throw new Error('只有明确标为人工策划示例的材料可生成未确认预览')
  if (plan) {
    const issues = validatePlan(plan, scene, !input.previewOnly && !input.draftPreview)
    if (issues.length) throw new Error('材料规划未通过导出检查：' + issues[0].message)
    const exported = cards.flatMap(c => c.mnemonic?.unitIds ?? [])
    const expected = new Set(plan.units.map(u => u.id))
    if (exported.length !== expected.size || new Set(exported).size !== exported.length || exported.some(id => !expected.has(id))) throw new Error('导出卡片没有完整覆盖原文规划，请恢复缺失卡片或重新保存材料规划。未丢弃任何原文单元。')
  }
  if (plan?.sceneVersion && plan.sceneVersion !== scene.version) throw new Error('此宫殿使用较早的场景版本，请先重新检查并保存锚点规划，再导出。')
  for (const card of cards) {
    if (!card.mnemonic || !plan) continue
    if (card.mnemonic.cues.length !== card.mnemonic.unitIds.length || new Set(card.mnemonic.cues.map(c => c.unitId)).size !== card.mnemonic.unitIds.length || card.mnemonic.cues.some(c => !card.mnemonic!.unitIds.includes(c.unitId))) throw new Error('卡片线索数量与材料单元不匹配：' + card.locusId)
    const expected = card.mnemonic.unitIds.map(id => plan.units.find(u => u.id === id)?.facts ?? '').join('\n\n')
    if (card.answer !== expected) throw new Error('卡片答案与原文规划不一致：' + card.locusId + '。请先在材料规划中确认修改；不能用旧版原文覆盖你的卡片修改。')
    for (const id of card.mnemonic.unitIds) { const original = plan.cues.find(c => c.unitId === id), copy = card.mnemonic.cues.find(c => c.unitId === id); if (!original || !copy || original.anchorId !== card.mnemonic.anchorId || ['volumeId', 'object', 'action', 'imaginedAction', 'renderedDescription', 'spatialRelation', 'relationId', 'rationale'].some(key => original[key as keyof typeof original] !== copy[key as keyof typeof copy]) || original.visual.shape !== copy.visual.shape || original.visual.color !== copy.visual.color || original.visual.motion !== copy.visual.motion || JSON.stringify(snapshotSemanticReview(original.semanticReview)) !== JSON.stringify(snapshotSemanticReview(copy.semanticReview))) throw new Error('卡片联想与原文规划不一致：' + id + '。请重新保存材料规划后导出。') }
  }
  const fingerprint = await contentFingerprint(JSON.stringify(cards.map(c => ({
    locusId: c.locusId, prompt: c.prompt, answer: c.answer, note: c.note,
    imageIds: c.imageIds, attachmentBindings: c.attachmentBindings, modelId: c.modelId, modelScale: c.modelScale, mnemonic: c.mnemonic,
  }))) + JSON.stringify(plan?.source ?? '') + JSON.stringify({ scene: scene.id, sceneVersion: scene.version, sceneTargetSpan, anchors, assets: assets.map(a => ({ id: a.id, base64: a.base64 })) }))
  const initialProgress: Record<string, ProgressEntry> = Object.create(null)
  for (const card of cards) {
    for (const [id, entry] of Object.entries(card.unitProgress ?? {})) initialProgress[id] = { rating: entry.rating, reviews: entry.reviews, updatedAt: entry.updatedAt }
    const legacyId = `${palace.id}:${card.locusId}`
    if (!card.mnemonic && !initialProgress[legacyId] && card.confidence !== undefined && (card.reviewCount ?? 0) > 0 && card.lastReviewedAt && Number.isFinite(Date.parse(card.lastReviewedAt))) initialProgress[legacyId] = { rating: card.confidence, reviews: card.reviewCount!, updatedAt: card.lastReviewedAt }
  }
  validateProgress({ version: 1, palaceId: palace.id, contentFingerprint: fingerprint, entries: initialProgress }, palace.id, new Set(cards.flatMap(c => c.mnemonic?.unitIds ?? [`${palace.id}:${c.locusId}`])), fingerprint)
  const output: OfflinePalace = {
    version: 1,
    initialProgress,
    draftPreview: input.draftPreview || undefined,
    contentFingerprint: fingerprint,
    unassignedAttachmentCount: palace.unassignedAttachments?.length || undefined,
    id: palace.id,
    title: palace.title,
    exportedAt: new Date().toISOString(),
    sceneId: scene.id,
    sceneVersion: scene.version,
    walkingRoute: plan ? scene.route.walking : undefined,
    sceneTitle: plan ? scene.title : scene.title + ' · 旧版 60 点路线',
    sceneAssetId,
    sceneTargetSpan,
    anchors,
    assets,
    cards: cards.map(card => {
      const anchorId = card.mnemonic?.anchorId ?? (plan ? scene.anchors.find(a => a.locusId === card.locusId)?.id : 'legacy-' + card.locusId)
      const anchor = anchors.find(a => a.id === anchorId)
      if (!anchor) throw new Error('材料的锚点不在所选场景内：' + card.locusId)
      const units = card.mnemonic?.unitIds.map(id => {
        const unit = plan?.units.find(u => u.id === id)
        if (!unit) throw new Error('材料单元丢失：' + id)
        return { id, question: unit.question, facts: unit.facts }
      })
      const cues = card.mnemonic?.unitIds.map(id => {
        const cue = card.mnemonic!.cues.find(q => q.unitId === id)
        if (!cue) throw new Error('联想道具缺失：' + id)
        return { imaginedAction: cue.imaginedAction, renderedDescription: cue.renderedDescription, semanticReview: snapshotSemanticReview(cue.semanticReview), relationId: cue.relationId, unitId: cue.unitId, object: cue.object, action: cue.action, relation: cue.spatialRelation, rationale: cue.rationale, shape: cue.visual.shape, color: cue.visual.color, motion: cue.visual.motion }
      })
      return {
        id: `${palace.id}:${card.locusId}`,
        anchorId: anchor.id,
        unitIds: card.mnemonic?.unitIds ?? [`${palace.id}:${card.locusId}`],
        units,
        prompt: card.prompt,
        answer: card.answer,
        cue: card.note ?? '',
        action: '',
        imageIds: card.imageIds,
        attachmentBindings: parseAttachmentBindings(card.attachmentBindings, [...card.imageIds, ...(card.modelId ? [card.modelId] : [])], card.mnemonic?.unitIds, plan ? sourceFingerprint(plan.source) : card.mnemonic?.sourceFingerprint),
        modelId: card.modelId,
        modelScale: card.modelScale,
        provenance: plan && card.mnemonic
          ? (plan.generation.mode === 'authored-demo' ? '人工策划示例（非实时模型生成） · ' : '') + plan.source.title + ' · ' + card.mnemonic.unitIds.join(', ')
          : '用户卡片原文',
        cues,
      }
    }),
    // Explicit portable schema: provider settings and browser credentials cannot enter this boundary.
    plan: plan ? {
      schemaVersion: plan.schemaVersion, sceneVersion: plan.sceneVersion, ordering: plan.ordering,
      source: { title: plan.source.title, text: plan.source.text, references: plan.source.references?.map(r => ({ title: r.title, url: r.url })) }, sceneId: plan.sceneId,
      units: plan.units.map(u => ({ id: u.id, title: u.title, question: u.question, facts: u.facts, protectedTokens: u.protectedTokens, reviewed: u.reviewed, spans: u.spans.map(s => ({ start: s.start, end: s.end, quote: s.quote })) })),
      cues: plan.cues.map(c => ({ unitId: c.unitId, anchorId: c.anchorId, volumeId: c.volumeId, object: c.object, visual: { shape: c.visual.shape, color: c.visual.color, motion: c.visual.motion }, action: c.action, imaginedAction: c.imaginedAction, renderedDescription: c.renderedDescription, semanticReview: snapshotSemanticReview(c.semanticReview), spatialRelation: c.spatialRelation, relationId: c.relationId, rationale: c.rationale, reviewed: c.reviewed })), createdAt: plan.createdAt,
      generation: { mode: plan.generation.mode, model: plan.generation.model },
    } : undefined,
    attribution: [
      ...licenses,
      'Locus Memory Palace · GPL-3.0 · https://www.gnu.org/licenses/gpl-3.0.html',
      'Three.js · MIT · https://github.com/mrdoob/three.js/blob/dev/LICENSE',
      ...(scene.attribution ? [`${scene.attribution.title} · ${scene.attribution.creator} · ${scene.attribution.license} · ${scene.attribution.url}\n许可：https://creativecommons.org/licenses/by/4.0/\n改动：场景等比缩放、居中和地面归一化；新增记忆锚点、助记物及诊断/路线视图。原始模型作者为 ${scene.attribution.creator}`] : ['阅读厅：Locus 程序化原创场景']),
      `导出时间：${new Date().toISOString()}`,
      ...scene.limitations,
      ...(plan?.source.references?.map(r => `材料参考：${r.title} · ${r.url}`) ?? []),
    ],
  }
  validateOfflinePalace(output)
  return output
}
