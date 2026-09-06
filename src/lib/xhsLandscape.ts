type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'landscape-primary' | 'landscape-secondary') => Promise<void>
  unlock?: () => void
}

function isTouchLikeDevice() {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  } catch {
    return navigator.maxTouchPoints > 0
  }
}

function isMapRoute() {
  return window.location.hash.includes('/map')
}

function applyOrientationPreference() {
  if (!isTouchLikeDevice()) return

  const orientation = window.screen?.orientation as LockableScreenOrientation | undefined
  if (!orientation) return

  if (isMapRoute()) {
    try {
      const pending = orientation.lock?.('landscape')
      pending?.catch(() => {
        // XHS/WebView may reject orientation locking. CSS supplies a portrait fallback.
      })
    } catch {
      // Best-effort only. Do not block the map if the host disallows orientation lock.
    }
    return
  }

  try {
    orientation.unlock?.()
  } catch {
    // ignore
  }
}

export function installXhsLandscapePreference() {
  applyOrientationPreference()
  window.addEventListener('hashchange', applyOrientationPreference)
  window.addEventListener('pageshow', applyOrientationPreference)

  return () => {
    window.removeEventListener('hashchange', applyOrientationPreference)
    window.removeEventListener('pageshow', applyOrientationPreference)
  }
}
