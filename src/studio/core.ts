import { sourceFingerprint } from '../lib/palaceModelProposal'
import { parseAttachmentBindings } from '../lib/attachmentBindings'
import type { AttachmentBinding } from '../lib/types'
import { parseStudioChapters, type StudioChapters } from './chapters'
import { materializeChapter } from '../lib/palaceChapters'
import { getSceneDefinition, isDust2Scene, anchorCalloutContext, type SceneDefinition } from '../lib/sceneRegistry'
import type { PalacePlan } from '../lib/palaceTypes'
import type { CardRecord, PalaceRecord } from '../lib/types'
import { planToCards } from '../lib/palaceStorage'
import { sanitizeBackupPlan } from '../lib/palaceBackupValidation'
import { validatePlan } from '../lib/palaceValidation'
import { assembleOfflinePalace } from '../offline/assemble'
import { prepareOfflineAsset, checkAssetBudgets, embeddedAssetBlob } from '../offline/assets'
import type { OfflinePalace, OfflineAsset, Vec3 } from '../offline/types'
import { contentFingerprint } from '../offline/fingerprint'
import { validateOfflinePalace } from '../offline/serialize'
import { newId } from '../lib/id'

export interface StudioMedia { bindings?: AttachmentBinding[]; id: string; anchorId: string; assetId: string; kind: 'image' | 'model'; fileName: string; scale: number; reviewed: boolean }
export interface StudioProject {
  chapters?: StudioChapters;
  format: 'locus-studio-v1'; id: string; palaceTitle?: string; title: string; text: string; sceneId: string;
  plan: PalacePlan | null; media: StudioMedia[]; assets: OfflineAsset[]; savedAt: string;
}
export function emptyProject(sceneId = 'reading-hall'): StudioProject { return { format: 'locus-studio-v1', id: newId('studio'), title: '', text: '', sceneId, plan: null, media: [], assets: [], savedAt: new Date().toISOString() } }
export function studioMediaIssues(project: StudioProject, scene: SceneDefinition): string[] {
  const expectedFingerprint = project.plan ? sourceFingerprint(project.plan.source) : undefined
  const issues: string[] = [], ids = new Set(project.assets.map(a => a.id)), usedAnchors = new Set(project.plan?.cues.map(c => c.anchorId) ?? [])
  for (const media of project.media) {
    if (!scene.anchors.some(a => a.id === media.anchorId) || !usedAnchors.has(media.anchorId)) issues.push(`附件「${media.fileName}」所在锚点没有材料，请重新绑定或移除`)
    try { parseAttachmentBindings(media.bindings, [media.assetId], project.plan?.cues.filter(c => c.anchorId === media.anchorId).map(c => c.unitId), expectedFingerprint) } catch (error) { issues.push(String(error)) }
    if (!ids.has(media.assetId)) issues.push(`附件「${media.fileName}」的数据缺失`)
    if (!Number.isFinite(media.scale) || media.scale <= 0 || media.scale > 10) issues.push('模型缩放须在 0–10 之间')
  }
  for (const anchor of scene.anchors) { const media = project.media.filter(m => m.anchorId === anchor.id); if (media.filter(m => m.kind === 'image').length > 6) issues.push(`${anchor.label} 超过 6 张图片`); if (media.filter(m => m.kind === 'model').length > 1) issues.push(`${anchor.label} 只能绑定一个模型`) }
  return issues
}
export async function compileStudioPalace(project: StudioProject, builtinAssets: OfflineAsset[], licenses: string[], draftPreview = false) {
  const plan = project.plan
  if (!plan) throw new Error('请先生成或导入材料规划')
  if (plan.source.text !== project.text || plan.source.title !== project.title || plan.sceneId !== project.sceneId) throw new Error('规划对应的材料或场景已变化，请重新生成')
  const scene = getSceneDefinition(project.sceneId), issues = validatePlan(plan, scene, !draftPreview)
  if (issues.length) throw new Error(issues[0].message)
  const mediaIssues = studioMediaIssues(project, scene)
  if (mediaIssues.length) throw new Error(mediaIssues[0])
  if (!draftPreview && project.media.some(m => !m.reviewed)) throw new Error('请逐项确认图片和模型附件')
  // Structural-only preview projection never fabricates user review flags.
  const cards: CardRecord[] = planToCards(project.id, plan, scene, { requireReview: !draftPreview })
  for (const card of cards) {
    const media = project.media.filter(m => m.anchorId === card.mnemonic!.anchorId)
    card.imageIds = media.filter(m => m.kind === 'image').map(m => m.assetId)
    card.attachmentBindings = media.flatMap(m => m.bindings ?? [])
    const model = media.find(m => m.kind === 'model'); card.modelId = model?.assetId; card.modelScale = model?.scale
  }
  const used = new Set(project.media.map(m => m.assetId)), assets = project.assets.filter(a => used.has(a.id))
  const sceneAssetId = isDust2Scene(scene.id) ? 'scene:dust2' : undefined
  if (sceneAssetId) { const builtin = builtinAssets.find(a => a.id === sceneAssetId); if (!builtin) throw new Error('工作台缺少内嵌 Dust2 文件'); assets.push(builtin) }
  checkAssetBudgets(assets)
  const palace: PalaceRecord = { id: project.id, title: project.palaceTitle?.trim() || project.title || '我的记忆宫殿', templateId: 'dust2_blockout_v2', createdAt: plan.createdAt, updatedAt: new Date().toISOString(), mnemonicPlan: plan }
  const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
  const output = await assembleOfflinePalace({ palace, cards, scene, assets, licenses, sceneAssetId, sceneTargetSpan: scene.worldTransform?.targetSpan, draftPreview,
    anchors: scene.anchors.map(a => ({ id: a.id, zone: a.zone, calloutAliases: a.calloutAliases, framingBounds: a.landmark.framingBounds, focusPoint: a.landmark.focusPoint ? vec(a.landmark.focusPoint) : undefined, label: a.label, context: anchorCalloutContext(a), position: vec(a.cueVolume.center), eye: vec(a.approach.eye), lookAt: vec(a.approach.lookAt), cueVolume: a.cueVolume })) })
  if (project.chapters) {
    const chapters = parseStudioChapters(project.chapters, project.title, project.text)
    if (!chapters.activeId) throw new Error('请先选择一个章节；完整材料不会作为单章静默导出')
    if (JSON.stringify(plan.source.references ?? []) !== JSON.stringify(chapters.collection.source.references ?? [])) throw new Error('章节出处与完整来源不一致')
    output.chapterOrigin = { sourceTitle: chapters.collection.source.title, ...materializeChapter(chapters.collection, chapters.activeId).origin }
    output.contentFingerprint = await contentFingerprint(output.contentFingerprint + JSON.stringify(output.chapterOrigin))
    validateOfflinePalace(output)
  }
  return output
}
export function serializeStudioBackup(project: StudioProject): string {
  if (project.chapters) parseStudioChapters(project.chapters, project.title, project.text)
  const backup = JSON.stringify({ format: 'locus-studio-v1', id: project.id, palaceTitle: project.palaceTitle, chapters: project.chapters, title: project.title, text: project.text, sceneId: project.sceneId, plan: project.plan, media: project.media, assets: project.assets, savedAt: new Date().toISOString() }, null, 2)
  if (new Blob([backup]).size > 120 * 1024 * 1024) throw new Error('工作台备份超过 120 MB。请先另存完整原文 TXT，再按章节拆分；当前内容没有被截断。')
  return backup
}
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('项目文件字段必须为对象'); return value as Record<string, unknown> }
const string = (value: unknown, max: number): string => { if (typeof value !== 'string' || value.length > max) throw new Error('项目文本字段无效或过长'); return value }
/** Fully validate into new memory before replacing the current project. No IndexedDB or filesystem writes. */
export async function parseStudioBackup(text: string): Promise<StudioProject> {
  if (text.length > 120 * 1024 * 1024) throw new Error('工作台备份超过 120 MB')
  const raw = object(JSON.parse(text)); if (raw.format !== 'locus-studio-v1') throw new Error('请选择 .locus-studio.json 工作台备份；单独规划 JSON 请在模型/规划导入区域使用')
  const sceneId = string(raw.sceneId, 120); const backupScene = getSceneDefinition(sceneId)
  const source = string(raw.text, raw.plan === null ? 120 * 1024 * 1024 : 200000), title = string(raw.title, raw.chapters !== undefined ? 500 : 240)
  const plan = raw.plan === null ? null : sanitizeBackupPlan(raw.plan, { allowIncompleteDraft: true })
  if (plan && (plan.source.text !== source || plan.source.title !== title || plan.sceneId !== sceneId)) throw new Error('备份原文与规划不一致')
  if (!Array.isArray(raw.media) || raw.media.length > backupScene.anchors.length * 7 || !Array.isArray(raw.assets) || raw.assets.length > backupScene.anchors.length * 7) throw new Error('备份附件列表无效或超过容量')
  const media: StudioMedia[] = raw.media.map(value => { const m = object(value); if (m.kind !== 'image' && m.kind !== 'model') throw new Error('附件类型无效'); if (typeof m.scale !== 'number' || !Number.isFinite(m.scale) || m.scale <= 0 || m.scale > 10) throw new Error('附件比例无效'); return { id: string(m.id, 160), anchorId: string(m.anchorId, 160), assetId: string(m.assetId, 160), fileName: string(m.fileName, 240), kind: m.kind, scale: m.scale, reviewed: m.reviewed === true, bindings: parseAttachmentBindings(m.bindings, [string(m.assetId,160)], plan?.cues.filter(c => c.anchorId === m.anchorId).map(c => c.unitId), plan ? sourceFingerprint(plan.source) : undefined) } })
  const assets: OfflineAsset[] = []
  for (const value of raw.assets) {
    const a = object(value), id = string(a.id, 160), ref = media.find(m => m.assetId === id)
    if (!ref || assets.some(v => v.id === id)) throw new Error('备份包含未知或重复附件')
    if (media.some(m => m.assetId === id && m.kind !== ref.kind)) throw new Error('同一附件不能同时作为图片与模型使用')
    const base64 = string(a.base64, 112 * 1024 * 1024), mime = string(a.mime, 100)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0 || typeof a.bytes !== 'number' || !Number.isSafeInteger(a.bytes) || a.bytes < 1) throw new Error('附件编码无效')
    const blob = embeddedAssetBlob({ id, mime, base64, bytes: a.bytes })
    assets.push(await prepareOfflineAsset(id, blob, ref.kind)); checkAssetBudgets(assets)
  }
  if (new Set(media.map(m => m.id)).size !== media.length) throw new Error('附件 ID 重复')
  const project: StudioProject = { format: 'locus-studio-v1', id: string(raw.id, 160), ...(raw.palaceTitle !== undefined ? { palaceTitle: string(raw.palaceTitle, 240) } : {}), title, text: source, sceneId, plan, media, assets, savedAt: new Date().toISOString() }
  if (raw.chapters !== undefined) { project.chapters = parseStudioChapters(raw.chapters, title, source); if (plan && JSON.stringify(plan.source.references ?? []) !== JSON.stringify(project.chapters.collection.source.references ?? [])) throw new Error('章节出处与完整来源不一致') }
  const scene = getSceneDefinition(sceneId)
  if (!project.id.trim() || media.some(m => !m.id.trim() || !m.assetId.trim())) throw new Error('项目或附件 ID 不能为空')
  if (media.some(m => !scene.anchors.some(a => a.id === m.anchorId))) throw new Error('备份附件引用了未知地标')
  if (media.some(m => !assets.some(a => a.id === m.assetId))) throw new Error('备份缺少附件数据')
  if (!plan && media.length) throw new Error('无规划的备份不能包含锚点附件')
  // Editable capacity/orphan-binding warnings are preserved, never silently dropped.
  // compileStudioPalace still blocks them until the author repairs the draft.
  return project
}

