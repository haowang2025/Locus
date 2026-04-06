export interface InputActions {
  /** -1..1 */
  moveVector: { x: number; y: number }
  /** yaw/pitch delta (radians) for this frame */
  lookDelta: { x: number; y: number }
  /** single-trigger */
  fire: boolean
  /** single-trigger */
  nextLocus: boolean
  /** hold */
  run: boolean
  /** single-trigger */
  menu: boolean
  /** single-trigger */
  toggleRun: boolean
}

export const EMPTY_ACTIONS: InputActions = {
  moveVector: { x: 0, y: 0 },
  lookDelta: { x: 0, y: 0 },
  fire: false,
  nextLocus: false,
  run: false,
  menu: false,
  toggleRun: false,
}

export interface InputAdapter {
  /** Called each frame; should clear one-shot actions after returning. */
  poll(): InputActions
  /** Bind events. */
  attach(element: HTMLElement): void
  /** Unbind events. */
  detach(): void
  /** Clear internal state (pressed keys, queued actions, deltas). */
  reset(): void
}

