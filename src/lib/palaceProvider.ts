import { CUE_SHAPES, type MeaningUnit, type MnemonicCue, type PalacePlan, type ProviderSettings, type SourceSpan } from './palaceTypes'
import { EXECUTABLE_CUE_RELATIONS, type CueRelationId, type SceneDefinition } from './sceneRegistry'
import { buildModelInput, estimateTokens, INDEXED_MODEL_INSTRUCTIONS, MODEL_BUDGET, normalizeModelProposal } from './palaceModelProposal'
import { initializeSemanticCue, MAX_SEMANTIC_CHECKS, sourceSemanticInventory } from './palaceSemanticReview'
import { protectedTokens } from './palaceSegmentation'
import { validatePlan } from './palaceValidation'

const MAX_RESPONSE_CHARS = 2_000_000
const record = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('JSON 字段应为对象。'); return v as Record<string, unknown> }
const str = (v: unknown, label: string, max = 200_000): string => { if (typeof v !== 'string' || v.length > max) throw new Error(`${label} 必须是文本且不能超过 ${max} 字符。`); return v }
const list = (v: unknown, label: string, max = 10_000): unknown[] => { if (!Array.isArray(v) || v.length > max) throw new Error(`${label} 必须是数组且不超过 ${max} 项。`); return v }
const integer = (v: unknown): number => { if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new Error('原文偏移必须为安全整数。'); return v }

/** Explicit allowlist parser: unknown fields (including credentials/HTML/commands) are discarded. */
export function parsePlanProposal(value: unknown, source: { text: string; title: string }, scene: SceneDefinition, model?: string, options: { allowIncompleteDraft?: boolean; preserveOrdering?: boolean } = {}): PalacePlan {
  let raw = record(value)
  if (raw.format === 'locus-semantic-proposal-v1') raw = record(normalizeModelProposal(raw, source, scene))
  if (raw.schemaVersion !== 1) throw new Error('只接受 schemaVersion: 1 的方案。')
  const rawSource = record(raw.source)
  if (rawSource.text !== source.text) throw new Error('方案原文与当前材料不同，已拒绝导入。')
  if (raw.sceneVersion !== undefined && raw.sceneVersion !== scene.version) throw new Error('方案场景版本已过期，请重新生成并核对。')
  if (raw.sceneId !== scene.id) throw new Error('方案场景不匹配，已拒绝导入。')
  const units: MeaningUnit[] = list(raw.units, 'units', 240).map(item => {
    const u = record(item)
    const spans: SourceSpan[] = list(u.spans, 'spans').map(item => { const s = record(item); return { start: integer(s.start), end: integer(s.end), quote: str(s.quote, 'quote') } })
    const facts = str(u.facts, 'facts')
    return { id: str(u.id, 'id', 120), spans, facts, title: str(u.title, 'title', 240), question: str(u.question, 'question', 2000), protectedTokens: protectedTokens(facts), reviewed: false }
  })
  let semanticCheckCount = 0
  for (const unit of units) { semanticCheckCount += sourceSemanticInventory(unit).length; if (semanticCheckCount > MAX_SEMANTIC_CHECKS) throw new Error('方案超过 240 条原文审核子句，请分章处理。不会截断或自动批准剩余内容。') }
  const seenCueUnits = new Set<string>()
  const cues: MnemonicCue[] = list(raw.cues, 'cues', 240).map(item => {
    const c = record(item), visual = record(c.visual)
    const cueUnitId = str(c.unitId, 'unitId', 120)
    if (seenCueUnits.has(cueUnitId)) throw new Error('一个单元只能对应一个主联想。')
    seenCueUnits.add(cueUnitId)
    const shape = str(visual.shape, 'shape'), motion = str(visual.motion, 'motion')
    if (!(CUE_SHAPES as readonly string[]).includes(shape) || !['pulse', 'spin', 'bounce', 'none'].includes(motion)) throw new Error('不支持的视觉形状或动作。')
    const relationId = typeof c.relationId === 'string' ? c.relationId : Object.entries(EXECUTABLE_CUE_RELATIONS).find(([, label]) => label === c.spatialRelation)?.[0]
    if (!relationId || !(relationId in EXECUTABLE_CUE_RELATIONS)) throw new Error('空间关系 ID 无效。')
    const imaginedAction = str(c.imaginedAction ?? c.action, 'imaginedAction', 2400)
    const cue: MnemonicCue = { relationId: relationId as CueRelationId, unitId: str(c.unitId, 'unitId', 120), anchorId: str(c.anchorId, 'anchorId', 120), volumeId: str(c.volumeId, 'volumeId', 160), object: str(c.object, 'object', 1200), action: imaginedAction, imaginedAction, spatialRelation: str(c.spatialRelation, 'spatialRelation', 120), rationale: str(c.rationale, 'rationale', 4000), visual: { shape: shape as MnemonicCue['visual']['shape'], color: str(visual.color, 'color', 7), motion: motion as MnemonicCue['visual']['motion'] }, reviewed: false }
    const unit = units.find(u => u.id === cue.unitId), anchor = scene.anchors.find(a => a.id === cue.anchorId)
    if (!unit || !anchor) return cue
    const semantic = c.semanticReview === undefined ? undefined : record(c.semanticReview)
    const rawMappings = c.sourceMappings ?? semantic?.sourceChecks
    const mappings = rawMappings === undefined ? undefined : list(rawMappings, 'sourceMappings', 240).map(value => { const mapping = record(value); return { quote: str(mapping.quote, 'sourceMapping.quote'), explanation: str(mapping.explanation, 'sourceMapping.explanation', 4000) } })
    if (mappings?.some(mapping => !unit.spans.some(span => span.quote.includes(mapping.quote)))) throw new Error('语义映射中的原文引用并非该单元的精确证据。')
    const notEncoded = c.notEncoded ?? semantic?.notEncoded
    return initializeSemanticCue(unit, cue, anchor, { mappings, notEncoded: notEncoded === undefined ? undefined : str(notEncoded, 'notEncoded', 4000) })
  })
  const plan: PalacePlan = { schemaVersion: 1, source: { ...source }, sceneId: scene.id, sceneVersion: scene.version, ordering: options.preserveOrdering && raw.ordering === 'semantic' ? 'semantic' : 'source', generation: { mode: model ? 'model-assisted' : 'structured-import', ...(model?.trim() ? { model: model.trim() } : {}) }, units, cues, createdAt: new Date().toISOString() }
  const editableDraftIssues = new Set(['capacity', 'unassigned', 'order', 'source-order', 'unit-label', 'cue-empty'])
  const issues = validatePlan(plan, scene).filter(issue => !(options.allowIncompleteDraft && editableDraftIssues.has(issue.code)))
  if (issues.length) throw new Error(`方案校验未通过：${issues.slice(0, 5).map(i => i.message).join('；')}`)
  return plan
}

