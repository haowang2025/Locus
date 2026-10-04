import test from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { computeViewerViewport, fitSceneViewport } from '../src/offline/viewport'
import { getSceneDefinition } from '../src/lib/sceneRegistry'
import { fitAnchorFieldOfView } from '../src/three/anchorCamera'
test('Portrait canvas dimensions and full-landmark projections match actual runtime aspect', () => {
  for (const [width, height] of [[360, 800], [390, 844], [768, 1024], [800, 600], [1200, 900], [1600, 900]]) for (const collapsed of [false, true]) {
    const panel = { left: width >= 760 ? width - 430 : 12, top: collapsed ? height - 130 : height * .58, width: Math.min(430, width - 24), height: collapsed ? 60 : height * .35 }
    const available = computeViewerViewport(width, height, 105, panel, collapsed), used = fitSceneViewport(available)
    assert.equal(used.width, available.width); assert.equal(used.left, available.left); assert.equal(used.top, available.top)
    assert.ok(used.height <= available.height); assert.ok(used.width / used.height >= 4 / 3 - 1e-10)
    for (const anchor of getSceneDefinition('dust2-callouts').anchors) {
      const fit = fitAnchorFieldOfView(anchor, used.width / used.height); assert.ok(fit.fits, anchor.id); assert.ok(fit.fov <= 110)
      const camera = new PerspectiveCamera(fit.fov, used.width / used.height, .04, 800), eye = anchor.approach.eye, look = anchor.approach.lookAt
      camera.position.set(eye.x, eye.y, eye.z); camera.lookAt(look.x, look.y, look.z); camera.updateMatrixWorld(true)
      const c = anchor.cueVolume.center, s = anchor.cueVolume.size, b = anchor.landmark.framingBounds!, points: Vector3[] = []
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push(new Vector3(c.x + x * s.x / 2, c.y + y * s.y / 2, c.z + z * s.z / 2))
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) points.push(new Vector3(x, y, z))
      for (const point of points) { const ndc = point.project(camera); assert.ok(Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z >= -1 && ndc.z <= 1, anchor.id) }
    }
  }
})
test('Wide viewport remains unchanged', () => { const rect = { left: 10, top: 20, width: 1200, height: 600 }; assert.deepEqual(fitSceneViewport(rect), rect) })
