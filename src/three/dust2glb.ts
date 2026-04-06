import { Box3, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { LOCUS_COUNT, locusIdFromRouteIndex } from '../lib/loci'
import type { LocusId } from '../lib/types'

import type { LocusPose } from './dust2blockout'

type WaypointUv = { u: number; v: number }
type UvAxis = 'u' | 'v'
type UvMapVariant = { xFrom: UvAxis; invertX: boolean; invertZ: boolean }
type SnapResult = { x: number; y: number; z: number; ok: boolean; radius: number }
type ElevatedSnap = { x: number; z: number; groundY: number; topY: number }

const UV_VARIANTS: UvMapVariant[] = [
  // Baseline: x=u, z=1-v (same as OBJ route mapping).
  { xFrom: 'u', invertX: false, invertZ: true },
  // Mirror variations.
  { xFrom: 'u', invertX: true, invertZ: true },
  { xFrom: 'u', invertX: false, invertZ: false },
  { xFrom: 'u', invertX: true, invertZ: false },
  // Swap axes (rotated 90°) variations.
  { xFrom: 'v', invertX: false, invertZ: true },
  { xFrom: 'v', invertX: true, invertZ: true },
  { xFrom: 'v', invertX: false, invertZ: false },
  { xFrom: 'v', invertX: true, invertZ: false },
]

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

function uvToXz(params: { uv: WaypointUv; bbox: Box3; variant?: UvMapVariant }) {
  const u = clamp01(params.uv.u)
  const v = clamp01(params.uv.v)
  const size = new Vector3()
  params.bbox.getSize(size)

  const variant = params.variant ?? UV_VARIANTS[0]!
  let xN = variant.xFrom === 'u' ? u : v
  let zN = variant.xFrom === 'u' ? v : u
  if (variant.invertX) xN = 1 - xN
  if (variant.invertZ) zN = 1 - zN

  const x = params.bbox.min.x + size.x * xN
  const z = params.bbox.min.z + size.z * zN
  return { x, z }
}

function groundYAtXz(params: { collisionRoot: Group; bbox: Box3; x: number; z: number }) {
  const originY = params.bbox.max.y + 50
  const ray = new Raycaster(new Vector3(params.x, originY, params.z), new Vector3(0, -1, 0), 0, originY - (params.bbox.min.y - 50))
  const hits = ray.intersectObject(params.collisionRoot, true)
  if (hits.length === 0) return null

  const tmpN = new Vector3()
  let bestPositive: number | null = null
  let bestNegative: number | null = null
  for (const h of hits) {
    if (!h.face) continue
    tmpN.copy(h.face.normal).transformDirection(h.object.matrixWorld)
    if (tmpN.y >= 0.35) {
      if (bestPositive === null || h.point.y < bestPositive) bestPositive = h.point.y
    } else if (tmpN.y <= -0.35) {
      if (bestNegative === null || h.point.y < bestNegative) bestNegative = h.point.y
    }
  }

  // Prefer "normal points up" when available. Some Sketchfab exports have inverted winding;
  // in that case, fall back to "normal points down" surfaces.
  return bestPositive ?? bestNegative
}

function findNearbyBoxTop(params: { propsRoot: Group; collisionRoot: Group; bboxProps: Box3; bboxGround: Box3; x: number; z: number }) {
  const minAboveGround = 0.55
  const maxAboveGround = 2.4
  const step = 1.2
  const maxR = 6
  const angles = 12

  const originY = params.bboxProps.max.y + 50
  const far = originY - (params.bboxProps.min.y - 50)

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

      const groundY = groundYAtXz({ collisionRoot: params.collisionRoot, bbox: params.bboxGround, x, z })
      if (groundY === null) continue

      ray.ray.origin.set(x, originY, z)
      ray.ray.direction.copy(dir)
      const hits = ray.intersectObject(params.propsRoot, true)
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

function snapToGroundDetailed(params: { collisionRoot: Group; bbox: Box3; x: number; z: number }): SnapResult {
  const base = groundYAtXz(params)
  if (base !== null) return { x: params.x, y: base + 0.02, z: params.z, ok: true, radius: 0 }

  const size = new Vector3()
  params.bbox.getSize(size)
  const span = Math.max(size.x, size.z)
  const step = Math.max(1.2, span * 0.01)
  const maxR = Math.max(12, span * 0.12)
  const angles = 16
  for (let r = step; r <= maxR; r += step) {
    for (let i = 0; i < angles; i++) {
      const a = (i / angles) * Math.PI * 2
      const x = params.x + Math.cos(a) * r
      const z = params.z + Math.sin(a) * r
      const y = groundYAtXz({ ...params, x, z })
      if (y !== null) return { x, y: y + 0.02, z, ok: true, radius: r }
    }
  }

  return { x: params.x, y: params.bbox.min.y + 0.02, z: params.z, ok: false, radius: maxR + step }
}

function snapToGround(params: { collisionRoot: Group; bbox: Box3; x: number; z: number }) {
  const { x, y, z } = snapToGroundDetailed(params)
  return { x, y, z }
}

function chooseBestUvVariant(params: { collisionRoot: Group; bbox: Box3; waypointsUv: WaypointUv[] }) {
  let best: { variant: UvMapVariant; okCount: number; radiusSum: number; idx: number } | null = null
  for (let idx = 0; idx < UV_VARIANTS.length; idx++) {
    const variant = UV_VARIANTS[idx]!
    let okCount = 0
    let radiusSum = 0
    for (const uv of params.waypointsUv) {
      const { x, z } = uvToXz({ uv, bbox: params.bbox, variant })
      const snapped = snapToGroundDetailed({ collisionRoot: params.collisionRoot, bbox: params.bbox, x, z })
      if (snapped.ok) okCount += 1
      radiusSum += snapped.radius
    }
    if (!best) {
      best = { variant, okCount, radiusSum, idx }
      continue
    }
    if (okCount > best.okCount) {
      best = { variant, okCount, radiusSum, idx }
      continue
    }
    if (okCount === best.okCount && radiusSum < best.radiusSum - 1e-6) {
      best = { variant, okCount, radiusSum, idx }
      continue
    }
    // Deterministic tie-breaker: earlier variant wins (keeps baseline stable when equal).
  }
  return best?.variant ?? UV_VARIANTS[0]!
}

function buildDefaultRouteUv(): WaypointUv[] {
  // Same ring-style route used by the built-in OBJ loader.
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

async function loadDust2Glb(): Promise<GLTF> {
  const url = new URL('maps/dust2/de_dust2_cs_map.glb', document.baseURI).toString()
  const loader = new GLTFLoader()
  return new Promise<GLTF>((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf), undefined, reject)
  })
}

function normalizeWorld(params: { root: Group; content: Group }) {
  params.root.updateWorldMatrix(true, true)
  const bbox0 = new Box3().setFromObject(params.content)
  const size0 = new Vector3()
  bbox0.getSize(size0)

  const span = Math.max(size0.x, size0.z)
  const targetSpan = 200
  const scale = span > 1e-6 ? targetSpan / span : 1
  params.root.scale.setScalar(scale)

  params.root.updateWorldMatrix(true, true)
  const bbox1 = new Box3().setFromObject(params.content)
  const center = new Vector3()
  bbox1.getCenter(center)
  params.root.position.x -= center.x
  params.root.position.z -= center.z

  params.root.updateWorldMatrix(true, true)
  const bbox2 = new Box3().setFromObject(params.content)
  params.root.position.y -= bbox2.min.y

  params.root.updateWorldMatrix(true, true)
}

export async function loadDust2GlbWorld(): Promise<{ group: Group; loci: LocusPose[] }> {
  const gltf = await loadDust2Glb()
  const raw = gltf.scene as Group
  if (!raw) throw new Error('内置 Dust2 GLB 缺少 scene')

  const props = new Group()
  props.name = 'PROPS'
  props.add(raw)

  const root = new Group()
  root.name = 'dust2_glb_builtin'
  root.add(props)

  normalizeWorld({ root, content: props })

  // Build a collision-only group by filtering out small prop meshes (best-effort).
  root.updateWorldMatrix(true, true)
  const bbox = new Box3().setFromObject(props)
  const size = new Vector3()
  bbox.getSize(size)
  const span = Math.max(size.x, size.z)
  const minCollisionDim = Math.max(6, span * 0.05)

  const collision = new Group()
  collision.name = 'COLLISION'
  collision.visible = false

  const collisionMat = new MeshBasicMaterial({ color: 0x000000, side: DoubleSide })
  const invRootWorld = new Matrix4().copy(root.matrixWorld).invert()
  const tmpBox = new Box3()
  const tmpSize = new Vector3()

  props.updateWorldMatrix(true, true)
  props.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const mesh = obj

    tmpBox.setFromObject(mesh)
    tmpBox.getSize(tmpSize)
    const meshMaxDim = Math.max(tmpSize.x, tmpSize.y, tmpSize.z)
    if (meshMaxDim < minCollisionDim) return

    const collider = new Mesh(mesh.geometry, collisionMat)
    collider.matrixAutoUpdate = false
    collider.matrix.copy(mesh.matrixWorld).premultiply(invRootWorld)
    collider.matrixWorldNeedsUpdate = true
    collider.userData.static = true
    collision.add(collider)
  })

  // If filtering produced nothing, fall back to using full props geometry as collision.
  if (collision.children.length === 0) {
    props.name = 'COLLISION'
  } else {
    root.add(collision)
  }

  // Generate loci from bbox + ground snapping (no embedded L01..L60 needed).
  const groundRoot = collision.children.length > 0 ? collision : (props as Group)
  const groundBbox = new Box3().setFromObject(groundRoot)
  const waypointsUv = buildDefaultRouteUv()
  const variant = chooseBestUvVariant({ collisionRoot: groundRoot, bbox: groundBbox, waypointsUv })
  const waypoints = waypointsUv.map((uv) => {
    const { x, z } = uvToXz({ uv, bbox: groundBbox, variant })
    return snapToGround({ collisionRoot: groundRoot, bbox: groundBbox, x, z })
  })

  const loci = buildPolylineLoci({ waypoints, count: LOCUS_COUNT })

  const lociWithGround: LocusPose[] = loci.map((l) => {
    const snapped = snapToGround({ collisionRoot: groundRoot, bbox: groundBbox, x: l.position.x, z: l.position.z })
    return { ...l, position: { ...l.position, x: snapped.x, y: snapped.y, z: snapped.z } }
  })

  const lociWithBoxes: LocusPose[] = lociWithGround.map((l) => {
    const found = findNearbyBoxTop({
      propsRoot: props,
      collisionRoot: groundRoot,
      bboxProps: bbox,
      bboxGround: groundBbox,
      x: l.position.x,
      z: l.position.z,
    })
    if (!found) return l
    return {
      ...l,
      position: { x: found.x, y: found.groundY + 0.02, z: found.z },
      markerPosition: { x: found.x, y: found.topY + 0.02, z: found.z },
    }
  })

  const seen = new Set<LocusId>()
  for (const l of lociWithBoxes) seen.add(l.locusId)
  for (let i = 1; i <= LOCUS_COUNT; i++) {
    const id = locusIdFromRouteIndex(i)
    if (!seen.has(id)) throw new Error(`内置点位生成失败：缺少 ${id}`)
  }

  return { group: root, loci: lociWithBoxes }
}
