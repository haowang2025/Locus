import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { SceneAnchor } from '../src/lib/sceneRegistry'
import type { SceneWalkingRoute } from '../src/lib/sceneWalkingRoutes'
type Point = { x: number; y: number; z: number }
const anchors = JSON.parse(readFileSync('src/lib/dust2CalloutAnchors.json', 'utf8')) as SceneAnchor[]
const source = JSON.parse(readFileSync('../scene-inspection/dust2-callouts_walking_routes.json', 'utf8')) as { sceneVersion: string; gridStep: number; results: { from: string; to: string; pass: boolean; seconds: number; waypoints: Point[] }[] }
const proofBytes = readFileSync('../scene-inspection/dust2-callouts_continuous_route.json')
const proof = JSON.parse(proofBytes.toString()) as { pass: boolean; seconds: number; sceneVersion: string }
if (!proof.pass || proof.sceneVersion !== source.sceneVersion || source.sceneVersion !== 'dust2-vrchris-08f7ab9c-v5' || source.results.length !== anchors.length - 1 || source.results.some(r => !r.pass)) throw new Error('All route legs and continuous replay must pass for current v5')
const round = (n: number) => Math.round(n * 100) / 100
const legs = source.results.map((leg, i) => {
  if (leg.from !== anchors[i]!.id || leg.to !== anchors[i + 1]!.id) throw new Error('Passed route differs from anchor order')
  const points = [...leg.waypoints, anchors[i + 1]!.approach.position].map(p => [p.x, p.y, p.z] as [number, number, number])
  if (points.some(p => !p.every(Number.isFinite))) throw new Error('Nonfinite route positions')
  const meters = points.slice(1).reduce((sum, b, j) => sum + Math.hypot(...b.map((v, k) => v - points[j]![k]!)), 0)
  return { to: leg.to, meters: round(meters), seconds: round(leg.seconds), waypoints: points, from: leg.from }
})
const route: SceneWalkingRoute = { sceneVersion: source.sceneVersion, method: 'cpu-capsule-replay', browserVerified: false, gridStep: source.gridStep, continuousSeconds: proof.seconds, totalMeters: round(legs.reduce((sum, leg) => sum + leg.meters, 0)), controller: { radius: .28, eyeHeight: 1.62, stepHeight: .34, speed: 2.7 }, proofSha256: createHash('sha256').update(proofBytes).digest('hex'), legs }
writeFileSync('src/lib/dust2CalloutWalking.json', JSON.stringify(route, null, 2) + '\n')
console.log(JSON.stringify({ legs: legs.length, meters: route.totalMeters, seconds: route.continuousSeconds, proofSha256: route.proofSha256 }))
