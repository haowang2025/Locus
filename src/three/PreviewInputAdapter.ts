import { EMPTY_ACTIONS, type InputActions, type InputAdapter } from './InputManager'

/** Preview-only drag input. No global keys, pointer lock, movement or firing. */
export class PreviewInputAdapter implements InputAdapter {
  private element: HTMLElement | null = null
  private pointerId: number | null = null
  private x = 0
  private y = 0
  private yaw = 0
  private pitch = 0
  poll(): InputActions { const lookDelta = { x: this.yaw, y: this.pitch }; this.yaw = 0; this.pitch = 0; return { ...EMPTY_ACTIONS, moveVector: { x: 0, y: 0 }, lookDelta } }
  attach(element: HTMLElement) { this.element = element; element.style.touchAction = 'none'; element.addEventListener('pointerdown', this.down); element.addEventListener('pointermove', this.move); element.addEventListener('pointerup', this.up); element.addEventListener('pointercancel', this.up) }
  detach() { const e = this.element; if (e && this.pointerId !== null && e.hasPointerCapture(this.pointerId)) e.releasePointerCapture(this.pointerId); e?.removeEventListener('pointerdown', this.down); e?.removeEventListener('pointermove', this.move); e?.removeEventListener('pointerup', this.up); e?.removeEventListener('pointercancel', this.up); this.element = null; this.reset() }
  reset() { this.pointerId = null; this.yaw = 0; this.pitch = 0 }
  private down = (event: PointerEvent) => { if (event.button !== 0) return; this.pointerId = event.pointerId; this.x = event.clientX; this.y = event.clientY; this.element?.setPointerCapture(event.pointerId) }
  private move = (event: PointerEvent) => { if (this.pointerId !== event.pointerId) return; this.yaw -= (event.clientX - this.x) * .003; this.pitch -= (event.clientY - this.y) * .003; this.x = event.clientX; this.y = event.clientY }
  private up = (event: PointerEvent) => { if (this.pointerId !== event.pointerId) return; this.pointerId = null; if (this.element?.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId) }
}
