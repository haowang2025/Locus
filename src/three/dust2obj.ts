import { Box3, Group, Raycaster, Vector3 } from 'three'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

import { LOCUS_COUNT, locusIdFromRouteIndex } from '../lib/loci'
import type { LocusId } from '../lib/types'

import type { LocusPose } from './dust2blockout'

type WaypointUv = { u: number; v: number }
type ElevatedSnap = { x: number; z: number; groundY: number; topY: number }

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}

function buildPolylineLoci(params: { waypoints: { x: number; y: number; z: number }[]; count: number }): LocusPose[] {
  if (params.waypoints.length < 2) return []

  const segLens = params.waypoints.slice(0, -1).map((p, i) => {
    const q = params.waypoints[i + 1]!
    return Math.hypot(q.x - p.x, q.z - p.z)
  })
  const total = segLens.reduce((a, b) => a + b, 0)
  const step = total <= 1e-6 ? 0 : total / params.count

  function atDistance(d: number) {
    let remaining = d
    for (let i = 0; i < segLens.length; i++) {
      const p = params.waypoints[i]!
      const q = params.waypoints[i + 1]!
      const len = segLens[i]!
      if (remaining <= len || i === segLens.length - 1) {
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, remaining / len))
        const x = p.x + (q.x - p.x) * t
        const y = p.y + (q.y - p.y) * t
        const z = p.z + (q.z - p.z) * t
        const dx = q.x - p.x
        const dz = q.z - p.z
        const yaw = Math.atan2(dx, dz) + Math.PI
        return { x, y, z, yaw }
      }
      remaining -= len
    }
    const p = params.waypoints[0]!
    const q = params.waypoints[1]!
    const yaw = Math.atan2(q.x - p.x, q.z - p.z) + Math.PI
    return { x: p.x, y: p.y, z: p.z, yaw }
  }

  const poses: LocusPose[] = []
  for (let i = 0; i < params.count; i++) {
    const routeIndex = i + 1
    const locusId = locusIdFromRouteIndex(routeIndex)
    const { x, y, z, yaw } = atDistance(i * step)
    poses.push({
      locusId,
      routeIndex,
      position: { x, y, z },
      yaw,
      pitch: 0,
    })
  }
  return poses
}

function getCollisionMeshRoot(obj: Group) {
  const hit = obj.getObjectByName('BSP_Object.model_0')
  if (!hit) throw new Error('内置 Dust2 OBJ 缺少 BSP_Object.model_0（碰撞主几何）')
  return hit
}

function makeCollisionSplitRoot(objRoot: Group) {
  const collisionMesh = getCollisionMeshRoot(objRoot)
  objRoot.remove(collisionMesh)

  const collision = new Group()
  collision.name = 'COLLISION'
  collision.add(collisionMesh)

  const root = new Group()
  root.name = 'dust2_obj_builtin'
  root.add(collision)

  const props = new Group()
  props.name = 'PROPS'
  for (const child of objRoot.children.slice()) props.add(child)
  root.add(props)

  return { root, collision }
}

function uvToXz(params: { uv: WaypointUv; bbox: Box3 }) {
  const u = clamp01(params.uv.u)
  const v = clamp01(params.uv.v)
  const size = new Vector3()
  params.bbox.getSize(size)
  const x = params.bbox.min.x + size.x * u
  // v is image-style: 0 = top, 1 = bottom; map to z with the same convention.
  const z = params.bbox.max.z - size.z * v
  return { x, z }
}

function groundYAtXz(params: { collisionRoot: Group; bbox: Box3; x: number; z: number }) {
  const originY = params.bbox.max.y + 50
  const ray = new Raycaster(new Vector3(params.x, originY, params.z), new Vector3(0, -1, 0), 0, originY - (params.bbox.min.y - 50))
  const hits = ray.intersectObject(params.collisionRoot, true)
  if (hits.length === 0) return null

  const tmpN = new Vector3()
  let best: number | null = null
  for (const h of hits) {
    if (!h.face) continue
    tmpN.copy(h.face.normal).transformDirection(h.object.matrixWorld)
    if (tmpN.y < 0.35) continue
    if (best === null || h.point.y < best) best = h.point.y
  }
  return best
}

function findNearbyBoxTop(params: { collisionRoot: Group; bbox: Box3; x: number; z: number }) {
  const minAboveGround = 0.55
  const maxAboveGround = 2.4
  const step = 1.2
  const maxR = 6
  const angles = 12

  const originY = params.bbox.max.y + 50
  const far = originY - (params.bbox.min.y - 50)

  const ray = new Raycaster()
  ray.near = 0
  ray.far = far
  const dir = new Vector3(0, -1, 0)
  const tmpN = new Vector3()

  for (let r = 0; r <= maxR + 1e-6; r += step) {
    const count = r <= 1e-6 ? 1 : angles
    for (let i = 0; i < count; i++) {
      const a = r <= 1e-6 ? 0 : (i / angles) * Math.PI * 2
      const x = params.x + Math.cos(a) * r
      const z = params.z + Math.sin(a) * r

      const groundY = groundYAtXz({ collisionRoot: params.collisionRoot, bbox: params.bbox, x, z })
      if (groundY === null) continue

      ray.ray.origin.set(x, originY, z)
      ray.ray.direction.copy(dir)
      const hits = ray.intersectObject(params.collisionRoot, true)
      for (const h of hits) {
        if (!h.face) continue
        tmpN.copy(h.face.normal).transformDirection(h.object.matrixWorld)
        if (tmpN.y < 0.85) continue
        const above = h.point.y - groundY
        if (above < minAboveGround || above > maxAboveGround) continue
        const result: ElevatedSnap = { x, z, groundY, topY: h.point.y }
        return result
      }
    }
  }

  return null
}

