import type { InputActions, InputAdapter } from './InputManager'
import { EMPTY_ACTIONS } from './InputManager'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function mergeActions(a: InputActions, b: InputActions): InputActions {
  return {
    moveVector: {
      x: clamp(a.moveVector.x + b.moveVector.x, -1, 1),
      y: clamp(a.moveVector.y + b.moveVector.y, -1, 1),
    },
    lookDelta: { x: a.lookDelta.x + b.lookDelta.x, y: a.lookDelta.y + b.lookDelta.y },
    fire: a.fire || b.fire,
    nextLocus: a.nextLocus || b.nextLocus,
    run: a.run || b.run,
    menu: a.menu || b.menu,
    toggleRun: a.toggleRun || b.toggleRun,
  }
}

export class CombinedInputAdapter implements InputAdapter {
  private adapters: InputAdapter[]

  constructor(adapters: InputAdapter[]) {
    this.adapters = adapters
  }

  poll(): InputActions {
    let merged = EMPTY_ACTIONS
    for (const a of this.adapters) {
      merged = mergeActions(merged, a.poll())
    }
    return merged
  }

  attach(element: HTMLElement): void {
    for (const a of this.adapters) a.attach(element)
  }

  detach(): void {
    for (const a of this.adapters) a.detach()
  }

  reset(): void {
    for (const a of this.adapters) a.reset()
  }
}

