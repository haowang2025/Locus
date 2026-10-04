import test from 'node:test'
import assert from 'node:assert/strict'
import { PreviewInputAdapter } from '../src/three/PreviewInputAdapter'
class FakeElement extends EventTarget {
  style = { touchAction: '' }
  captured = new Set<number>()
  listeners = new Set<string>()
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) { this.listeners.add(type); super.addEventListener(type, listener, options) }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) { this.listeners.delete(type); super.removeEventListener(type, listener, options) }
  setPointerCapture(id: number) { this.captured.add(id) }
  hasPointerCapture(id: number) { return this.captured.has(id) }
  releasePointerCapture(id: number) { this.captured.delete(id) }
}
function pointer(type: string, x: number, y: number) { return Object.assign(new Event(type), { pointerId: 1, button: 0, clientX: x, clientY: y }) }
test('preview adapter only rotates through local pointer drag and never fires/moves/locks global input', () => {
  const element = new FakeElement(), adapter = new PreviewInputAdapter()
  adapter.attach(element as unknown as HTMLElement)
  assert.deepEqual([...element.listeners].sort(), ['pointercancel', 'pointerdown', 'pointermove', 'pointerup'])
  element.dispatchEvent(pointer('pointerdown', 20, 20)); element.dispatchEvent(pointer('pointermove', 30, 25))
  const action = adapter.poll()
  assert.deepEqual(action.moveVector, { x: 0, y: 0 }); assert.equal(action.fire, false); assert.equal(action.menu, false)
  assert.notEqual(action.lookDelta.x, 0); assert.notEqual(action.lookDelta.y, 0)
  assert.deepEqual(adapter.poll().lookDelta, { x: 0, y: 0 })
  element.dispatchEvent(pointer('pointerup', 30, 25)); assert.equal(element.captured.size, 0)
  adapter.detach(); assert.equal(element.listeners.size, 0)
})
