import type { CueSemanticReview, MeaningUnit, MnemonicCue, SemanticSourceCheck, SourceSpan } from './palaceTypes'
import type { SceneAnchor } from './sceneRegistry'
import { CUE_SHAPE_LABELS } from './cueLabels'
import { segmentSource } from './palaceSegmentation'

export const MAX_SEMANTIC_CHECKS = 240
export const DEFAULT_NOT_ENCODED = '精确数值、单位、公式文字、否定范围、例外条件和步骤关系不会自动写在道具上；需要对照原文口头准确补全。道具数量、颜色和运动不能直接当作原文事实。'
const MOTION: Record<MnemonicCue['visual']['motion'], string> = { none: '不额外自转、缩放或起伏', pulse: '整体脉冲缩放', spin: '整体旋转', bounce: '整体上下起伏' }

/** Suggested labels are deliberately incomplete; exact full source clauses remain visible. */
export function sourceSemanticInventory(unit: MeaningUnit): Omit<SemanticSourceCheck, 'explanation' | 'checked'>[] {
  const clauses: SourceSpan[] = []
  for (const span of unit.spans) for (const part of segmentSource(span.quote, MAX_SEMANTIC_CHECKS)) for (const s of part.spans) {
    if (clauses.length >= MAX_SEMANTIC_CHECKS) throw new Error('单个含义单元超过 240 条原文审核子句。请分成独立章节再审核；原文和未完成清单不会被截断。')
    clauses.push({ start: span.start + s.start, end: span.start + s.end, quote: s.quote })
  }
  return clauses.map((span, index) => {
    const kinds: string[] = [], text = span.quote
    if (/不|无|未|禁止|\bnot\b|\bnever\b/i.test(text)) kinds.push('否定 / 禁止范围')
    if (/\d|[<>≤≥]|至少|至多|超过|少于|高于|低于/.test(text)) kinds.push('数字 / 单位 / 边界')
    if (/如果|除非|仅当|只有|否则|例外|允许|许可|同意|审批|\bif\b|\bunless\b|\bexcept\b/i.test(text)) kinds.push('条件 / 例外 / 授权')
    if (/且|并且|同时|双方|二者|或者|\band\b|\bor\b/i.test(text)) kinds.push('关系 / 并列要求')
    if (/[=≠]|公式|方程/.test(text)) kinds.push('公式 / 等式')
    if (/第.+步|首先|然后|最后|之前|之后|先|再|^\s*\d+[.)、]/.test(text)) kinds.push('顺序 / 因果')
    if (!kinds.length) kinds.push('完整事实 / 关系')
    return { id: `${unit.id}:source-${index + 1}`, spans: [span], quote: span.quote, kinds }
  })
}

export function describeRenderedCue(cue: MnemonicCue, anchor: SceneAnchor): string {
  const effectiveMotion = cue.relationId === 'rise' ? 'bounce' : cue.visual.motion
  const orbit = cue.relationId === 'orbit' ? '同时沿各自槽位的小圆轨道移动；' : ''
  const override = cue.relationId === 'rise' ? 'rise 操作实际执行周期上下起伏，并优先于所选基础动画；' : ''
  return `${anchor.label}的指定线索空间：${CUE_SHAPE_LABELS[cue.visual.shape] ?? '未知形状'}。动画开启时，${orbit}${MOTION[effectiveMotion] ?? '未知动画'}；${override}空间操作为「${cue.spatialRelation}」。减少动画模式会暂停这些运动。引擎不会把自由叙事转换成额外动作，也不会自动在物体上书写原文。`
}
export function semanticChecksComplete(review: CueSemanticReview | undefined): boolean {
  return !!review && review.sourceChecks.length > 0 && review.sourceChecks.every(c => c.checked && c.explanation.trim()) && !!review.notEncoded.trim() && review.renderedConfirmed && review.limitationsConfirmed
}

export function initializeSemanticCue(unit: MeaningUnit, cue: MnemonicCue, anchor: SceneAnchor, options: { mappings?: Array<{ quote: string; explanation: string }>; notEncoded?: string; preserveChecks?: boolean } = {}): MnemonicCue {
  const previous = cue.semanticReview
  const sourceChecks = sourceSemanticInventory(unit).map(item => {
    const old = previous?.sourceChecks.find(c => c.quote === item.quote && JSON.stringify(c.spans) === JSON.stringify(item.spans))
    const mapping = options.mappings?.find(m => m.quote.trim() === item.quote.trim())?.explanation
    return { ...item, explanation: mapping ?? old?.explanation ?? '此处尚未建立专门的视觉编码。请把这段原文按原意口头复述，并核对条件、否定、数值与关系。', checked: options.preserveChecks === true && old?.checked === true }
  })
  const renderedDescription = describeRenderedCue(cue, anchor)
  const semanticReview: CueSemanticReview = { sourceChecks, notEncoded: options.notEncoded ?? previous?.notEncoded ?? DEFAULT_NOT_ENCODED, renderedConfirmed: options.preserveChecks === true && cue.renderedDescription === renderedDescription && previous?.renderedConfirmed === true, limitationsConfirmed: options.preserveChecks === true && previous?.limitationsConfirmed === true }
  return { ...cue, imaginedAction: cue.imaginedAction ?? cue.action, action: cue.imaginedAction ?? cue.action, renderedDescription, semanticReview, reviewed: options.preserveChecks === true && cue.reviewed && semanticChecksComplete(semanticReview) }
}

export function invalidateSemanticCue(cue: MnemonicCue): MnemonicCue {
  return { ...cue, reviewed: false, semanticReview: cue.semanticReview ? { ...cue.semanticReview, sourceChecks: cue.semanticReview.sourceChecks.map(c => ({ ...c, checked: false })), renderedConfirmed: false, limitationsConfirmed: false } : undefined }
}

/** Call only after the user explicitly confirms this one visible unit. Never use on import. */
export function acknowledgeSemanticUnit(unit: MeaningUnit, cue: MnemonicCue, anchor: SceneAnchor): { unit: MeaningUnit; cue: MnemonicCue } {
  if (cue.unitId !== unit.id || cue.anchorId !== anchor.id || cue.volumeId !== anchor.cueVolume.id) throw new Error('单元或地标绑定已变化，请重新预览。')
  const review = cue.semanticReview, inventory = sourceSemanticInventory(unit)
  if (!review || !review.notEncoded.trim() || !review.sourceChecks.length || review.sourceChecks.some(check => !check.explanation.trim())) throw new Error('请先补全原文映射和未编码细节。')
  if (JSON.stringify(review.sourceChecks.map(({ id, spans, quote, kinds }) => ({ id, spans, quote, kinds }))) !== JSON.stringify(inventory) || cue.renderedDescription !== describeRenderedCue(cue, anchor)) throw new Error('原文或渲染说明已变化，请重新生成当前核对项。')
  return { unit: { ...unit, reviewed: true }, cue: { ...cue, reviewed: true, semanticReview: { ...review, sourceChecks: review.sourceChecks.map(check => ({ ...check, checked: true })), renderedConfirmed: true, limitationsConfirmed: true } } }
}