export function parsePlanJson(json: string, source: { text: string; title: string }, scene: SceneDefinition): PalacePlan {
  if (json.length > MAX_RESPONSE_CHARS) throw new Error('JSON 超过 2 MB 文本限制。')
  let value: unknown
  try { value = JSON.parse(json) } catch { throw new Error('JSON 格式不正确，请粘贴完整 JSON 对象（不要包含 Markdown 代码围栏）。') }
  const outer = record(value)
  return parsePlanProposal(outer.plan ?? outer, source, scene)
}

export function validateEndpoint(settings: ProviderSettings, origin: string): URL {
  if (!settings.endpoint.trim() || !settings.model.trim()) throw new Error('请填写已经配置好的接口地址和真实模型 ID；没有接口时可用离线规则草案。')
  const url = new URL(settings.endpoint, origin)
  if (url.username || url.password || url.search || url.hash) throw new Error('接口地址不能包含凭据、查询参数或片段。')
  if (url.protocol !== 'https:' && !(url.origin === origin && (url.protocol === 'http:' || url.protocol === 'https:'))) throw new Error('接口须为 HTTPS 或当前站点的同源地址。')
  return url
}

export const PROVIDER_INSTRUCTIONS = INDEXED_MODEL_INSTRUCTIONS

export async function requestPlan(settings: ProviderSettings, source: { text: string; title: string }, scene: SceneDefinition, options: { signal?: AbortSignal; transport?: typeof fetch; origin?: string } = {}): Promise<PalacePlan> {
  if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
  const url = validateEndpoint(settings, options.origin ?? globalThis.location?.origin ?? 'https://localhost')
  const data = buildModelInput(source, scene)
  const response = await (options.transport ?? fetch)(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', redirect: 'error', signal: options.signal, body: JSON.stringify({ operation: 'locus-semantic-proposal-v1', model: settings.model.trim(), instructions: PROVIDER_INSTRUCTIONS, data }) })
  if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
  if (!response.ok) throw new Error(`接口请求失败（HTTP ${response.status}）。原文和草案没有被覆盖。`)
  const text = await response.text()
  if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
  if (text.length > MAX_RESPONSE_CHARS || estimateTokens(text) > MODEL_BUDGET.maxOutputTokens) throw new Error('接口返回超过响应大小或输出 token 估算预算。请要求模型简化联想描述后重试。')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('接口没有返回合法 JSON。') }
  const outer = record(value)
  return parsePlanProposal(outer.plan ?? outer, source, scene, settings.model)
}