/** A clean scene-familiarization preview contains only trusted registry descriptions, never user material. */
export async function compileSceneTour(sceneId: string, builtinAssets: OfflineAsset[], licenses: string[]): Promise<OfflinePalace> {
  const scene = getSceneDefinition(sceneId), vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
  const assets = isDust2Scene(scene.id) ? builtinAssets.filter(a => a.id === 'scene:dust2') : []
  const data: OfflinePalace = {
    version: 1, id: 'scene-tour-' + scene.id + '-' + scene.version, contentFingerprint: await contentFingerprint(JSON.stringify(scene)), title: scene.title,
    exportedAt: new Date().toISOString(), sceneId: scene.id, sceneVersion: scene.version, sceneTitle: scene.title,
    sceneTour: true, draftPreview: true, sceneTargetSpan: scene.worldTransform?.targetSpan, sceneAssetId: isDust2Scene(scene.id) ? 'scene:dust2' : undefined,
    walkingRoute: scene.route.walking, assets,
    anchors: scene.anchors.map(a => ({ id: a.id, zone: a.zone, calloutAliases: a.calloutAliases, framingBounds: a.landmark.framingBounds, label: a.label, context: anchorCalloutContext(a), eye: vec(a.approach.eye), lookAt: vec(a.approach.lookAt), position: vec(a.cueVolume.center), focusPoint: a.landmark.focusPoint ? vec(a.landmark.focusPoint) : undefined, cueVolume: a.cueVolume })),
    cards: scene.anchors.map(a => ({ id: 'tour-' + a.id, anchorId: a.id, unitIds: ['tour-' + a.id], prompt: '观察这个地标的轮廓、材料与周边环境', answer: a.landmark.description, cue: '', action: '', imageIds: [], provenance: '内置场景说明；没有载入学习材料', cues: [] })),
    attribution: [...licenses, ...scene.limitations, ...(scene.attribution ? [`${scene.attribution.title} · ${scene.attribution.creator} · ${scene.attribution.license} · ${scene.attribution.url}\n许可：https://creativecommons.org/licenses/by/4.0/\n改动：场景等比缩放、居中和地面归一化；新增记忆锚点、助记物及诊断/路线视图。原始模型作者为 ${scene.attribution.creator}`] : ['Locus 原创程序化阅览馆'])],
  }
  validateOfflinePalace(data); return data
}
