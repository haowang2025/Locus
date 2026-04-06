import {
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PerspectiveCamera,
  Quaternion,
  Ray,
  Raycaster,
  Scene,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { Capsule } from 'three/examples/jsm/math/Capsule.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

import type { LocusId } from '../lib/types'
import { LOCUS_COUNT, locusIdFromRouteIndex } from '../lib/loci'
import { createDust2BlockoutWorld } from './dust2blockout'
import { loadDust2GlbWorld } from './dust2glb'
import { loadDust2ObjWorld } from './dust2obj'

import { CombinedInputAdapter } from './CombinedInputAdapter'
import type { InputAdapter } from './InputManager'
import { KeyboardMouseAdapter } from './KeyboardMouseAdapter'
import { TouchAdapter } from './TouchAdapter'
import { AudioManager } from './AudioManager'

export type VrUiActionId = 'reveal' | 'rate0' | 'rate1' | 'rate2' | 'exit'
export type VrUiButtonTone = 'neutral' | 'primary' | 'danger'
export type VrUiButtonSpec = { id: VrUiActionId; label: string; tone?: VrUiButtonTone }
export type VrCardUiSpec = { title: string; body: string; buttons: VrUiButtonSpec[] }

export class FpsWorld {
  private container: HTMLElement
  private renderer: WebGLRenderer
  private scene: Scene
  private camera: PerspectiveCamera
  private xrRig: Group
  private worldGroup: Group
  private defaultWorldGroup: Group
  private worldOctree: Octree

  private xrSession: XRSession | null = null
  private onVrChange?: (active: boolean) => void
  private onInteract?: () => void
  private disposed = false

  private markerRoots = new Map<LocusId, Group>()
  private markerRings = new Map<LocusId, Mesh>()
  private markerBarrels = new Map<LocusId, Mesh>()
  private locusModels = new Map<LocusId, Object3D>()
  private filled = new Set<LocusId>()
  private ringMat: MeshStandardMaterial
  private ringMatFilled: MeshStandardMaterial
  private vrCardCanvas: HTMLCanvasElement | null = null
  private vrCardCtx: CanvasRenderingContext2D | null = null
  private vrCardTexture: CanvasTexture | null = null
  private vrCardMesh: Mesh | null = null
  private vrCardUi: VrCardUiSpec | null = null
  private vrUiHovered: VrUiActionId | null = null
  private vrUiRects: Array<{ id: VrUiActionId; x: number; y: number; w: number; h: number }> = []
  private audio = new AudioManager()
  private fadeMesh: Mesh | null = null
  private fadeMat: MeshBasicMaterial | null = null
  private fadePhase: 'idle' | 'out' | 'in' = 'idle'
  private fadeT = 0
  private fadePending: (() => void) | null = null
  private running = false

  private yaw = 0
  private pitch = 0
  private raycaster = new Raycaster()
  private aimRay = new Ray()
  private tmpViewerPos = new Vector3()
  private tmpViewerDir = new Vector3()
  private tmpEuler = new Euler(0, 0, 0, 'YXZ')

  private input: InputAdapter
  private runHeld = false
  private runToggled = false

  private teleportHolding = false
  private teleportValid = false
  private teleportTarget = new Vector3()
  private teleportNormal = new Vector3()
  private teleportCapsule = new Capsule(new Vector3(), new Vector3(), 0.35)
  private teleportMatOk = new MeshBasicMaterial({ color: 0x2e7c4a, transparent: true, opacity: 0.95 })
  private teleportMatBad = new MeshBasicMaterial({ color: 0x9b2c2c, transparent: true, opacity: 0.95 })
  private teleportReticle: Mesh

  private leftHandWasFist = false
  private lastPointTeleportAt = 0

  private playerCollider: Capsule
  private playerVelocity = new Vector3()
  private playerDirection = new Vector3()
  private playerOnFloor = false

  private moveVec = new Vector2()

  private lastT = performance.now()

  private lociPos = new Map<LocusId, Vector3>()
  private lociMarkerPos = new Map<LocusId, Vector3>()
  private lociYaw = new Map<LocusId, number>()
  private defaultLociPos = new Map<LocusId, Vector3>()
  private defaultLociMarkerPos = new Map<LocusId, Vector3>()
  private defaultLociYaw = new Map<LocusId, number>()

  private nearLocusId: LocusId | null = null
  private onNearChange?: (locusId: LocusId | null) => void

  constructor(params: {
    container: HTMLElement
    onNearChange?: (locusId: LocusId | null) => void
    onVrChange?: (active: boolean) => void
    onInteract?: () => void
    input?: InputAdapter
  }) {
    this.container = params.container
    this.onNearChange = params.onNearChange
    this.onVrChange = params.onVrChange
    this.onInteract = params.onInteract

    const { group, loci } = createDust2BlockoutWorld()
    this.worldGroup = group
    this.defaultWorldGroup = group

    this.scene = new Scene()
    this.scene.background = new Color(0xbfd6e6)

    this.camera = new PerspectiveCamera(70, 1, 0.05, 250)
    this.camera.rotation.order = 'YXZ'
    this.camera.position.set(0, 1.6, 0)

    this.xrRig = new Group()
    this.xrRig.add(this.camera)
    this.scene.add(this.xrRig)

    this.initVrCard()
    this.initFadeOverlay()

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.domElement.classList.add('three-canvas')
    this.container.appendChild(this.renderer.domElement)
    this.renderer.xr.enabled = true
    this.renderer.xr.setReferenceSpaceType('local-floor')

    this.input = params.input ?? new CombinedInputAdapter([new KeyboardMouseAdapter(), new TouchAdapter()])

    this.scene.add(new AmbientLight(0xffffff, 0.65))
    const sun = new DirectionalLight(0xffffff, 0.85)
    sun.position.set(20, 40, 10)
    this.scene.add(sun)

    this.scene.add(this.worldGroup)

    this.worldOctree = this.buildOctreeFromWorld(this.worldGroup)

    this.playerCollider = new Capsule(new Vector3(0, 0.35, 0), new Vector3(0, 1.6, 0), 0.35)

    const barrelMat = new MeshStandardMaterial({ color: 0xd1c4a6, roughness: 0.6, metalness: 0 })
    this.ringMat = new MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.6 })
    this.ringMatFilled = new MeshStandardMaterial({
      color: 0x2e7c4a,
      roughness: 0.6,
      metalness: 0,
      transparent: true,
      opacity: 0.75,
    })

    const barrelGeo = new CylinderGeometry(0.32, 0.32, 0.8, 12)
    const ringGeo = new TorusGeometry(0.78, 0.06, 10, 24)

    const reticleGeo = new TorusGeometry(0.28, 0.03, 10, 28)
    this.teleportReticle = new Mesh(reticleGeo, this.teleportMatOk)
    this.teleportReticle.rotation.x = Math.PI / 2
    this.teleportReticle.visible = false
    this.scene.add(this.teleportReticle)

    const markers = new Group()
    for (const locus of loci) {
      const basePos = new Vector3(locus.position.x, locus.position.y, locus.position.z)
      const markerPos = locus.markerPosition
        ? new Vector3(locus.markerPosition.x, locus.markerPosition.y, locus.markerPosition.z)
        : basePos.clone()
      this.lociPos.set(locus.locusId, basePos.clone())
      this.lociMarkerPos.set(locus.locusId, markerPos.clone())
      this.lociYaw.set(locus.locusId, locus.yaw)
      this.defaultLociPos.set(locus.locusId, basePos)
      this.defaultLociMarkerPos.set(locus.locusId, markerPos)
      this.defaultLociYaw.set(locus.locusId, locus.yaw)

      const root = new Group()
      root.position.copy(markerPos)

      const ring = new Mesh(ringGeo, this.ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(0, 0.04, 0)
      ring.userData.locusId = locus.locusId
      root.add(ring)
      this.markerRings.set(locus.locusId, ring)

      const barrel = new Mesh(barrelGeo, barrelMat)
      barrel.position.set(0, 0.4, 0)
      barrel.userData.locusId = locus.locusId
      root.add(barrel)
      this.markerBarrels.set(locus.locusId, barrel)

      this.markerRoots.set(locus.locusId, root)
      markers.add(root)
    }
    this.scene.add(markers)

    this.attachEvents()
    this.resize()
    this.initXrInputs()

    const startLocus = locusIdFromRouteIndex(1)
    this.teleportTo(startLocus)
  }

  dispose() {
    this.disposed = true
    this.running = false
    this.onVrChange = undefined
    this.onInteract = undefined
    const session = this.xrSession ?? this.renderer.xr.getSession()
    session?.removeEventListener('end', this.onXrSessionEnd)
    void session?.end().catch(() => {
      // ignore
    })

    this.renderer.setAnimationLoop(null)
    this.detachEvents()
    this.clearAllLocusModels()
    this.disposeVrCard()
    this.disposeFadeOverlay()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  getCanvasElement() {
    return this.renderer.domElement
  }

  start() {
    this.running = true
    this.lastT = performance.now()
    this.renderer.setAnimationLoop((t) => {
      const now = typeof t === 'number' ? t : performance.now()
      const dt = Math.min(0.05, (now - this.lastT) / 1000)
      this.lastT = now

      this.step(dt)
      this.updateVr()
      this.renderer.render(this.scene, this.camera)
    })
  }

  setRunToggled(value: boolean) {
    this.runToggled = value
  }

  setMoveVector(x: number, y: number) {
    this.moveVec.set(x, y)
  }

  setFilledLoci(filled: Set<LocusId>) {
    this.filled = new Set(filled)
    for (const [id, ring] of this.markerRings.entries()) {
      ring.material = this.filled.has(id) ? this.ringMatFilled : this.ringMat
    }
  }

  clearLocusModel(locusId: LocusId) {
    const existing = this.locusModels.get(locusId)
    if (!existing) return
    existing.removeFromParent()
    this.locusModels.delete(locusId)
    const barrel = this.markerBarrels.get(locusId)
    if (barrel) barrel.visible = true
  }

  clearAllLocusModels() {
    for (const id of Array.from(this.locusModels.keys())) {
      this.clearLocusModel(id)
    }
  }

  showVrCard(text: string) {
    if (!this.vrCardCtx || !this.vrCardTexture || !this.vrCardMesh || !this.vrCardCanvas) return
    this.vrCardUi = null
    this.vrUiHovered = null
    this.vrUiRects = []
    this.drawVrCardText(text)
    this.vrCardTexture.needsUpdate = true
    this.vrCardMesh.visible = true
  }

  showVrCardUi(ui: VrCardUiSpec) {
    if (!this.vrCardCtx || !this.vrCardTexture || !this.vrCardMesh || !this.vrCardCanvas) return
    this.vrCardUi = ui
    this.vrUiHovered = null
    this.drawVrCardUi(ui, null)
    this.vrCardTexture.needsUpdate = true
    this.vrCardMesh.visible = true
  }

  hideVrCard() {
    if (this.vrCardMesh) this.vrCardMesh.visible = false
    this.vrCardUi = null
    this.vrUiHovered = null
    this.vrUiRects = []
  }

  getVrUiHoveredAction(): VrUiActionId | null {
    return this.vrUiHovered
  }

  playHitFeedback() {
    this.audio.hitSound()
    this.vibrate(40)
    this.pulseXrHaptics('right', 0.45, 60)
  }

  playRevealFeedback() {
    this.audio.revealSound()
    this.vibrate(30)
    this.pulseXrHaptics('right', 0.35, 80)
  }

  async setLocusModel(locusId: LocusId, blob: Blob, scale: number): Promise<void> {
    const root = this.markerRoots.get(locusId)
    if (!root) return

    const buffer = await blob.arrayBuffer()
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      const loader = new GLTFLoader()
      loader.parse(buffer, '', (result) => resolve(result), reject)
    })

    const model = gltf.scene as Object3D | undefined
    if (!model) throw new Error('GLB 解析失败：缺少 scene')

    model.traverse((obj) => {
      obj.userData.locusId = locusId
    })

    const clampedScale = Math.max(0.01, Math.min(10, Number.isFinite(scale) ? scale : 1))
    model.scale.setScalar(clampedScale)

    this.clearLocusModel(locusId)

    // Place the model on the marker root plane: center in XZ and rest on Y=0.
    model.position.set(0, 0, 0)
    model.updateWorldMatrix(true, true)
    const bbox = new Box3().setFromObject(model)
    if (!bbox.isEmpty()) {
      const center = new Vector3()
      bbox.getCenter(center)
      model.position.set(-center.x, -bbox.min.y, -center.z)
    }

    root.add(model)
    this.locusModels.set(locusId, model)
    const barrel = this.markerBarrels.get(locusId)
    if (barrel) barrel.visible = false
  }

  isVrPresenting() {
    return Boolean(this.renderer.xr.isPresenting)
  }

  async enterVr(opts?: { domOverlayRoot?: HTMLElement }) {
    if (this.renderer.xr.isPresenting) return
    if (!('xr' in navigator) || !navigator.xr) {
      throw new Error('WebXR 不可用：当前环境不支持 navigator.xr')
    }

    const supported = await navigator.xr.isSessionSupported('immersive-vr')
    if (!supported) throw new Error('WebXR 不可用：不支持 immersive-vr')

    const init: any = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking', 'dom-overlay'],
    }
    if (opts?.domOverlayRoot) {
      init.domOverlay = { root: opts.domOverlayRoot }
    }

    document.exitPointerLock?.()
    this.moveVec.set(0, 0)
    this.runHeld = false
    this.input.reset()

    const session = await navigator.xr.requestSession('immersive-vr', init)
    session.addEventListener('end', this.onXrSessionEnd)
    await this.renderer.xr.setSession(session)
    this.xrSession = session
    this.onVrChange?.(true)
    this.syncRigToCollider()
  }

  async exitVr() {
    const session = this.xrSession ?? this.renderer.xr.getSession()
    await session?.end()
  }

  teleportTo(locusId: LocusId) {
    this.scheduleTeleport(() => this.teleportToImmediate(locusId))
  }

  private teleportToImmediate(locusId: LocusId) {
    const pos = this.lociPos.get(locusId)
    if (!pos) return

    const y = pos.y
    this.playerCollider.start.set(pos.x, y + 0.35, pos.z)
    this.playerCollider.end.set(pos.x, y + 1.6, pos.z)
    this.playerVelocity.set(0, 0, 0)

    const baseYaw = this.lociYaw.get(locusId) ?? 0
    const headYaw = this.getHeadYawLocal()
    this.yaw = baseYaw - headYaw
    this.pitch = 0
    this.applyLook()
    this.syncRigToCollider()
    if (this.running) this.playTeleportFeedback()
    this.updateNearLocus()
  }

  teleportNearAndAim(locusId: LocusId, opts?: { distance?: number }) {
    this.scheduleTeleport(() => this.teleportNearAndAimImmediate(locusId, opts))
  }

  private teleportNearAndAimImmediate(locusId: LocusId, opts?: { distance?: number }) {
    const targetPos = this.lociPos.get(locusId)
    if (!targetPos) return

    const distance = Math.max(1.2, Math.min(8, opts?.distance ?? 3))
    const baseYaw = this.lociYaw.get(locusId) ?? 0
    const baseY = targetPos.y

    const aimTarget = new Vector3(targetPos.x, baseY + 0.85, targetPos.z)
    const markerRoot = this.markerRoots.get(locusId)
    if (markerRoot) {
      // Aim slightly above the marker root, i.e. around the crate/barrel "chest" height.
      aimTarget.set(markerRoot.position.x, markerRoot.position.y + 0.85, markerRoot.position.z)
    }

    const offsets = [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]

    const chosen = new Vector3(targetPos.x, baseY, targetPos.z)
    let found = false

    for (const addYaw of offsets) {
      const yaw = baseYaw + addYaw
      // Forward for yaw is (-sin(yaw), 0, -cos(yaw)); to stand "in front" of target, go opposite.
      const dirX = -Math.sin(yaw)
      const dirZ = -Math.cos(yaw)
      const candX = targetPos.x - dirX * distance
      const candZ = targetPos.z - dirZ * distance

      const testCapsule = new Capsule(new Vector3(candX, baseY + 0.35, candZ), new Vector3(candX, baseY + 1.6, candZ), 0.35)
      const hit = this.worldOctree.capsuleIntersect(testCapsule)
      if (hit) continue

      chosen.set(candX, baseY, candZ)
      found = true
      break
    }

    if (!found) {
      // Fall back to exact locus position; still apply aim.
      chosen.set(targetPos.x, baseY, targetPos.z)
    }

    this.playerCollider.start.set(chosen.x, baseY + 0.35, chosen.z)
    this.playerCollider.end.set(chosen.x, baseY + 1.6, chosen.z)
    this.playerVelocity.set(0, 0, 0)

    const eye = this.playerCollider.end
    const dx = aimTarget.x - eye.x
    const dy = aimTarget.y - eye.y
    const dz = aimTarget.z - eye.z
    const len = Math.hypot(dx, dy, dz)
    if (len > 1e-6) {
      const ny = dy / len
      const desiredYaw = Math.atan2(dx, dz) + Math.PI
      const headYaw = this.getHeadYawLocal()
      this.yaw = desiredYaw - headYaw
      this.pitch = this.renderer.xr.isPresenting ? 0 : Math.asin(Math.max(-0.999, Math.min(0.999, ny)))
    } else {
      const headYaw = this.getHeadYawLocal()
      this.yaw = baseYaw - headYaw
      this.pitch = 0
    }

    this.applyLook()
    this.syncRigToCollider()
    if (this.running) this.playTeleportFeedback()
    this.updateNearLocus()
  }

  fire(): LocusId | null {
    this.updateAimRay()
    this.raycaster.ray.origin.copy(this.aimRay.origin)
    this.raycaster.ray.direction.copy(this.aimRay.direction)
    this.raycaster.near = 0
    this.raycaster.far = 14
    const targets = Array.from(this.markerRoots.values())
    const hits = this.raycaster.intersectObjects(targets, true)
    const hit = hits[0]
    if (!hit) return null
    if (hit.distance > 14) return null
    const id = hit.object.userData.locusId as LocusId | undefined
    return id ?? null
  }

  private onXrSessionEnd = () => {
    this.xrSession?.removeEventListener('end', this.onXrSessionEnd)
    this.xrSession = null
    this.teleportHolding = false
    this.teleportValid = false
    this.teleportReticle.visible = false
    this.hideVrCard()
    this.leftHandWasFist = false
    if (!this.disposed) this.onVrChange?.(false)
    this.syncRigToCollider()
  }

  private playTeleportFeedback() {
    this.audio.teleportSound()
    this.vibrate(35)
    this.pulseXrHaptics('left', 0.3, 120)
  }

  private vibrate(durationMs: number) {
    if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') return
    try {
      navigator.vibrate(durationMs)
    } catch {
      // ignore
    }
  }

  private pulseXrHaptics(handedness: XRHandedness, intensity: number, durationMs: number) {
    if (!this.renderer.xr.isPresenting) return
    const session = this.renderer.xr.getSession()
    if (!session) return

    for (const source of session.inputSources) {
      if (handedness !== 'none' && source.handedness !== handedness) continue
      const actuator = source.gamepad?.hapticActuators?.[0]
      if (!actuator) continue
      void actuator.pulse(intensity, durationMs).catch(() => {
        // ignore
      })
      break
    }
  }

  private initFadeOverlay() {
    const mat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
    const geo = new PlaneGeometry(4, 4)
    const mesh = new Mesh(geo, mat)
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.renderOrder = 1000
    mesh.position.set(0, 0, -0.2)
    this.camera.add(mesh)

    this.fadeMesh = mesh
    this.fadeMat = mat
  }

  private disposeFadeOverlay() {
    const mesh = this.fadeMesh
    mesh?.removeFromParent()
    if (mesh) {
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m.dispose()
      } else {
        mesh.material.dispose()
      }
    }

    this.fadeMesh = null
    this.fadeMat = null
    this.fadePhase = 'idle'
    this.fadeT = 0
    this.fadePending = null
  }

  private scheduleTeleport(perform: () => void) {
    if (!this.running || !this.fadeMesh || !this.fadeMat) {
      perform()
      return
    }

    const outDur = 0.2

    if (this.fadePhase === 'out') {
      this.fadePending = perform
      return
    }

    if (this.fadePhase === 'in') {
      // Reverse back to fade-out while keeping continuity.
      const currentOpacity = this.fadeMat.opacity
      this.fadePhase = 'out'
      this.fadePending = perform
      this.fadeT = currentOpacity * outDur
      this.fadeMesh.visible = true
      return
    }

    this.fadePending = perform
    this.fadePhase = 'out'
    this.fadeT = 0
    this.fadeMat.opacity = 0
    this.fadeMesh.visible = true
  }

  private updateFade(dt: number) {
    const mat = this.fadeMat
    const mesh = this.fadeMesh
    if (!mat || !mesh) return
    if (this.fadePhase === 'idle') return

    const outDur = 0.2
    const inDur = 0.2

    this.fadeT += dt

    if (this.fadePhase === 'out') {
      const t = Math.min(1, this.fadeT / outDur)
      mat.opacity = t
      mesh.visible = true
      if (t >= 1) {
        const cb = this.fadePending
        this.fadePending = null
        cb?.()
        this.fadePhase = 'in'
        this.fadeT = 0
        mat.opacity = 1
      }
      return
    }

    // 'in'
    const t = Math.min(1, this.fadeT / inDur)
    mat.opacity = 1 - t
    if (t >= 1) {
      this.fadePhase = 'idle'
      this.fadeT = 0
      mat.opacity = 0
      mesh.visible = false
    }
  }

  private initVrCard() {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 384
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const texture = new CanvasTexture(canvas)
    const mat = new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
    const geo = new PlaneGeometry(1.2, 0.9)
    const mesh = new Mesh(geo, mat)
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.renderOrder = 999
    mesh.position.set(0, 1.55, -1.55)
    this.xrRig.add(mesh)

    this.vrCardCanvas = canvas
    this.vrCardCtx = ctx
    this.vrCardTexture = texture
    this.vrCardMesh = mesh
  }

  private disposeVrCard() {
    const mesh = this.vrCardMesh
    mesh?.removeFromParent()
    if (mesh) {
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m.dispose()
      } else {
        mesh.material.dispose()
      }
    }
    this.vrCardMesh = null
    this.vrCardCtx = null
    this.vrCardCanvas = null
    this.vrCardTexture?.dispose()
    this.vrCardTexture = null
  }

  private drawVrCardText(text: string) {
    if (!this.vrCardCtx || !this.vrCardCanvas) return
    const ctx = this.vrCardCtx
    const w = this.vrCardCanvas.width
    const h = this.vrCardCanvas.height
    const pad = 18

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(13, 18, 34, 0.95)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(69, 128, 255, 0.55)'
    ctx.lineWidth = 4
    ctx.strokeRect(4, 4, w - 8, h - 8)

    ctx.fillStyle = '#e6e9f2'
    ctx.font = '24px sans-serif'
    ctx.textBaseline = 'top'

    const maxWidth = w - pad * 2
    const lineHeight = 30
    const maxLines = Math.max(1, Math.floor((h - pad * 2) / lineHeight))

    const lines: string[] = []
    let truncated = false

    for (const para of text.split('\n')) {
      if (lines.length >= maxLines) {
        truncated = true
        break
      }
      if (!para) {
        lines.push('')
        continue
      }

      let line = ''
      for (const ch of Array.from(para)) {
        const next = line + ch
        if (ctx.measureText(next).width > maxWidth && line) {
          lines.push(line)
          line = ch
          if (lines.length >= maxLines) {
            truncated = true
            break
          }
        } else {
          line = next
        }
      }
      if (truncated) break
      if (line) lines.push(line)
    }

    const finalLines = lines.slice(0, maxLines)
    if (truncated && finalLines.length > 0) {
      const last = finalLines[finalLines.length - 1]
      finalLines[finalLines.length - 1] = last.length > 1 ? `${last.slice(0, Math.max(1, last.length - 1))}…` : '…'
    }

    for (let i = 0; i < finalLines.length; i++) {
      ctx.fillText(finalLines[i], pad, pad + i * lineHeight)
    }
  }

  private drawVrCardUi(ui: VrCardUiSpec, hovered: VrUiActionId | null) {
    if (!this.vrCardCtx || !this.vrCardCanvas) return
    const ctx = this.vrCardCtx
    const w = this.vrCardCanvas.width
    const h = this.vrCardCanvas.height
    const pad = 18

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(13, 18, 34, 0.95)'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(69, 128, 255, 0.55)'
    ctx.lineWidth = 4
    ctx.strokeRect(4, 4, w - 8, h - 8)

    let y = pad
    ctx.fillStyle = '#e6e9f2'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    if (ui.title) {
      ctx.font = 'bold 26px sans-serif'
      ctx.fillText(ui.title, pad, y)
      y += 36
    }

    const buttonHeight = 52
    const buttonGap = 10
    const buttonRowY = h - pad - buttonHeight

    const bodyTop = y
    const bodyHeight = Math.max(0, buttonRowY - bodyTop - 12)
    const lineHeight = 28
    const maxLines = Math.max(1, Math.floor(bodyHeight / lineHeight))
    const maxWidth = w - pad * 2

    ctx.font = '22px sans-serif'

    const lines: string[] = []
    let truncated = false

    for (const para of ui.body.split('\n')) {
      if (lines.length >= maxLines) {
        truncated = true
        break
      }
      if (!para) {
        lines.push('')
        continue
      }

      let line = ''
      for (const ch of Array.from(para)) {
        const next = line + ch
        if (ctx.measureText(next).width > maxWidth && line) {
          lines.push(line)
          line = ch
          if (lines.length >= maxLines) {
            truncated = true
            break
          }
        } else {
          line = next
        }
      }
      if (truncated) break
      if (line) lines.push(line)
    }

    const finalLines = lines.slice(0, maxLines)
    if (truncated && finalLines.length > 0) {
      const last = finalLines[finalLines.length - 1]
      finalLines[finalLines.length - 1] = last.length > 1 ? `${last.slice(0, Math.max(1, last.length - 1))}…` : '…'
    }

    for (let i = 0; i < finalLines.length; i++) {
      ctx.fillText(finalLines[i], pad, bodyTop + i * lineHeight)
    }

    this.vrUiRects = []
    const buttons = ui.buttons ?? []
    if (buttons.length === 0) return

    const availW = w - pad * 2
    const n = buttons.length
    const btnW = (availW - buttonGap * (n - 1)) / n

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '22px sans-serif'

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]
      const tone: VrUiButtonTone = b.tone ?? 'neutral'
      const x = pad + i * (btnW + buttonGap)
      const y0 = buttonRowY
      this.vrUiRects.push({ id: b.id, x, y: y0, w: btnW, h: buttonHeight })

      const isHovered = hovered === b.id
      const fill =
        tone === 'primary'
          ? isHovered
            ? 'rgba(69, 128, 255, 0.92)'
            : 'rgba(69, 128, 255, 0.7)'
          : tone === 'danger'
            ? isHovered
              ? 'rgba(155, 44, 44, 0.92)'
              : 'rgba(155, 44, 44, 0.7)'
            : isHovered
              ? 'rgba(255, 255, 255, 0.26)'
              : 'rgba(255, 255, 255, 0.14)'

      ctx.fillStyle = fill
      ctx.fillRect(x, y0, btnW, buttonHeight)
      ctx.strokeStyle = isHovered ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.18)'
      ctx.lineWidth = isHovered ? 4 : 2
      ctx.strokeRect(x + 1, y0 + 1, btnW - 2, buttonHeight - 2)

      ctx.fillStyle = '#e6e9f2'
      ctx.fillText(b.label, x + btnW / 2, y0 + buttonHeight / 2)
    }
  }

  private updateVrUiHover() {
    if (!this.renderer.xr.isPresenting) return
    if (!this.vrCardMesh || !this.vrCardMesh.visible) return
    if (!this.vrCardUi || this.vrUiRects.length === 0) return
    if (!this.vrCardCtx || !this.vrCardCanvas || !this.vrCardTexture) return

    this.updateAimRay()
    this.raycaster.ray.origin.copy(this.aimRay.origin)
    this.raycaster.ray.direction.copy(this.aimRay.direction)
    this.raycaster.near = 0
    this.raycaster.far = 5
    const hit = this.raycaster.intersectObject(this.vrCardMesh, false)[0] as any

    let next: VrUiActionId | null = null
    const uv: Vector2 | undefined = hit?.uv
    if (uv) {
      const x = uv.x * this.vrCardCanvas.width
      const y = (1 - uv.y) * this.vrCardCanvas.height
      for (const r of this.vrUiRects) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          next = r.id
          break
        }
      }
    }

    if (next === this.vrUiHovered) return
    this.vrUiHovered = next
    this.drawVrCardUi(this.vrCardUi, next)
    this.vrCardTexture.needsUpdate = true
  }

  private initXrInputs() {
    // Controllers
    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i) as any
      ctrl.addEventListener('connected', (e: any) => {
        ctrl.userData.handedness = e?.data?.handedness ?? 'none'
      })
      ctrl.addEventListener('disconnected', () => {
        ctrl.userData.handedness = 'none'
      })
      ctrl.addEventListener('selectstart', this.onXrSelectStart)
      ctrl.addEventListener('selectend', this.onXrSelectEnd)
      ctrl.addEventListener('squeezestart', this.onXrSqueezeStart)
      this.xrRig.add(ctrl)
    }

    // Hands (hand-tracking): Three.js emits custom `pinchstart/pinchend` events.
    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i) as any
      hand.addEventListener('connected', (e: any) => {
        hand.userData.handedness = e?.data?.handedness ?? 'none'
      })
      hand.addEventListener('disconnected', () => {
        hand.userData.handedness = 'none'
      })
      hand.addEventListener('pinchstart', this.onXrPinchStart)
      hand.addEventListener('pinchend', this.onXrPinchEnd)
      this.xrRig.add(hand)
    }
  }

  private onXrSelectStart = (e: any) => {
    const handedness = e?.data?.handedness ?? 'none'
    if (handedness === 'right') {
      this.onInteract?.()
      return
    }
    if (handedness === 'left') {
      this.beginFreeTeleport()
    }
  }

  private onXrSelectEnd = (e: any) => {
    const handedness = e?.data?.handedness ?? 'none'
    if (handedness === 'left') this.endFreeTeleport()
  }

  private onXrSqueezeStart = (e: any) => {
    const handedness = e?.data?.handedness ?? 'none'
    if (handedness !== 'left') return
    if (!this.renderer.xr.isPresenting) return
    this.tryPointTeleport()
  }

  private onXrPinchStart = (e: any) => {
    const handedness = e?.handedness ?? 'none'
    if (handedness === 'right') {
      this.onInteract?.()
      return
    }
    if (handedness === 'left') this.beginFreeTeleport()
  }

  private onXrPinchEnd = (e: any) => {
    const handedness = e?.handedness ?? 'none'
    if (handedness === 'left') this.endFreeTeleport()
  }

  private beginFreeTeleport() {
    if (!this.renderer.xr.isPresenting) return
    this.teleportHolding = true
  }

  private endFreeTeleport() {
    if (!this.renderer.xr.isPresenting) return
    if (this.teleportHolding && this.teleportValid) {
      this.teleportToPosition(this.teleportTarget)
    }
    this.teleportHolding = false
    this.teleportValid = false
    this.teleportReticle.visible = false
  }

  private tryPointTeleport() {
    const now = performance.now()
    if (now - this.lastPointTeleportAt < 650) return
    const hit = this.fire()
    if (!hit) return
    this.lastPointTeleportAt = now
    this.teleportNearAndAim(hit)
  }

  private teleportToPosition(pos: Vector3) {
    const next = pos.clone()
    this.scheduleTeleport(() => this.teleportToPositionImmediate(next))
  }

  private teleportToPositionImmediate(pos: Vector3) {
    const y = pos.y
    this.playerCollider.start.set(pos.x, y + 0.35, pos.z)
    this.playerCollider.end.set(pos.x, y + 1.6, pos.z)
    this.playerVelocity.set(0, 0, 0)
    this.syncRigToCollider()
    this.updateNearLocus()
    if (this.running) this.playTeleportFeedback()
  }

  private getHeadYawLocal() {
    if (!this.renderer.xr.isPresenting) return 0
    this.tmpEuler.setFromQuaternion(this.camera.quaternion, 'YXZ')
    return this.tmpEuler.y
  }

  private updateAimRay() {
    this.getViewerWorldPosition(this.tmpViewerPos)
    this.getViewerWorldDirection(this.tmpViewerDir)
    this.aimRay.origin.copy(this.tmpViewerPos)
    this.aimRay.direction.copy(this.tmpViewerDir).normalize()
  }

  private updateVr() {
    if (!this.renderer.xr.isPresenting) {
      this.teleportReticle.visible = false
      this.teleportHolding = false
      this.leftHandWasFist = false
      this.vrUiHovered = null
      return
    }

    this.updateFreeTeleportPreview()
    this.updateLeftHandFist()
    this.updateVrUiHover()
  }

  private updateFreeTeleportPreview() {
    if (!this.teleportHolding) {
      this.teleportReticle.visible = false
      return
    }

    this.updateAimRay()
    const hit: any = this.worldOctree.rayIntersect(this.aimRay)
    if (!hit || !hit.position || !hit.triangle) {
      this.teleportValid = false
      this.teleportReticle.visible = false
      return
    }

    hit.triangle.getNormal(this.teleportNormal)
    this.teleportNormal.normalize()
    if (this.teleportNormal.y < 0.6) {
      this.teleportValid = false
      this.teleportReticle.visible = false
      return
    }

    if (typeof hit.distance === 'number' && hit.distance > 30) {
      this.teleportValid = false
      this.teleportReticle.visible = false
      return
    }

    const targetY = hit.position.y
    this.teleportCapsule.start.set(hit.position.x, targetY + 0.35, hit.position.z)
    this.teleportCapsule.end.set(hit.position.x, targetY + 1.6, hit.position.z)

    const col = this.worldOctree.capsuleIntersect(this.teleportCapsule)
    this.teleportValid = !col
    this.teleportTarget.set(hit.position.x, hit.position.y, hit.position.z)

    this.teleportReticle.visible = true
    this.teleportReticle.material = this.teleportValid ? this.teleportMatOk : this.teleportMatBad
    this.teleportReticle.position.set(hit.position.x, hit.position.y + 0.02, hit.position.z)
  }

  private updateLeftHandFist() {
    if (this.teleportHolding) {
      this.leftHandWasFist = false
      return
    }

    const leftHand = this.findHandByHandedness('left')
    const isFist = leftHand ? this.isHandFist(leftHand) : false
    if (isFist && !this.leftHandWasFist) {
      this.tryPointTeleport()
    }
    this.leftHandWasFist = isFist
  }

  private findHandByHandedness(handedness: 'left' | 'right') {
    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i) as any
      if (!hand?.visible) continue
      if ((hand.userData?.handedness ?? 'none') !== handedness) continue
      return hand
    }
    return null
  }

  private isHandFist(hand: any) {
    // Very simple heuristic: all fingertips are close to wrist.
    const joints = hand?.joints
    if (!joints) return false
    const wrist = joints['wrist']
    if (!wrist || !wrist.visible) return false

    const tips = ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip']
    const wristPos: Vector3 = wrist.position
    const threshold = 0.115

    // Avoid treating pinch as fist.
    if (hand?.inputState?.pinching) return false

    for (const name of tips) {
      const tip = joints[name]
      if (!tip || !tip.visible) return false
      if (wristPos.distanceTo(tip.position) > threshold) return false
    }

    return true
  }

  async loadCustomMapFromBlob(blob: Blob): Promise<{ anchorCount: number }> {
    const buffer = await blob.arrayBuffer()
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      const loader = new GLTFLoader()
      loader.parse(buffer, '', (result) => resolve(result), reject)
    })

    const nextWorld = gltf.scene as Group
    if (!nextWorld) throw new Error('GLB 解析失败：缺少 scene')
    nextWorld.updateWorldMatrix(true, true)

    const anchors = new Map<LocusId, Object3D>()
    nextWorld.traverse((obj) => {
      const name = (obj.name || '').trim()
      const m = /^L(\d{2})$/.exec(name)
      if (!m) return
      const id = `L${m[1]}` as LocusId
      if (!anchors.has(id)) anchors.set(id, obj)
    })

    const missing: string[] = []
    for (let i = 1; i <= LOCUS_COUNT; i++) {
      const id = locusIdFromRouteIndex(i)
      if (!anchors.has(id)) missing.push(id)
    }
    if (missing.length > 0) {
      throw new Error(`GLB 缺少锚点：${missing.join(', ')}`)
    }

    const collisionRoot = this.findCollisionRoot(nextWorld)
    if (collisionRoot) {
      collisionRoot.traverse((obj) => {
        obj.visible = false
      })
    }

    const nextOctree = new Octree()
    nextOctree.fromGraphNode((collisionRoot ?? nextWorld) as any)

    const nextLociPos = new Map<LocusId, Vector3>()
    const nextLociMarkerPos = new Map<LocusId, Vector3>()
    const nextLociYaw = new Map<LocusId, number>()
    const tmpPos = new Vector3()
    const tmpQuat = new Quaternion()
    const tmpFacing = new Vector3()

    for (let i = 1; i <= LOCUS_COUNT; i++) {
      const id = locusIdFromRouteIndex(i)
      const obj = anchors.get(id)!
      obj.getWorldPosition(tmpPos)
      nextLociPos.set(id, tmpPos.clone())
      nextLociMarkerPos.set(id, tmpPos.clone())

      obj.getWorldQuaternion(tmpQuat)
      tmpFacing.set(0, 0, -1).applyQuaternion(tmpQuat)
      tmpFacing.y = 0
      const yaw =
        tmpFacing.lengthSq() > 1e-6 ? Math.atan2(tmpFacing.x, -tmpFacing.z) : this.lociYaw.get(id) ?? this.defaultLociYaw.get(id) ?? 0
      nextLociYaw.set(id, yaw)
    }

    // Commit changes (swap world + octree + loci + marker positions).
    this.scene.remove(this.worldGroup)
    this.worldGroup = nextWorld
    this.scene.add(this.worldGroup)
    this.worldOctree = nextOctree

    this.lociPos = nextLociPos
    this.lociMarkerPos = nextLociMarkerPos
    this.lociYaw = nextLociYaw
    for (const [id, root] of this.markerRoots.entries()) {
      const p = this.lociMarkerPos.get(id) ?? this.lociPos.get(id)
      if (p) root.position.copy(p)
    }

    // Spawn at L01 in the imported map.
    this.teleportTo(locusIdFromRouteIndex(1))

    return { anchorCount: anchors.size }
  }

  clearCustomMap() {
    if (this.worldGroup !== this.defaultWorldGroup) {
      this.scene.remove(this.worldGroup)
      this.worldGroup = this.defaultWorldGroup
      this.scene.add(this.worldGroup)
    }

    this.worldOctree = this.buildOctreeFromWorld(this.worldGroup)

    this.lociPos = new Map(Array.from(this.defaultLociPos.entries()).map(([id, p]) => [id, p.clone()] as const))
    this.lociMarkerPos = new Map(Array.from(this.defaultLociMarkerPos.entries()).map(([id, p]) => [id, p.clone()] as const))
    this.lociYaw = new Map(this.defaultLociYaw)

    for (const [id, root] of this.markerRoots.entries()) {
      const p = this.lociMarkerPos.get(id) ?? this.lociPos.get(id)
      if (p) root.position.copy(p)
    }

    this.teleportTo(locusIdFromRouteIndex(1))
  }

  async loadBuiltinDust2Obj(): Promise<void> {
    const { group: nextWorld, loci } = await loadDust2ObjWorld()
    nextWorld.updateWorldMatrix(true, true)

    const collisionRoot = this.findCollisionRoot(nextWorld)
    const nextOctree = new Octree()
    nextOctree.fromGraphNode((collisionRoot ?? nextWorld) as any)

    const nextLociPos = new Map<LocusId, Vector3>()
    const nextLociMarkerPos = new Map<LocusId, Vector3>()
    const nextLociYaw = new Map<LocusId, number>()
    const nextDefaultLociPos = new Map<LocusId, Vector3>()
    const nextDefaultLociMarkerPos = new Map<LocusId, Vector3>()
    const nextDefaultLociYaw = new Map<LocusId, number>()

    for (const locus of loci) {
      const basePos = new Vector3(locus.position.x, locus.position.y, locus.position.z)
      const markerPos = locus.markerPosition
        ? new Vector3(locus.markerPosition.x, locus.markerPosition.y, locus.markerPosition.z)
        : basePos.clone()
      nextLociPos.set(locus.locusId, basePos.clone())
      nextLociMarkerPos.set(locus.locusId, markerPos.clone())
      nextLociYaw.set(locus.locusId, locus.yaw)
      nextDefaultLociPos.set(locus.locusId, basePos)
      nextDefaultLociMarkerPos.set(locus.locusId, markerPos)
      nextDefaultLociYaw.set(locus.locusId, locus.yaw)
    }

    this.scene.remove(this.worldGroup)
    this.worldGroup = nextWorld
    this.defaultWorldGroup = nextWorld
    this.scene.add(this.worldGroup)

    this.worldOctree = nextOctree

    this.lociPos = nextLociPos
    this.lociMarkerPos = nextLociMarkerPos
    this.lociYaw = nextLociYaw
    this.defaultLociPos = nextDefaultLociPos
    this.defaultLociMarkerPos = nextDefaultLociMarkerPos
    this.defaultLociYaw = nextDefaultLociYaw

    for (const [id, root] of this.markerRoots.entries()) {
      const p = this.lociMarkerPos.get(id) ?? this.lociPos.get(id)
      if (p) root.position.copy(p)
    }

    this.teleportTo(locusIdFromRouteIndex(1))
  }

  async loadBuiltinDust2Glb(): Promise<void> {
    const { group: nextWorld, loci } = await loadDust2GlbWorld()
    nextWorld.updateWorldMatrix(true, true)

    const collisionRoot = this.findCollisionRoot(nextWorld)
    const nextOctree = new Octree()
    nextOctree.fromGraphNode(collisionRoot ?? nextWorld)

    const nextLociPos = new Map<LocusId, Vector3>()
    const nextLociMarkerPos = new Map<LocusId, Vector3>()
    const nextLociYaw = new Map<LocusId, number>()
    const nextDefaultLociPos = new Map<LocusId, Vector3>()
    const nextDefaultLociMarkerPos = new Map<LocusId, Vector3>()
    const nextDefaultLociYaw = new Map<LocusId, number>()

    for (const locus of loci) {
      const basePos = new Vector3(locus.position.x, locus.position.y, locus.position.z)
      const markerPos = locus.markerPosition
        ? new Vector3(locus.markerPosition.x, locus.markerPosition.y, locus.markerPosition.z)
        : basePos.clone()
      nextLociPos.set(locus.locusId, basePos.clone())
      nextLociMarkerPos.set(locus.locusId, markerPos.clone())
      nextLociYaw.set(locus.locusId, locus.yaw)
      nextDefaultLociPos.set(locus.locusId, basePos)
      nextDefaultLociMarkerPos.set(locus.locusId, markerPos)
      nextDefaultLociYaw.set(locus.locusId, locus.yaw)
    }

    this.scene.remove(this.worldGroup)
    this.worldGroup = nextWorld
    this.defaultWorldGroup = nextWorld
    this.scene.add(this.worldGroup)

    this.worldOctree = nextOctree

    this.lociPos = nextLociPos
    this.lociMarkerPos = nextLociMarkerPos
    this.lociYaw = nextLociYaw
    this.defaultLociPos = nextDefaultLociPos
    this.defaultLociMarkerPos = nextDefaultLociMarkerPos
    this.defaultLociYaw = nextDefaultLociYaw

    for (const [id, root] of this.markerRoots.entries()) {
      const p = this.lociMarkerPos.get(id) ?? this.lociPos.get(id)
      if (p) root.position.copy(p)
    }

    this.teleportTo(locusIdFromRouteIndex(1))
  }

  private findCollisionRoot(root: Object3D): Object3D | null {
    let found: Object3D | null = null
    root.traverse((obj) => {
      if (found) return
      const name = (obj.name || '').trim().toLowerCase()
      if (name === 'collision' || name === 'collider') {
        found = obj
      }
    })
    return found
  }

  private buildOctreeFromWorld(world: Group) {
    const collisionRoot = this.findCollisionRoot(world)
    const octree = new Octree()
    octree.fromGraphNode((collisionRoot ?? world) as any)
    return octree
  }

  private resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  private applyLook() {
    const maxPitch = Math.PI / 2 - 0.02
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch))
    this.xrRig.rotation.y = this.yaw
    if (!this.renderer.xr.isPresenting) {
      this.camera.rotation.x = this.pitch
    }
  }

  private getViewerWorldPosition(target: Vector3) {
    return this.camera.getWorldPosition(target)
  }

  private getViewerWorldDirection(target: Vector3) {
    return this.camera.getWorldDirection(target)
  }

  private syncRigToCollider() {
    const floorY = this.playerCollider.start.y - 0.35
    this.xrRig.position.set(this.playerCollider.start.x, floorY, this.playerCollider.start.z)
    if (!this.renderer.xr.isPresenting) {
      this.camera.position.set(0, 1.6, 0)
    }
  }

  private getForwardVector(target: Vector3) {
    this.getViewerWorldDirection(target)
    target.y = 0
    target.normalize()
    return target
  }

  private getSideVector(target: Vector3) {
    this.getViewerWorldDirection(target)
    target.y = 0
    target.normalize()
    target.cross(this.camera.up)
    return target
  }

  private isRunning() {
    return Boolean(this.runHeld || this.runToggled)
  }

  private step(dt: number) {
    this.updateFade(dt)
    const actions = this.input.poll()

    if (actions.toggleRun) {
      this.runToggled = !this.runToggled
    }

    this.runHeld = actions.run

    if (!this.renderer.xr.isPresenting && (actions.lookDelta.x !== 0 || actions.lookDelta.y !== 0)) {
      this.yaw += actions.lookDelta.x
      this.pitch += actions.lookDelta.y
      this.applyLook()
    }

    if (actions.fire) {
      this.onInteract?.()
    }

    const damping = Math.exp(-6 * dt) - 1
    if (!this.playerOnFloor) {
      this.playerVelocity.y -= 26 * dt
    }
    this.playerVelocity.addScaledVector(this.playerVelocity, damping)

    const baseSpeed = this.playerOnFloor ? 22 : 9.5
    const runMul = this.isRunning() ? 2.0 : 1
    const speed = baseSpeed * runMul
    const speedDelta = speed * dt

    let forward = actions.moveVector.y
    let side = actions.moveVector.x

    // touch joystick: y+ is down, so forward is -y.
    forward += -this.moveVec.y
    side += this.moveVec.x

    if (forward !== 0) {
      this.playerVelocity.add(this.getForwardVector(this.playerDirection).multiplyScalar(forward * speedDelta))
    }
    if (side !== 0) {
      this.playerVelocity.add(this.getSideVector(this.playerDirection).multiplyScalar(side * speedDelta))
    }

    const deltaPos = this.playerVelocity.clone().multiplyScalar(dt)
    this.playerCollider.translate(deltaPos)
    this.playerCollisions()

    this.syncRigToCollider()

    const y = this.getViewerWorldPosition(this.tmpViewerPos).y
    if (y < -20) {
      this.teleportToImmediate(locusIdFromRouteIndex(1))
    }

    this.updateNearLocus()
  }

  private playerCollisions() {
    const result = this.worldOctree.capsuleIntersect(this.playerCollider)
    this.playerOnFloor = false
    if (result) {
      this.playerOnFloor = result.normal.y > 0
      if (!this.playerOnFloor) {
        this.playerVelocity.addScaledVector(result.normal, -result.normal.dot(this.playerVelocity))
      } else {
        if (this.playerVelocity.y < 0) this.playerVelocity.y = 0
      }
      this.playerCollider.translate(result.normal.multiplyScalar(result.depth))
    }
  }

  private updateNearLocus() {
    const p = this.getViewerWorldPosition(this.tmpViewerPos)
    let best: { id: LocusId; d2: number } | null = null
    for (const [id, pos] of this.lociPos.entries()) {
      const dx = p.x - pos.x
      const dy = p.y - (pos.y + 1.6)
      const dz = p.z - pos.z
      const d2 = dx * dx + dy * dy + dz * dz
      if (best === null || d2 < best.d2) best = { id, d2 }
    }

    const next = best && best.d2 < 2.2 * 2.2 ? best.id : null
    if (next !== this.nearLocusId) {
      this.nearLocusId = next
      this.onNearChange?.(next)
    }
  }

  private onResize = () => {
    this.resize()
  }

  private attachEvents() {
    window.addEventListener('resize', this.onResize)
    this.input.attach(this.renderer.domElement)
  }

  private detachEvents() {
    window.removeEventListener('resize', this.onResize)
    this.input.detach()
  }
}
