import runtime from 'virtual:locus-offline-runtime'
import gplLicense from '../../LICENSE?raw'
import threeLicense from '../../node_modules/three/LICENSE?raw'
import { assembleOfflinePalace } from '../offline/assemble'
import { getBlob } from './db'
import { exportFile } from './exportFile'
import { getSceneDefinition, isDust2Scene, anchorCalloutContext } from './sceneRegistry'
import type { CardRecord, PalaceRecord } from './types'
import { collectLegacyDust2Anchors } from '../offline/legacyAnchors'
import type { OfflineAsset, OfflinePalace, Vec3 } from '../offline/types'
import { prepareOfflineAsset, checkAssetBudgets } from '../offline/assets'
import { buildOfflineHtml } from '../offline/serialize'

const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
export async function collectOfflinePalace(palace: PalaceRecord, cards: CardRecord[]): Promise<OfflinePalace> {
  if (palace.customMap && !palace.mnemonicPlan) throw new Error('此宫殿使用自定义地图，但尚无经过验证的离线锚点适配器。请先选择受支持的场景；导出不会悄悄替换你的地图。')
  const plan = palace.mnemonicPlan
  const scene = getSceneDefinition(plan?.sceneId ?? 'dust2')
  if (plan?.sceneVersion && plan.sceneVersion !== scene.version) throw new Error('此宫殿使用较早的场景版本，请先重新检查并保存锚点规划，再导出。')
  const assets: OfflineAsset[] = [], ids = new Set<string>()
  async function add(id: string, blob: Blob, kind: 'image' | 'model') { if (ids.has(id)) return; assets.push(await prepareOfflineAsset(id, blob, kind)); ids.add(id); checkAssetBudgets(assets) }
  const filled = cards.filter(c => c.prompt.trim() || c.answer.trim() || c.note?.trim() || c.imageIds.length || c.modelId).sort((a, b) => a.routeIndex - b.routeIndex)
  if (!filled.length) throw new Error('没有可导出的材料')
  for (const c of filled) if (c.mnemonic && plan) { const expected = c.mnemonic.unitIds.map(id => plan.units.find(u => u.id === id)?.facts ?? '').join('\n\n'); if (c.answer !== expected) throw new Error('卡片答案与原文规划不一致：' + c.locusId + '。请先在材料规划中确认修改；不能用旧版原文覆盖你的卡片修改。') }
  for (const c of filled) for (const id of [...c.imageIds, ...(c.modelId ? [c.modelId] : [])]) { const b = await getBlob(id); if (!b) throw new Error('附件已丢失，不能完整导出：' + id); await add(id, b.data.type ? b.data : new Blob([b.data], { type: b.mime }), id === c.modelId ? 'model' : 'image') }
  let sceneAssetId: string | undefined
  if (isDust2Scene(scene.id)) { const res = await fetch(`${import.meta.env.BASE_URL}maps/dust2/de_dust2_cs_map.glb`); if (!res.ok) throw new Error('内置地图资源不可用，请完成安装后重试'); await add('scene:dust2', await res.blob(), 'model'); sceneAssetId = 'scene:dust2' }
  const anchors = plan ? scene.anchors.map(a => ({ id: a.id, zone: a.zone, calloutAliases: a.calloutAliases, framingBounds: a.landmark.framingBounds, focusPoint: a.landmark.focusPoint ? vec(a.landmark.focusPoint) : undefined, cueVolume: a.cueVolume, label: a.label, context: anchorCalloutContext(a), position: vec(a.cueVolume.center), eye: vec(a.approach.eye), lookAt: vec(a.approach.lookAt) })) : await collectLegacyDust2Anchors(new Set(filled.map(c => c.locusId)))
  const worldTransform = 'worldTransform' in scene ? scene.worldTransform as { targetSpan: number } : undefined
  const sceneTargetSpan = plan ? worldTransform?.targetSpan ?? 200 : 200
  return assembleOfflinePalace({ palace, cards: filled, scene, assets, anchors, sceneTargetSpan, sceneAssetId, licenses: [gplLicense, threeLicense] })
}
export async function exportOfflinePalace(palace: PalaceRecord, cards: CardRecord[]) {
  const data = await collectOfflinePalace(palace, cards)
  const html = buildOfflineHtml(data, runtime)
  await exportFile({ fileName: `${palace.title || 'palace'}-offline.html`, blob: new Blob([html], { type: 'text/html;charset=utf-8' }), dialogTitle: '保存可独立打开的离线记忆宫殿' })
}
