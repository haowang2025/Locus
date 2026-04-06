import type { InputActions, InputAdapter } from './InputManager'
import { EMPTY_ACTIONS } from './InputManager'

type KeyStates = Record<string, boolean>

export class KeyboardMouseAdapter implements InputAdapter {
  private element: HTMLElement | null = null

  private keyStates: KeyStates = {}
  private pointerLocked = false
  private yawDelta = 0
  private pitchDelta = 0

  private fireQueued = false
  private menuQueued = false
  private toggleRunQueued = false

  poll(): InputActions {
    const moveVector = this.readMoveVector()
    const actions: InputActions = {
      ...EMPTY_ACTIONS,
      moveVector,
      lookDelta: { x: this.yawDelta, y: this.pitchDelta },
      fire: this.fireQueued,
      menu: this.menuQueued,
      toggleRun: this.toggleRunQueued,
    }

    // Clear one-shot + accumulated deltas after reading.
    this.yawDelta = 0
    this.pitchDelta = 0
    this.fireQueued = false
    this.menuQueued = false
    this.toggleRunQueued = false

    actions.run = Boolean(this.keyStates['ShiftLeft'] || this.keyStates['ShiftRight'])
    return actions
  }

  attach(element: HTMLElement): void {
    this.element = element
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    document.addEventListener('mousemove', this.onMouseMove)
    element.addEventListener('click', this.onCanvasClick)
    element.addEventListener('mousedown', this.onMouseDown)
    this.onPointerLockChange()
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('mousemove', this.onMouseMove)
    this.element?.removeEventListener('click', this.onCanvasClick)
    this.element?.removeEventListener('mousedown', this.onMouseDown)
    this.element = null
    this.reset()
  }

  reset(): void {
    this.keyStates = {}
    this.pointerLocked = false
    this.yawDelta = 0
    this.pitchDelta = 0
    this.fireQueued = false
    this.menuQueued = false
    this.toggleRunQueued = false
  }

  private readMoveVector() {
    let y = 0
    let x = 0
    if (this.keyStates['KeyW'] || this.keyStates['ArrowUp']) y += 1
    if (this.keyStates['KeyS'] || this.keyStates['ArrowDown']) y -= 1
    if (this.keyStates['KeyA'] || this.keyStates['ArrowLeft']) x -= 1
    if (this.keyStates['KeyD'] || this.keyStates['ArrowRight']) x += 1
    return { x, y }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    this.keyStates[event.code] = true
    if (event.code === 'Space') this.fireQueued = true
    if (event.code === 'Escape') this.menuQueued = true
    if (event.code === 'KeyR') this.toggleRunQueued = true
  }

  private onKeyUp = (event: KeyboardEvent) => {
    this.keyStates[event.code] = false
  }

  private onPointerLockChange = () => {
    const el = this.element
    this.pointerLocked = Boolean(el && document.pointerLockElement === el)
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.pointerLocked) return
    // Keep behavior consistent with legacy FpsWorld.
    this.yawDelta += -event.movementX * 0.0022
    this.pitchDelta += -event.movementY * 0.0022
  }

  private onCanvasClick = () => {
    if (this.pointerLocked) return
    // Desktop: click to lock mouse for FPS look.
    this.element?.requestPointerLock?.()
  }

  private onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return
    const el = this.element
    if (!el) return
    if (document.pointerLockElement !== el) return
    this.fireQueued = true
  }
}

