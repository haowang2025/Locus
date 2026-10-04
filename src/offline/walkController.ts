import { Box3, Object3D, Ray, Vector3 } from 'three'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { Capsule } from 'three/examples/jsm/math/Capsule.js'

/** Static-world capsule controller, shared by the portable viewer and headless geometry tests. */
export class PortableWalker {
  readonly radius = 0.28
  readonly eyeHeight = 1.62
  readonly capsule = new Capsule(new Vector3(), new Vector3(), this.radius)
  readonly velocity = new Vector3()
  readonly octree = new Octree()
  readonly lastSafeEye = new Vector3()
  grounded = false
  private minY = -10
  constructor(collisionRoot: Object3D) {
    collisionRoot.updateMatrixWorld(true)
    this.octree.fromGraphNode(collisionRoot)
    this.minY = new Box3().setFromObject(collisionRoot).min.y - 4
  }
  teleportEye(eye: Vector3): void {
    const feet = eye.clone().add(new Vector3(0, -this.eyeHeight, 0))
    this.capsule.start.copy(feet).add(new Vector3(0, this.radius, 0))
    this.capsule.end.copy(feet).add(new Vector3(0, 1.4, 0))
    this.velocity.set(0, 0, 0)
    this.resolve()
    this.lastSafeEye.copy(this.eye())
  }
  eye(): Vector3 { return this.capsule.start.clone().add(new Vector3(0, this.eyeHeight - this.radius, 0)) }
  private resolve(): { blocked: boolean } {
    this.grounded = false; let blocked = false
    for (let i = 0; i < 5; i++) {
      const hit = this.octree.capsuleIntersect(this.capsule)
      if (!hit) break
      if (hit.normal.y > .5) this.grounded = true
      if (hit.normal.y < .3) blocked = true
      const into = this.velocity.dot(hit.normal)
      if (into < 0) this.velocity.addScaledVector(hit.normal, -into)
      this.capsule.translate(hit.normal.clone().multiplyScalar(hit.depth + .00001))
    }
    return { blocked }
  }
  step(dt: number, forward: number, side: number, yaw: number, speedMultiplier = 1): Vector3 {
    if (![dt, forward, side, yaw, speedMultiplier].every(Number.isFinite)) return this.eye()
    const steps = Math.max(1, Math.ceil(Math.min(.1, Math.max(0, dt)) / (1 / 120)))
    const delta = Math.min(.1, Math.max(0, dt)) / steps
    const magnitude = Math.max(1, Math.hypot(forward, side))
    const desired = new Vector3((-Math.sin(yaw) * forward + Math.cos(yaw) * side) / magnitude, 0, (-Math.cos(yaw) * forward - Math.sin(yaw) * side) / magnitude).multiplyScalar(2.7 * Math.max(.25, Math.min(3, speedMultiplier)))
    for (let i = 0; i < steps; i++) {
      // Static friction: a grounded capsule at rest must not creep down a slope
      // from repeated gravity/penetration projection in an otherwise static world.
      if (this.grounded && desired.lengthSq() < 1e-8) { this.velocity.set(0, 0, 0); continue }
      const before = this.capsule.clone(), wasGrounded = this.grounded
      this.velocity.x = desired.x; this.velocity.z = desired.z; this.velocity.y -= 20 * delta
      const movement = this.velocity.clone().multiplyScalar(delta)
      this.capsule.translate(movement)
      const { blocked } = this.resolve()
      if (blocked && wasGrounded && desired.lengthSq() > .01) this.tryStep(before, movement)
      if (this.grounded) this.lastSafeEye.copy(this.eye())
      if (this.capsule.start.y < this.minY) this.teleportEye(this.lastSafeEye)
    }
    return this.eye()
  }
  private tryStep(before: Capsule, movement: Vector3): void {
    // Probe beyond the capsule's leading edge. A center-only ray stays on
    // the lower tread while the rounded body already touches the riser.
    // Keep the existing height limit; sweep the lifted capsule so this cannot
    // skip a wall or a low ceiling, even when the final landing is clear.
    const horizontal = new Vector3(movement.x, 0, movement.z)
    if (horizontal.lengthSq() < 1e-10) return
    const advance = horizontal.clone().normalize().multiplyScalar(this.radius + .055)
    const feetY = before.start.y - this.radius
    const ray = new Ray(new Vector3(before.start.x + advance.x, feetY + .37, before.start.z + advance.z), new Vector3(0, -1, 0))
    const floor = this.octree.rayIntersect(ray)
    if (!floor || floor.distance > .4 || floor.triangle.getNormal(new Vector3()).y < .5) return
    const rise = floor.position.y - feetY
    if (rise < .015 || rise > .34) return
    const candidate = before.clone()
    for (const lift of [.085, .17, .255, .34]) {
      candidate.copy(before); candidate.translate(new Vector3(0, lift, 0))
      if (this.octree.capsuleIntersect(candidate)) return
    }
    for (const fraction of [.25, .5, .75, 1]) {
      candidate.copy(before); candidate.translate(new Vector3(advance.x * fraction, .34, advance.z * fraction))
      if (this.octree.capsuleIntersect(candidate)) return
    }
    candidate.translate(new Vector3(0, rise - .34 + .002, 0))
    if (this.octree.capsuleIntersect(candidate)) return
    this.capsule.copy(candidate); this.velocity.y = 0; this.grounded = true
  }
}
