import type { Group } from 'three'
import { getSceneDefinition, registerSceneDefinition, type SceneDefinition, type SceneId } from '../lib/sceneRegistry'
import type { LocusPose } from './dust2blockout'
import { createReadingHallWorld } from './readingHall'
import { loadDust2GlbWorld } from './dust2glb'

export interface SceneGeometryAdapter {
  definition: SceneDefinition
  /** Return a fresh owned geometry graph in final Y-up world coordinates. Do not
   * share disposable geometries/materials/bitmaps with another live viewer. */
  loadGeometry: () => Promise<Group> | Group
}
const geometryLoaders = new Map<SceneId, SceneGeometryAdapter['loadGeometry']>([
  ['reading-hall', () => createReadingHallWorld({batchStatic:true}).group],
  ['dust2-callouts', async () => (await loadDust2GlbWorld({ curated: true })).group],
  ['dust2', async () => (await loadDust2GlbWorld({ curated: true })).group],
])
/** Future scenes supply geometry + semantic anchors, not prompts containing guessed coordinates.
 * Registration does not certify routes or grant remote asset access. Portable export also needs
 * an explicit asset packaging adapter, and must reject an unrecognized scene rather than fallback.
 */
export function registerSceneGeometryAdapter(adapter: SceneGeometryAdapter): void {
  if (geometryLoaders.has(adapter.definition.id)) throw new Error(`场景适配器已存在：${adapter.definition.id}`)
  registerSceneDefinition(adapter.definition)
  geometryLoaders.set(adapter.definition.id,adapter.loadGeometry)
}
export async function loadSceneWorld(id: SceneId): Promise<{ group: Group; loci: LocusPose[] }> {
  const definition = getSceneDefinition(id), loader = geometryLoaders.get(id)
  if (!loader) throw new Error(`场景没有可用的几何适配器：${id}`)
  const group = await loader()
  const loci = definition.anchors.map(a=>({locusId:a.locusId,routeIndex:a.routeOrder,position:a.approach.position,markerPosition:a.cueVolume.center,yaw:a.approach.yaw,pitch:a.approach.pitch}))
  return {group,loci}
}
