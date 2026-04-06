import type { InputActions, InputAdapter } from './InputManager'
import { EMPTY_ACTIONS } from './InputManager'

export class TouchAdapter implements InputAdapter {
  private element: HTMLElement | null = null
  private lookPointerId: number | null = null
  private lastX = 0
  private lastY = 0
  private yawDelta = 0
  private pitchDelta = 0

  poll(): InputActions {
    const actions: InputActions = {
      ...EMPTY_ACTIONS,
      lookDelta: { x: this.yawDelta, y: this.pitchDelta },
    }

    this.yawDelta = 0
    this.pitchDelta = 0

    return actions
  }

  attach(element: HTMLElement): void {
    this.element = element
    element.addEventListener('pointerdown', this.onPointerDown)
    element.addEventListener('pointermove', this.onPointerMove)
    element.addEventListener('pointerup', this.onPointerUp)
    element.addEventListener('pointercancel', this.onPointerCancel)
  }

  detach(): void {
    this.element?.removeEventListener('pointerdown', this.onPointerDown)
    this.element?.removeEventListener('pointermove', this.onPointerMove)
    this.element?.removeEventListener('pointerup', this.onPointerUp)
    this.element?.removeEventListener('pointercancel', this.onPointerCancel)
    this.element = null
    this.reset()
  }

  reset(): void {
    this.lookPointerId = null
    this.lastX = 0
    this.lastY = 0
    this.yawDelta = 0
    this.pitchDelta = 0
  }

  private onPointerDown = (event: PointerEvent) => {
    // Touch-only: canvas look drag.
    if (event.pointerType === 'mouse') return
    if (this.lookPointerId !== null) return
    this.lookPointerId = event.pointerId
    this.lastX = event.clientX
    this.lastY = event.clientY
    this.element?.setPointerCapture(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    if (event.pointerId !== this.lookPointerId) return
    const dx = event.clientX - this.lastX
    const dy = event.clientY - this.lastY
    this.lastX = event.clientX
    this.lastY = event.clientY
    // Keep behavior consistent with legacy FpsWorld.
    this.yawDelta += -dx * 0.004
    this.pitchDelta += -dy * 0.004
  }

  private clearPointer(pointerId: number) {
    if (pointerId === this.lookPointerId) {
      this.lookPointerId = null
    }
  }

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    this.clearPointer(event.pointerId)
  }

  private onPointerCancel = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    this.clearPointer(event.pointerId)
  }
}

