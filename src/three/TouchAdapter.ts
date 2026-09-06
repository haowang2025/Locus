import type { InputActions, InputAdapter } from './InputManager'
import { EMPTY_ACTIONS } from './InputManager'

export class TouchAdapter implements InputAdapter {
  private element: HTMLElement | null = null
  private lookPointerId: number | null = null
  private lastX = 0
  private lastY = 0
  private yawDelta = 0
  private pitchDelta = 0
  private usingTouchFallback = false

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
    // XHS WebView may report a real touch drag as a mouse-like pointer and may
    // also fail to keep pointer capture. Listen for down on the canvas, but
    // track move/up at window level so the gesture survives leaving the canvas.
    element.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove, { passive: false })
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)

    // Native touch fallback for WebViews whose Pointer Events implementation is
    // incomplete. pointer handlers remain primary; the flag prevents double use.
    element.addEventListener('touchstart', this.onTouchStart, { passive: false })
    window.addEventListener('touchmove', this.onTouchMove, { passive: false })
    window.addEventListener('touchend', this.onTouchEnd)
    window.addEventListener('touchcancel', this.onTouchEnd)
  }

  detach(): void {
    this.element?.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    this.element?.removeEventListener('touchstart', this.onTouchStart)
    window.removeEventListener('touchmove', this.onTouchMove)
    window.removeEventListener('touchend', this.onTouchEnd)
    window.removeEventListener('touchcancel', this.onTouchEnd)
    this.element = null
    this.reset()
  }

  reset(): void {
    this.lookPointerId = null
    this.lastX = 0
    this.lastY = 0
    this.yawDelta = 0
    this.pitchDelta = 0
    this.usingTouchFallback = false
  }

  private isUiControl(target: EventTarget | null): boolean {
    const node = target instanceof Element ? target : null
    return Boolean(node?.closest('button, a, input, textarea, select, [role="button"], .joystick, .mobile-stick'))
  }

  private addLookDelta(clientX: number, clientY: number) {
    const dx = clientX - this.lastX
    const dy = clientY - this.lastY
    this.lastX = clientX
    this.lastY = clientY
    // Keep behavior consistent with legacy FpsWorld.
    this.yawDelta += -dx * 0.004
    this.pitchDelta += -dy * 0.004
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.usingTouchFallback || this.lookPointerId !== null || this.isUiControl(event.target)) return
    // Do not reject pointerType === 'mouse': XHS WebView/test container can map
    // touch drag to a mouse-like pointer. A mouse drag is also useful on desktop.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    this.lookPointerId = event.pointerId
    this.lastX = event.clientX
    this.lastY = event.clientY
    try {
      this.element?.setPointerCapture(event.pointerId)
    } catch {
      // Some embedded WebViews expose Pointer Events but not reliable capture.
    }
    event.preventDefault()
  }

  private onPointerMove = (event: PointerEvent) => {
    if (this.usingTouchFallback || event.pointerId !== this.lookPointerId) return
    this.addLookDelta(event.clientX, event.clientY)
    event.preventDefault()
  }

  private clearPointer(pointerId: number) {
    if (pointerId === this.lookPointerId) this.lookPointerId = null
  }

  private onPointerUp = (event: PointerEvent) => {
    this.clearPointer(event.pointerId)
  }

  private onPointerCancel = (event: PointerEvent) => {
    this.clearPointer(event.pointerId)
  }

  private onTouchStart = (event: TouchEvent) => {
    if (this.lookPointerId !== null || this.isUiControl(event.target)) return
    const touch = event.changedTouches[0]
    if (!touch) return
    this.usingTouchFallback = true
    this.lookPointerId = touch.identifier
    this.lastX = touch.clientX
    this.lastY = touch.clientY
    event.preventDefault()
  }

  private onTouchMove = (event: TouchEvent) => {
    if (!this.usingTouchFallback || this.lookPointerId === null) return
    let touch: Touch | undefined
    for (let i = 0; i < event.touches.length; i += 1) {
      if (event.touches[i].identifier === this.lookPointerId) {
        touch = event.touches[i]
        break
      }
    }
    if (!touch) return
    this.addLookDelta(touch.clientX, touch.clientY)
    event.preventDefault()
  }

  private onTouchEnd = (event: TouchEvent) => {
    if (!this.usingTouchFallback || this.lookPointerId === null) return
    for (let i = 0; i < event.changedTouches.length; i += 1) {
      if (event.changedTouches[i].identifier === this.lookPointerId) {
        this.lookPointerId = null
        this.usingTouchFallback = false
        break
      }
    }
  }
}
