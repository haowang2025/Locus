import { CUE_SHAPES, type PalacePlan, type PlanIssue } from './palaceTypes'
import { describeRenderedCue, semanticChecksComplete, sourceSemanticInventory } from './palaceSemanticReview'
import { EXECUTABLE_CUE_RELATIONS, type SceneDefinition } from './sceneRegistry'

export function validatePlan(plan: PalacePlan, scene: SceneDefinition, requireReview = false): PlanIssue[] {
  const issues: PlanIssue[] = []
  const issueKeys = new Set<string>()
  const add = (code: string, message: string, unitId?: string) => { const key = `${code}|${unitId ?? ''}|${message}`; if (!issueKeys.has(key)) { issueKeys.add(key); issues.push({ code, message, unitId }) } }
  if (plan.schemaVersion !== 1) add('version', '方案版本不受支持。')
  if (plan.sceneVersion !== undefined && plan.sceneVersion !== scene.version) add('scene-version', '场景版本已变化，请重新核对地标后保存。')
  if (plan.sceneId !== scene.id) add('scene', '方案场景与当前场景不一致。')
  if (!plan.source.text.trim()) add('source', '原文不能为空。')
  if (!plan.units.length) add('empty', '尚未生成含义单元。')
  const covered = new Uint8Array(plan.source.text.length)
  const ids = new Set<string>()
  let previousSourceEnd = -1
  for (const unit of plan.units) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(unit.id)) add('unit-id', '单元 ID 必须为非空字母数字标识，不能包含空白。', unit.id)
    if (ids.has(unit.id)) add('duplicate-unit', '含义单元 ID 重复。', unit.id)
    ids.add(unit.id)
    if (!unit.spans.length) add('no-evidence', '含义单元缺少原文证据。', unit.id)
    for (const span of unit.spans) {
      if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end > plan.source.text.length || span.start >= span.end || span.quote !== plan.source.text.slice(span.start, span.end)) { add('span', '原文范围或引用不匹配。', unit.id); continue }
      const cutsPair = (offset: number) => /[\uD800-\uDBFF]/.test(plan.source.text[offset - 1] ?? '') && /[\uDC00-\uDFFF]/.test(plan.source.text[offset] ?? '')
      if (cutsPair(span.start) || cutsPair(span.end)) add('unicode-boundary', '原文范围不能拆开一个 Unicode 字符。', unit.id)
      if (plan.ordering !== 'semantic' && span.start < previousSourceEnd) add('source-order', '含义单元必须按原文先后排列。', unit.id)
      previousSourceEnd = span.end
      for (let i = span.start; i < span.end; i++) {
        if (covered[i] && /\S/.test(plan.source.text[i])) add('overlap', '原文证据被重复分配，请检查单元。', unit.id)
        covered[i] = 1
      }
    }
    if (!unit.facts.trim()) add('empty-fact', '该单元没有非空白原文事实，请删除空单元或重新分配证据。', unit.id)
    if (unit.facts !== unit.spans.map(s => s.quote).join('\n')) add('facts', '事实内容必须与原文引用完全一致。', unit.id)
    if (!unit.title.trim() || !unit.question.trim()) add('unit-label', '单元标题与回忆问题不能为空。', unit.id)
    if (requireReview && !unit.reviewed) add('review-unit', '请核对该单元的原文与保护词。', unit.id)
  }
  const missing = [...plan.source.text].length && Array.from(covered).filter((v, i) => !v && /\S/.test(plan.source.text[i])).length
  if (missing) {
    const first = Array.from(covered).findIndex((v, i) => !v && /\S/.test(plan.source.text[i]))
    add('coverage', `还有 ${missing} 个非空白原文字符未覆盖。首个缺口在原文偏移 ${first} 附近：「${plan.source.text.slice(first, first + 32)}」。请补充对应 segmentId / 精确引用，或并入相邻单元；不会静默丢弃。`)
  }
  const assigned = new Set<string>(), counts = new Map<string, number>()
  for (const cue of plan.cues) {
    if (!ids.has(cue.unitId)) add('unknown-unit', '联想引用了不存在的单元。', cue.unitId)
    if (assigned.has(cue.unitId)) add('duplicate-cue', '一个单元只能对应一个主联想。', cue.unitId)
    assigned.add(cue.unitId)
    const anchor = scene.anchors.find(a => a.id === cue.anchorId)
    if (!anchor) { add('anchor', '请选择当前场景内的有效地标。', cue.unitId); continue }
    counts.set(anchor.id, (counts.get(anchor.id) ?? 0) + 1)
    if (cue.volumeId !== anchor.cueVolume.id) add('volume', '联想不在该地标允许的空间内。', cue.unitId)
    if (!cue.relationId || !anchor.cueVolume.allowedRelationIds.includes(cue.relationId) || EXECUTABLE_CUE_RELATIONS[cue.relationId] !== cue.spatialRelation) add('relation-id', '请选择可执行且与标签一致的空间关系。', cue.unitId)
    if (!anchor.cueVolume.allowedRelations.includes(cue.spatialRelation)) add('relation', '该空间关系不适用于所选地标。', cue.unitId)
    if (![cue.object, cue.action, cue.rationale].every(v => typeof v === 'string' && v.trim())) add('cue-empty', '联想物体、动作与映射理由不能为空。', cue.unitId)
    if (!/^#[0-9a-fA-F]{6}$/.test(cue.visual.color) || !CUE_SHAPES.includes(cue.visual.shape) || !['pulse', 'spin', 'bounce', 'none'].includes(cue.visual.motion)) add('visual', '联想视觉参数无效。', cue.unitId)
    const unit = plan.units.find(u => u.id === cue.unitId)
    if (cue.semanticReview && unit) {
      const expected = sourceSemanticInventory(unit), checks = cue.semanticReview.sourceChecks
      if (checks.length !== expected.length || expected.some((item, index) => checks[index]?.id !== item.id || checks[index]?.quote !== item.quote || JSON.stringify(checks[index]?.spans) !== JSON.stringify(item.spans))) add('semantic-inventory', '语义审核清单与完整原文子句不一致。', cue.unitId)
      if (cue.renderedDescription !== describeRenderedCue(cue, anchor) || cue.imaginedAction !== cue.action) add('semantic-rendering', '实际渲染说明或想象动作字段已过期，请重新核对。', cue.unitId)
    }
    if (requireReview && !semanticChecksComplete(cue.semanticReview)) add('semantic-review', '请逐条核对原文映射，并确认实际渲染与未编码细节。', cue.unitId)
    if (requireReview && !cue.reviewed) add('review-cue', '请核对该单元的创意联想。', cue.unitId)
  }
  for (const unit of plan.units) if (!assigned.has(unit.id)) add('unassigned', '该单元尚未分配地标。请合并相邻单元，或改放到仍有容量的地标。', unit.id)
  if (plan.ordering !== 'semantic') {
    let previous = -Infinity
    for (const unit of plan.units) {
      const cue = plan.cues.find(c => c.unitId === unit.id)
      const anchor = scene.anchors.find(a => a.id === cue?.anchorId)
      if (!anchor) continue
      if (anchor.routeOrder < previous) add('order', '地标行走顺序与原文顺序不一致。请改放到前一片段之后的地标，或合并真正相关的相邻片段。', unit.id)
      previous = anchor.routeOrder
    }
  }
  for (const anchor of scene.anchors) if ((counts.get(anchor.id) ?? 0) > Math.min(anchor.capacity, anchor.cueVolume.maxObjects)) add('capacity', `${anchor.label} 容量超限（最多 ${Math.min(anchor.capacity, anchor.cueVolume.maxObjects)} 个单元）。`, plan.cues.filter(cue => cue.anchorId === anchor.id).at(-1)?.unitId)
  return issues
}

export function sourceCoverage(plan: PalacePlan): { covered: number; total: number; percent: number } {
  const covered = new Set<number>()
  for (const unit of plan.units) for (const span of unit.spans) if (span.quote === plan.source.text.slice(span.start, span.end)) for (let i = span.start; i < span.end; i++) if (/\S/.test(plan.source.text[i])) covered.add(i)
  const total = plan.source.text.replace(/\s/g, '').length
  return { covered: covered.size, total, percent: total ? Math.round(covered.size / total * 100) : 0 }
}
