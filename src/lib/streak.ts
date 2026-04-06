const LAST_STUDIED_DAY_KEY = 'mpalace_lastStudiedDay'
const STREAK_DAYS_KEY = 'mpalace_streakDays'

function safeParseInt(value: string | null) {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

export function localDayKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getGlobalStreak() {
  try {
    const lastStudiedDay = window.localStorage.getItem(LAST_STUDIED_DAY_KEY)
    const streakDays = safeParseInt(window.localStorage.getItem(STREAK_DAYS_KEY)) ?? 0
    const today = localDayKey(new Date())
    return {
      lastStudiedDay: lastStudiedDay || null,
      streakDays: Math.max(0, streakDays),
      studiedToday: Boolean(lastStudiedDay && lastStudiedDay === today),
      today,
    }
  } catch {
    return { lastStudiedDay: null, streakDays: 0, studiedToday: false, today: localDayKey(new Date()) }
  }
}

export function markGlobalStudiedNow(now: Date = new Date()) {
  const today = localDayKey(now)
  const yesterday = localDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))

  const prev = getGlobalStreak()
  if (prev.lastStudiedDay === today) return prev

  const nextStreakDays = prev.lastStudiedDay === yesterday ? Math.max(1, prev.streakDays + 1) : 1

  try {
    window.localStorage.setItem(LAST_STUDIED_DAY_KEY, today)
    window.localStorage.setItem(STREAK_DAYS_KEY, String(nextStreakDays))
  } catch {
    // ignore
  }

  return {
    lastStudiedDay: today,
    streakDays: nextStreakDays,
    studiedToday: true,
    today,
  }
}