function snapToGround(params: { collisionRoot: Group; bbox: Box3; x: number; z: number }) {
  const base = groundYAtXz(params)
  if (base !== null) return { x: params.x, y: base + 0.02, z: params.z }

  const step = 1.2
  const maxR = 12
  const angles = 16
  for (let r = step; r <= maxR; r += step) {
    for (let i = 0; i < angles; i++) {
      const a = (i / angles) * Math.PI * 2
      const x = params.x + Math.cos(a) * r
      const z = params.z + Math.sin(a) * r
      const y = groundYAtXz({ ...params, x, z })
      if (y !== null) return { x, y: y + 0.02, z }
    }
  }

  return { x: params.x, y: 0.02, z: params.z }
}

function buildDefaultRouteUv(): WaypointUv[] {
  // Hand-tuned ring path (normalized to map bbox) that covers major Dust2 areas.
  // u: left→right, v: top→bottom.
  return [
    { u: 0.52, v: 0.92 }, // T spawn
    { u: 0.40, v: 0.88 }, // towards tunnels
    { u: 0.27, v: 0.80 }, // upper tunnels
    { u: 0.22, v: 0.64 }, // tunnels
    { u: 0.24, v: 0.44 }, // B doors-ish
    { u: 0.20, v: 0.22 }, // B site
    { u: 0.44, v: 0.18 }, // CT-ish
    { u: 0.55, v: 0.32 }, // mid
    { u: 0.64, v: 0.22 }, // cat/short
    { u: 0.82, v: 0.18 }, // A site
    { u: 0.88, v: 0.40 }, // long corner-ish
    { u: 0.84, v: 0.68 }, // long
    { u: 0.68, v: 0.84 }, // back towards T
    { u: 0.52, v: 0.92 }, // close loop
  ]
}

export async function loadDust2ObjWorld(): Promise<{ group: Group; loci: LocusPose[] }> {
  const basePath = new URL('maps/dust2/', document.baseURI).toString()

  const mtlLoader = new MTLLoader()
  mtlLoader.setPath(basePath)
  const materials = await new Promise<any>((resolve, reject) => {
    mtlLoader.load('de_dust2.mtl', resolve, undefined, reject)
  })
  materials.preload()

  const objLoader = new OBJLoader()
  objLoader.setMaterials(materials)
  objLoader.setPath(basePath)
  const objRoot = (await new Promise<Group>((resolve, reject) => {
    objLoader.load('de_dust2.obj', resolve, undefined, reject)
  })) as Group

  const { root, collision } = makeCollisionSplitRoot(objRoot)

  // Crafty exports Z-up; rotate to Three.js Y-up.
  root.rotation.x = -Math.PI / 2
  // CS1.6-ish unit scale: 72 units player height ~ 1.6m.
  const scale = 1.6 / 72
  root.scale.setScalar(scale)

  root.updateWorldMatrix(true, true)
  const bbox = new Box3().setFromObject(collision)
  const center = new Vector3()
  bbox.getCenter(center)
  root.position.x -= center.x
  root.position.z -= center.z
  root.updateWorldMatrix(true, true)

  const bboxAfter = new Box3().setFromObject(collision)
  const waypointsUv = buildDefaultRouteUv()
  const waypoints = waypointsUv.map((uv) => {
    const { x, z } = uvToXz({ uv, bbox: bboxAfter })
    return snapToGround({ collisionRoot: collision, bbox: bboxAfter, x, z })
  })

  const loci = buildPolylineLoci({ waypoints, count: LOCUS_COUNT })

  // Re-sample Y from geometry for each locus (more robust than segment interpolation).
  const lociWithGround: LocusPose[] = loci.map((l) => {
    const x = l.position.x
    const z = l.position.z
    const snapped = snapToGround({ collisionRoot: collision, bbox: bboxAfter, x, z })
    return { ...l, position: { ...l.position, x: snapped.x, y: snapped.y, z: snapped.z } }
  })

  const lociWithBoxes: LocusPose[] = lociWithGround.map((l) => {
    const found = findNearbyBoxTop({ collisionRoot: collision, bbox: bboxAfter, x: l.position.x, z: l.position.z })
    if (!found) return l
    return {
      ...l,
      position: { x: found.x, y: found.groundY + 0.02, z: found.z },
      markerPosition: { x: found.x, y: found.topY + 0.02, z: found.z },
    }
  })

  // Ensure locus ids are stable and complete.
  const seen = new Set<LocusId>()
  for (const l of lociWithBoxes) seen.add(l.locusId)
  for (let i = 1; i <= LOCUS_COUNT; i++) {
    const id = locusIdFromRouteIndex(i)
    if (!seen.has(id)) throw new Error(`内置点位生成失败：缺少 ${id}`)
  }

  return { group: root, loci: lociWithBoxes }
}
