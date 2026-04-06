import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'

import { locusIdFromRouteIndex, LOCUS_COUNT } from '../lib/loci'
import type { LocusId } from '../lib/types'

export type LocusPose = {
  locusId: LocusId
  routeIndex: number
  position: { x: number; y: number; z: number }
  markerPosition?: { x: number; y: number; z: number }
  yaw: number
  pitch: number
}

function addBox(params: {
  group: Group
  geom: BoxGeometry
  mat: MeshStandardMaterial
  x: number
  y: number
  z: number
  rx?: number
  ry?: number
  rz?: number
}) {
  const mesh = new Mesh(params.geom, params.mat)
  mesh.position.set(params.x, params.y, params.z)
  mesh.rotation.set(params.rx ?? 0, params.ry ?? 0, params.rz ?? 0)
  mesh.userData.static = true
  params.group.add(mesh)
  return mesh
}

function addWallSegment(params: {
  group: Group
  mat: MeshStandardMaterial
  x1: number
  z1: number
  x2: number
  z2: number
  h: number
  t: number
}) {
  const dx = params.x2 - params.x1
  const dz = params.z2 - params.z1
  const len = Math.hypot(dx, dz)
  if (len <= 0.0001) return

  const mesh = new Mesh(new BoxGeometry(len, params.h, params.t), params.mat)
  mesh.position.set((params.x1 + params.x2) / 2, params.h / 2, (params.z1 + params.z2) / 2)
  mesh.rotation.y = Math.atan2(dz, dx)
  mesh.userData.static = true
  params.group.add(mesh)
}

function addWallX(params: { group: Group; mat: MeshStandardMaterial; x1: number; x2: number; z: number; h: number; t: number }) {
  addWallSegment({ group: params.group, mat: params.mat, x1: params.x1, z1: params.z, x2: params.x2, z2: params.z, h: params.h, t: params.t })
}

function addWallZ(params: { group: Group; mat: MeshStandardMaterial; x: number; z1: number; z2: number; h: number; t: number }) {
  addWallSegment({ group: params.group, mat: params.mat, x1: params.x, z1: params.z1, x2: params.x, z2: params.z2, h: params.h, t: params.t })
}

type Waypoint = { x: number; y: number; z: number }

