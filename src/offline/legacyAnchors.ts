import { Capsule } from 'three/examples/jsm/math/Capsule.js'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { Ray, Vector3 } from 'three'
import { loadDust2GlbWorld } from '../three/dust2glb'
import type { LocusId } from '../lib/types'
import type { OfflineAnchor } from './types'
/** Preserve pre-semantic 60-locus coordinates. Never reinterpret them as the new curated 12-anchor route. */
export async function collectLegacyDust2Anchors(wanted: Set<LocusId>): Promise<OfflineAnchor[]> {
  const { group, loci } = await loadDust2GlbWorld({ curated: false })
  const octree = new Octree().fromGraphNode(group.getObjectByName('PROPS') ?? group)
  return loci.filter(l => wanted.has(l.locusId)).map(l => {
    const base = l.position, marker = l.markerPosition ?? base
    let eye: Vector3 | undefined
    for (const radius of [3, 2, 4, 5]) for (let i = 0; i < 8 && !eye; i++) {
      const angle = l.yaw + i * Math.PI / 4, x = base.x + Math.sin(angle) * radius, z = base.z + Math.cos(angle) * radius
      const hit = octree.rayIntersect(new Ray(new Vector3(x, base.y + 1, z), new Vector3(0, -1, 0)))
      if (!hit || hit.distance > 2 || Math.abs(hit.position.y - base.y) > .55 || hit.triangle.getNormal(new Vector3()).y < .5) continue
      const y = hit.position.y + .02
      const capsule = new Capsule(new Vector3(x, y + .28, z), new Vector3(x, y + 1.4, z), .28)
      if (octree.capsuleIntersect(capsule)) continue
      const candidateEye = new Vector3(x, y + 1.62, z), target = new Vector3(marker.x, marker.y + .8, marker.z)
      const direction = target.clone().sub(candidateEye), distance = direction.length()
      const obstruction = octree.rayIntersect(new Ray(candidateEye, direction.normalize()))
      if (obstruction && obstruction.distance < distance - .15) continue
      eye = candidateEye
    }
    if (!eye) throw new Error(`旧版 ${l.locusId} 找不到无碰撞观看点，不能保证离线可用。请先将材料重新规划到新版场景。`)
    const position: [number, number, number] = [marker.x, marker.y + .8, marker.z]
    return { id: 'legacy-' + l.locusId, label: `旧版 ${l.locusId}`, context: '沿用原有 60 点路线的坐标；此点尚未添加新版的语义地标描述。', position, eye: eye.toArray() as [number, number, number], lookAt: position, cueVolume: { id: 'legacy-' + l.locusId, center: { x: position[0], y: position[1], z: position[2] }, size: { x: 1.5, y: 1.5, z: 1.2 }, maxObjects: 3, allowedRelations: [], allowedRelationIds: [] } }
  })
}
