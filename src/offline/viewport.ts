export interface ViewerRect { left: number; top: number; width: number; height: number }
/** Reserve opaque HUD space instead of framing a landmark behind the training panel. */
export function computeViewerViewport(width: number, height: number, headerBottom: number, panel: ViewerRect, collapsed: boolean): ViewerRect {
  const top = Math.max(0, Math.min(height - 1, headerBottom + 8))
  const sidePanel = !collapsed && width >= 760 && panel.left >= 280
  const right = sidePanel ? Math.max(1, panel.left - 8) : width
  let bottom = Math.max(top + 1, height - 80)
  if (!sidePanel && panel.top < bottom) bottom = Math.max(top + 1, panel.top - 8)
  return { left: 0, top, width: Math.max(1, right), height: Math.max(1, bottom - top) }
}

/** Shrink the actual canvas, without stretching pixels or moving the camera into geometry. */
export function fitSceneViewport(rect: ViewerRect, minAspect = 4 / 3): ViewerRect {
  const width = Math.max(1, rect.width), height = Math.max(1, Math.min(rect.height, width / minAspect))
  return { ...rect, width, height }
}