function buildPolylineLoci(params: { waypoints: Waypoint[]; startRouteIndex: number; count: number }): LocusPose[] {
  if (params.waypoints.length < 2) return []

  const segLens = params.waypoints.slice(0, -1).map((p, i) => {
    const q = params.waypoints[i + 1]!
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
  })
  const total = segLens.reduce((a, b) => a + b, 0)
  const step = total / params.count

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
    const routeIndex = params.startRouteIndex + i
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

export function createDust2BlockoutWorld() {
  const group = new Group()

  // IP-safe, Dust2-inspired blockout: focus on topology + stable landmarks.
  const floorMat = new MeshStandardMaterial({ color: 0xd8c7a2, roughness: 1, metalness: 0 })
  const wallMat = new MeshStandardMaterial({ color: 0xe7d7b8, roughness: 1, metalness: 0 })
  const accentMat = new MeshStandardMaterial({ color: 0xc8b08a, roughness: 1, metalness: 0 })
  const darkMat = new MeshStandardMaterial({ color: 0x7e6e56, roughness: 1, metalness: 0 })

  const floor = addBox({ group, geom: new BoxGeometry(210, 1, 210), mat: floorMat, x: 0, y: -0.5, z: 0 })
  floor.userData.kind = 'floor'

  const wallH = 7
  const wallT = 2
  const outer = 100

  // Outer boundary.
  addWallX({ group, mat: wallMat, x1: -outer, x2: outer, z: -outer, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -outer, x2: outer, z: outer, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -outer, z1: -outer, z2: outer, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: outer, z1: -outer, z2: outer, h: wallH, t: wallT })

  // --- T Spawn (south) ---
  addBox({ group, geom: new BoxGeometry(46, 0.15, 22), mat: accentMat, x: 0, y: 0.02, z: 86 })
  addBox({ group, geom: new BoxGeometry(6, 2.2, 4), mat: darkMat, x: -10, y: 1.1, z: 90 })
  addBox({ group, geom: new BoxGeometry(4, 1.6, 4), mat: darkMat, x: 10, y: 0.8, z: 88 })

  // T → Long alley (east).
  addWallX({ group, mat: wallMat, x1: 20, x2: 70, z: 78, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: 20, x2: 70, z: 88, h: wallH, t: wallT })

  // T → Tunnels alley (west).
  addWallX({ group, mat: wallMat, x1: -70, x2: -20, z: 78, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -70, x2: -20, z: 88, h: wallH, t: wallT })

  // --- Long (east lane) ---
  // Long inner wall at x=70. Gaps:
  // - Long doors: z 78..86
  // - A-long entrance: z -40..-30
  addWallZ({ group, mat: wallMat, x: 70, z1: -70, z2: -40, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 70, z1: -30, z2: 78, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 70, z1: 86, z2: outer, h: wallH, t: wallT })
  // Close long lane north end (creates the "corner → A" feel).
  addWallX({ group, mat: wallMat, x1: 70, x2: outer, z: -70, h: wallH, t: wallT })

  // Long doors (double-door semantics): two slabs leaving a center gap.
  addBox({ group, geom: new BoxGeometry(0.6, wallH - 1, 2.8), mat: wallMat, x: 71.1, y: (wallH - 1) / 2, z: 79.4 })
  addBox({ group, geom: new BoxGeometry(0.6, wallH - 1, 2.8), mat: wallMat, x: 71.1, y: (wallH - 1) / 2, z: 84.6 })
  // Long landmarks: blue bin + car + pit-ish cover.
  addBox({ group, geom: new BoxGeometry(4.8, 1.6, 3.6), mat: darkMat, x: 80, y: 0.8, z: 78 })
  addBox({ group, geom: new BoxGeometry(5.2, 1.4, 2.6), mat: darkMat, x: 86, y: 0.7, z: 40 })
  addBox({ group, geom: new BoxGeometry(4.2, 1.2, 7.2), mat: darkMat, x: 78, y: 0.6, z: 6 })

  // Long corner diagonal (helps the silhouette feel less boxy).
  addWallSegment({ group, mat: wallMat, x1: 82, z1: -18, x2: 70, z2: -30, h: wallH, t: wallT })

  // --- Mid (center) ---
  // Mid corridor walls at x=-10 and x=10. Gaps at z 26..38 to reach Cat / Lower.
  addWallZ({ group, mat: wallMat, x: -10, z1: -10, z2: 26, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -10, z1: 38, z2: 70, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 10, z1: -10, z2: 26, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 10, z1: 38, z2: 70, h: wallH, t: wallT })

  // Xbox (mid landmark).
  addBox({ group, geom: new BoxGeometry(6.2, 1.8, 4.4), mat: darkMat, x: 4.5, y: 0.9, z: 24 })
  addBox({ group, geom: new BoxGeometry(3.4, 1.2, 3.4), mat: darkMat, x: -4.5, y: 0.6, z: 22 })

  // --- CT Spawn / CT Mid (north center) ---
  addWallX({ group, mat: wallMat, x1: -18, x2: 18, z: -70, h: wallH, t: wallT })

  // South CT wall (Mid Doors threshold): leave opening x -4..4.
  addWallX({ group, mat: wallMat, x1: -18, x2: -4, z: -10, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: 4, x2: 18, z: -10, h: wallH, t: wallT })

  // Mid doors (double-door semantics).
  addBox({ group, geom: new BoxGeometry(2.8, wallH - 1, 0.6), mat: wallMat, x: -2.6, y: (wallH - 1) / 2, z: -10.9 })
  addBox({ group, geom: new BoxGeometry(2.8, wallH - 1, 0.6), mat: wallMat, x: 2.6, y: (wallH - 1) / 2, z: -10.9 })

  // CT side walls: x=-18 (to B) and x=18 (to A) with connector gaps.
  // B doors gap: z -50..-42
  addWallZ({ group, mat: wallMat, x: -18, z1: -70, z2: -50, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -18, z1: -42, z2: -10, h: wallH, t: wallT })
  // A connector gap: z -52..-44
  addWallZ({ group, mat: wallMat, x: 18, z1: -70, z2: -52, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 18, z1: -44, z2: -10, h: wallH, t: wallT })

  addBox({ group, geom: new BoxGeometry(5.2, 1.2, 5.2), mat: accentMat, x: 0, y: 0.6, z: -56 })

  // --- Catwalk / Short (east of mid) ---
  // Corridor x 10..34, z -22..38. Entry at z 26..38 through the gap in x=10 mid wall.
  addWallZ({ group, mat: wallMat, x: 10, z1: -22, z2: -10, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 34, z1: -22, z2: 38, h: wallH, t: wallT })
  addBox({ group, geom: new BoxGeometry(22, 0.15, 60), mat: darkMat, x: 22, y: 0.03, z: 8 })
  // Cat corner blocker (adds a recognizable bend).
  addWallSegment({ group, mat: wallMat, x1: 14, z1: 26, x2: 10, z2: 22, h: wallH, t: wallT })

  // --- Lower tunnels (Mid → Tunnels) ---
  addWallX({ group, mat: wallMat, x1: -70, x2: -10, z: 26, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -70, x2: -10, z: 38, h: wallH, t: wallT })

  // --- Tunnels + B Tunnels (west lane; roofed) ---
  // Inner wall at x=-70. Gaps:
  // - Tunnels entrance from T: z 78..86
  // - Lower connector: z 26..38
  // - Tunnel exit to B: z -40..-28
  addWallZ({ group, mat: wallMat, x: -70, z1: -70, z2: -40, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -70, z1: -28, z2: 26, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -70, z1: 38, z2: 78, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -70, z1: 86, z2: outer, h: wallH, t: wallT })
  // Close tunnels lane north end.
  addWallX({ group, mat: wallMat, x1: -outer, x2: -70, z: -70, h: wallH, t: wallT })

  // Roof to sell the tunnels feeling.
  addBox({ group, geom: new BoxGeometry(28, 0.8, 156), mat: darkMat, x: -85, y: 4.9, z: 8 })
  addBox({ group, geom: new BoxGeometry(4, 3.8, 10), mat: accentMat, x: -88, y: 1.9, z: 48 })
  addBox({ group, geom: new BoxGeometry(4, 3.8, 10), mat: accentMat, x: -82, y: 1.9, z: 34 })

  // --- B Site (north-west) ---
  addWallX({ group, mat: wallMat, x1: -70, x2: -18, z: -70, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -70, x2: -18, z: -25, h: wallH, t: wallT })
  // B props: car + boxes.
  addBox({ group, geom: new BoxGeometry(5.4, 1.4, 2.6), mat: darkMat, x: -52, y: 0.7, z: -52 })
  addBox({ group, geom: new BoxGeometry(4.2, 1.6, 4.2), mat: darkMat, x: -38, y: 0.8, z: -44 })
  addBox({ group, geom: new BoxGeometry(3.4, 1.2, 3.4), mat: darkMat, x: -60, y: 0.6, z: -62 })

  // --- A Site (north-east) ---
  addWallX({ group, mat: wallMat, x1: 18, x2: 70, z: -70, h: wallH, t: wallT })
  // South A wall (leave opening for Short/Cat: x 22..34).
  addWallX({ group, mat: wallMat, x1: 18, x2: 22, z: -22, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: 34, x2: 70, z: -22, h: wallH, t: wallT })

  // A props: default / goose / back boxes.
  addBox({ group, geom: new BoxGeometry(4.8, 1.6, 4.2), mat: darkMat, x: 44, y: 0.8, z: -46 })
  addBox({ group, geom: new BoxGeometry(3.6, 1.2, 3.6), mat: darkMat, x: 38, y: 0.6, z: -52 })
  addBox({ group, geom: new BoxGeometry(5.6, 1.6, 3.8), mat: darkMat, x: 60, y: 0.8, z: -60 })
  // Goose-ish corner diagonal.
  addWallSegment({ group, mat: wallMat, x1: 62, z1: -58, x2: 54, z2: -66, h: wallH, t: wallT })

  // Loci: fixed loop route (topology-first).
  const waypoints: Waypoint[] = [
    { x: 0, y: 0, z: 86 }, // T Spawn
    { x: -30, y: 0, z: 83 }, // to tunnels alley
    { x: -55, y: 0, z: 83 }, // tunnels entrance (T side)
    { x: -85, y: 0, z: 83 }, // inside tunnels
    { x: -85, y: 0, z: 50 },
    { x: -85, y: 0, z: 30 }, // lower connector zone
    { x: -85, y: 0, z: -32 }, // tunnel exit
    { x: -60, y: 0, z: -32 }, // B entry
    { x: -50, y: 0, z: -50 }, // B car
    { x: -60, y: 0, z: -65 }, // B back
    { x: -25, y: 0, z: -46 }, // B doors (B side)
    { x: -10, y: 0, z: -46 }, // B doors (CT side)
    { x: 0, y: 0, z: -56 }, // CT Spawn
    { x: 0, y: 0, z: -10 }, // Mid Doors (CT side)
    { x: 0, y: 0, z: 10 }, // mid
    { x: 4, y: 0, z: 24 }, // xbox
    { x: 0, y: 0, z: 38 }, // top mid
    { x: 14, y: 0, z: 34 }, // cat entry
    { x: 22, y: 0, z: 20 }, // cat
    { x: 22, y: 0, z: 0 }, // short
    { x: 25, y: 0, z: -12 }, // toward A short
    { x: 30, y: 0, z: -22 }, // A short entry
    { x: 44, y: 0, z: -46 }, // A default
    { x: 60, y: 0, z: -60 }, // Goose
    { x: 35, y: 0, z: -66 }, // A back
    { x: 65, y: 0, z: -34 }, // A long entry
    { x: 85, y: 0, z: -20 }, // long corner
    { x: 86, y: 0, z: 6 }, // long pit-ish
    { x: 86, y: 0, z: 40 }, // long car
    { x: 86, y: 0, z: 82 }, // long doors (long side)
    { x: 55, y: 0, z: 82 }, // long doors (T side)
    { x: 0, y: 0, z: 86 }, // back to T
  ]

  const loci: LocusPose[] = buildPolylineLoci({ waypoints, startRouteIndex: 1, count: LOCUS_COUNT })
  if (loci.length !== LOCUS_COUNT) {
    throw new Error(`Expected ${LOCUS_COUNT} loci, got ${loci.length}`)
  }

  return { group, loci }
}
