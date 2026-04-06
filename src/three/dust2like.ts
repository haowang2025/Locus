import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'

import { locusIdFromRouteIndex, LOCUS_COUNT } from '../lib/loci'
import type { LocusId } from '../lib/types'

export type LocusPose = {
  locusId: LocusId
  routeIndex: number
  position: { x: number; y: number; z: number }
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

function addWallX(params: {
  group: Group
  mat: MeshStandardMaterial
  x1: number
  x2: number
  z: number
  h: number
  t: number
}) {
  const len = Math.abs(params.x2 - params.x1)
  if (len <= 0.0001) return
  addBox({
    group: params.group,
    geom: new BoxGeometry(len, params.h, params.t),
    mat: params.mat,
    x: (params.x1 + params.x2) / 2,
    y: params.h / 2,
    z: params.z,
  })
}

function addWallZ(params: {
  group: Group
  mat: MeshStandardMaterial
  x: number
  z1: number
  z2: number
  h: number
  t: number
}) {
  const len = Math.abs(params.z2 - params.z1)
  if (len <= 0.0001) return
  addBox({
    group: params.group,
    geom: new BoxGeometry(params.t, params.h, len),
    mat: params.mat,
    x: params.x,
    y: params.h / 2,
    z: (params.z1 + params.z2) / 2,
  })
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

export function createDust2LikeWorld() {
  const group = new Group()

  // Intentionally "dust-like": warm sand + sun-bleached walls (original colors).
  const floorMat = new MeshStandardMaterial({ color: 0xd8c7a2, roughness: 1, metalness: 0 })
  const wallMat = new MeshStandardMaterial({ color: 0xe7d7b8, roughness: 1, metalness: 0 })
  const accentMat = new MeshStandardMaterial({ color: 0xc8b08a, roughness: 1, metalness: 0 })
  const darkMat = new MeshStandardMaterial({ color: 0x8b7b62, roughness: 1, metalness: 0 })

  const floor = addBox({ group, geom: new BoxGeometry(140, 1, 140), mat: floorMat, x: 0, y: -0.5, z: 0 })
  floor.userData.kind = 'floor'

  const wallH = 6
  const wallT = 1
  const outer = 68

  // Outer boundary (fully closed to avoid escaping the playable area).
  addWallX({ group, mat: wallMat, x1: -outer, x2: outer, z: -outer, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -outer, x2: outer, z: outer, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -outer, z1: -outer, z2: outer, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: outer, z1: -outer, z2: outer, h: wallH, t: wallT })

  // Key areas (original greybox): T Spawn (south), Mid + Mid Doors, Catwalk/Short, Long (east), B Tunnels (west), A/B/CT.
  //
  // Coordinate convention: z+ is "south" (T side), z- is "north" (CT side).
  // This is NOT a 1:1 remake; the goal is "topology + landmark semantics" (IP-safe).

  // --- T Spawn ---
  addBox({ group, geom: new BoxGeometry(30, 0.15, 14), mat: accentMat, x: 0, y: 0.02, z: 56 })

  // T → Long alley (east; connects to Long Doors gap).
  addWallX({ group, mat: wallMat, x1: 22, x2: 58, z: 50, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: 22, x2: 58, z: 58, h: wallH, t: wallT })

  // T → Tunnels alley (west; connects to Tunnels entrance gap).
  addWallX({ group, mat: wallMat, x1: -58, x2: -22, z: 50, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -58, x2: -22, z: 58, h: wallH, t: wallT })

  // --- Mid (center) ---
  // Wider mid corridor with two openings:
  // - east opening (z 32..38) → Catwalk/Short → A
  // - west opening (z 32..38) → Lower tunnels → B tunnels
  addWallZ({ group, mat: wallMat, x: -12, z1: -5, z2: 32, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -12, z1: 38, z2: 46, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 12, z1: -5, z2: 32, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 12, z1: 38, z2: 46, h: wallH, t: wallT })

  // Mid cover boxes ("xbox" semantics).
  addBox({ group, geom: new BoxGeometry(5.2, 1.7, 3.6), mat: darkMat, x: 5.8, y: 0.85, z: 28 })
  addBox({ group, geom: new BoxGeometry(3.2, 1.2, 3.2), mat: darkMat, x: -6, y: 0.6, z: 24 })

  // --- CT Spawn (north center) ---
  addWallX({ group, mat: wallMat, x1: -18, x2: 18, z: -25, h: wallH, t: wallT })
  // South wall (leave opening to Mid: x -8..8) — this threshold is where "Mid Doors" live.
  addWallX({ group, mat: wallMat, x1: -18, x2: -8, z: -5, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: 8, x2: 18, z: -5, h: wallH, t: wallT })

  // Mid doors (double-door semantics: two slabs leaving a center gap).
  addBox({ group, geom: new BoxGeometry(6.6, 5, 0.6), mat: wallMat, x: -4.7, y: 2.5, z: -5 })
  addBox({ group, geom: new BoxGeometry(6.6, 5, 0.6), mat: wallMat, x: 4.7, y: 2.5, z: -5 })

  // West CT wall (leave opening to B doors: z -24..-20).
  addWallZ({ group, mat: wallMat, x: -18, z1: -25, z2: -24, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -18, z1: -20, z2: -5, h: wallH, t: wallT })

  // East CT wall (leave opening to A connector: z -22..-14).
  addWallZ({ group, mat: wallMat, x: 18, z1: -25, z2: -22, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 18, z1: -14, z2: -5, h: wallH, t: wallT })

  addBox({ group, geom: new BoxGeometry(4, 1.2, 4), mat: accentMat, x: 0, y: 0.6, z: -16 })

  // --- B Site (north-west) ---
  addWallX({ group, mat: wallMat, x1: -58, x2: -18, z: -50, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -58, x2: -18, z: -20, h: wallH, t: wallT })
  // East B wall (shared with CT; leave opening z -24..-20).
  addWallZ({ group, mat: wallMat, x: -18, z1: -50, z2: -24, h: wallH, t: wallT })
  // gap -24..-20

  // B props: "car" + boxes.
  addBox({ group, geom: new BoxGeometry(4.6, 1.4, 2.2), mat: darkMat, x: -40, y: 0.7, z: -35 })
  addBox({ group, geom: new BoxGeometry(3.6, 1.4, 3.6), mat: darkMat, x: -28, y: 0.7, z: -30 })
  addBox({ group, geom: new BoxGeometry(3, 1.2, 3), mat: darkMat, x: -30, y: 0.6, z: -44 })

  // --- B Tunnels (west lane; roofed corridor semantics) ---
  // Tunnel inner wall at x=-58 (shared boundary for tunnels + B site).
  // Gaps:
  // - Tunnel exit to B: z -40..-24
  // - Lower tunnels connector: z 10..14
  // - Tunnel entrance from T: z 50..58
  addWallZ({ group, mat: wallMat, x: -58, z1: -50, z2: -40, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -58, z1: -24, z2: 10, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -58, z1: 14, z2: 50, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -58, z1: 58, z2: 64, h: wallH, t: wallT })
  // Close the tunnels lane at the far end (then you must "turn in" via the exit gap).
  addWallX({ group, mat: wallMat, x1: -outer, x2: -58, z: -50, h: wallH, t: wallT })

  // Roof to sell the tunnel feeling.
  addBox({ group, geom: new BoxGeometry(10, 0.8, 110), mat: darkMat, x: -63, y: 3.8, z: 5 })
  // A couple of "chicane" blockers so the tunnels don't feel like a straight hallway.
  addBox({ group, geom: new BoxGeometry(3.2, 4.4, 10), mat: accentMat, x: -66, y: 2.2, z: 30 })
  addBox({ group, geom: new BoxGeometry(3.2, 4.4, 10), mat: accentMat, x: -60, y: 2.2, z: 18 })

  // --- A Site (north-east) ---
  addWallX({ group, mat: wallMat, x1: 18, x2: 58, z: -30, h: wallH, t: wallT })
  // South A wall (leave opening for Short/Catwalk: x 20..34).
  addWallX({ group, mat: wallMat, x1: 18, x2: 20, z: -8, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: 34, x2: 58, z: -8, h: wallH, t: wallT })

  // West A wall (shared with CT; leave opening z -22..-14).
  addWallZ({ group, mat: wallMat, x: 18, z1: -30, z2: -22, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 18, z1: -14, z2: -8, h: wallH, t: wallT })

  // A props: default / back boxes.
  addBox({ group, geom: new BoxGeometry(4.2, 1.6, 3.6), mat: darkMat, x: 33, y: 0.8, z: -18 })
  addBox({ group, geom: new BoxGeometry(3.2, 1.2, 3.2), mat: darkMat, x: 29, y: 0.6, z: -22 })
  addBox({ group, geom: new BoxGeometry(5.2, 1.6, 3.8), mat: darkMat, x: 48, y: 0.8, z: -26 })

  // --- Long (east lane) ---
  // Long inner wall at x=58 (splits playable area from the outer boundary lane).
  // Gaps:
  // - Long doors: z 50..58 (connects to T-long alley)
  // - Long→A entrance: z -18..-10
  addWallZ({ group, mat: wallMat, x: 58, z1: -30, z2: -18, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 58, z1: -10, z2: 50, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: 58, z1: 58, z2: 64, h: wallH, t: wallT })
  // Close the long lane on the far end (creates a "corner → A" feel).
  addWallX({ group, mat: wallMat, x1: 58, x2: outer, z: -20, h: wallH, t: wallT })

  // Long doors: two leaf-like slabs (semantics only).
  addBox({ group, geom: new BoxGeometry(0.6, 5, 2.8), mat: wallMat, x: 58.8, y: 2.5, z: 51.8 })
  addBox({ group, geom: new BoxGeometry(0.6, 5, 2.8), mat: wallMat, x: 58.8, y: 2.5, z: 56.2 })
  // Long landmarks: a "pit-ish" low cover + a corner cover.
  addBox({ group, geom: new BoxGeometry(3.6, 1.2, 6.5), mat: darkMat, x: 61.2, y: 0.6, z: 18 })
  addBox({ group, geom: new BoxGeometry(4.2, 1.6, 3.2), mat: darkMat, x: 64.2, y: 0.8, z: -8 })

  // --- Catwalk / Short (east of mid; dark strip semantics) ---
  // Catwalk east wall (creates the "narrow path" feel).
  addWallZ({ group, mat: wallMat, x: 28, z1: -8, z2: 38, h: wallH, t: wallT })
  // Extend the mid-east wall downward so the catwalk has a west boundary near the A entrance.
  addWallZ({ group, mat: wallMat, x: 12, z1: -8, z2: -5, h: wallH, t: wallT })
  addBox({ group, geom: new BoxGeometry(16, 0.15, 46), mat: darkMat, x: 20, y: 0.03, z: 15 })

  // --- Lower tunnels connector (Mid → B tunnels) ---
  // Horizontal segment (near z≈36).
  addWallX({ group, mat: wallMat, x1: -36, x2: -12, z: 34, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -36, x2: -12, z: 38, h: wallH, t: wallT })
  // Vertical segment (near x≈-36).
  addWallZ({ group, mat: wallMat, x: -36, z1: 12, z2: 38, h: wallH, t: wallT })
  addWallZ({ group, mat: wallMat, x: -40, z1: 12, z2: 38, h: wallH, t: wallT })
  // Horizontal segment (near z≈12) reaching the tunnels wall gap (x=-58, z 10..14).
  addWallX({ group, mat: wallMat, x1: -58, x2: -36, z: 10, h: wallH, t: wallT })
  addWallX({ group, mat: wallMat, x1: -58, x2: -36, z: 14, h: wallH, t: wallT })

  // Loci: a fixed loop route: T → Tunnels → B → CT → Mid Doors → Catwalk → A → Long → back to T.
  const waypoints: Waypoint[] = [
    { x: 0, y: 0, z: 56 }, // T Spawn
    { x: -30, y: 0, z: 54 }, // to tunnels alley
    { x: -55, y: 0, z: 54 }, // tunnel entrance (T side)
    { x: -63, y: 0, z: 54 }, // inside tunnels
    { x: -63, y: 0, z: 40 },
    { x: -63, y: 0, z: 10 },
    { x: -63, y: 0, z: -25 },
    { x: -55, y: 0, z: -32 }, // B entry
    { x: -40, y: 0, z: -35 }, // B car
    { x: -30, y: 0, z: -46 }, // B back
    { x: -20, y: 0, z: -22 }, // B doors (B side)
    { x: -16, y: 0, z: -22 }, // B doors (CT side)
    { x: 0, y: 0, z: -16 }, // CT Spawn
    { x: 0, y: 0, z: -8 }, // toward mid
    { x: 0, y: 0, z: 14 }, // mid (CT side)
    { x: 0, y: 0, z: 26 }, // mid
    { x: 0, y: 0, z: 34 }, // top mid
    { x: 14, y: 0, z: 34 }, // catwalk entry
    { x: 20, y: 0, z: 10 }, // catwalk
    { x: 22, y: 0, z: -8 }, // short entry
    { x: 33, y: 0, z: -18 }, // A default
    { x: 50, y: 0, z: -26 }, // A back
    { x: 55, y: 0, z: -14 }, // long entrance (A side)
    { x: 63, y: 0, z: -14 }, // long (inside)
    { x: 63, y: 0, z: 20 }, // long mid
    { x: 63, y: 0, z: 54 }, // long doors (long side)
    { x: 55, y: 0, z: 54 }, // long doors (T side)
    { x: 0, y: 0, z: 56 }, // back to T
  ]

  const loci: LocusPose[] = buildPolylineLoci({ waypoints, startRouteIndex: 1, count: LOCUS_COUNT })

  if (loci.length !== LOCUS_COUNT) {
    throw new Error(`Expected ${LOCUS_COUNT} loci, got ${loci.length}`)
  }

  return { group, loci }
}
