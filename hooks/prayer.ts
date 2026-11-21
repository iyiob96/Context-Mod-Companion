// Next Islamic prayer time. Times come from the Aladhan API (api.aladhan.com)
// with the Umm al-Qura method, for the city named by the machine's timezone
// ("Asia/Riyadh" asks for Riyadh). The engine call lives in register.tsx.

export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const
export type PrayerName = (typeof PRAYERS)[number]
export type Timings = Record<PrayerName, string>

const UMM_AL_QURA = 4

export function userTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

// shortcut: the timezone's city stands in for where you are, so a timezone
// shared by a whole region (Asia/Riyadh for all of Saudi Arabia) can be a few
// minutes off; add a city setting if that matters.
export function cityOf(timeZone: string): string | null {
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ')
  return city && !/^(UTC|GMT|Etc)/i.test(timeZone) ? city : null
}

// Today's date and the minutes since midnight, in the given timezone.
export function localNow(timeZone: string, at: number): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(at))
      .map(p => [p.type, p.value]),
  )
  return { date: `${parts.day}-${parts.month}-${parts.year}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

export const timingsUrl = (date: string, city: string) =>
  `https://api.aladhan.com/v1/timingsByAddress/${date}?address=${encodeURIComponent(city)}&method=${UMM_AL_QURA}`

export function parseTimings(json: string): Timings | null {
  try {
    const t = JSON.parse(json)?.data?.timings
    const out = {} as Timings
    for (const p of PRAYERS) {
      const hhmm = /^(\d{1,2}):(\d{2})/.exec(String(t?.[p] ?? ''))
      if (!hhmm) return null
      out[p] = `${hhmm[1]!.padStart(2, '0')}:${hhmm[2]}`
    }
    return out
  } catch {
    return null
  }
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

// The next prayer after `minutes`; after Isha, tomorrow's Fajr (today's time stands in).
export function nextPrayer(t: Timings, minutes: number): { name: PrayerName; time: string; inMinutes: number } {
  const name = PRAYERS.find(p => toMinutes(t[p]) > minutes) ?? 'Fajr'
  const at = toMinutes(t[name])
  return { name, time: t[name], inMinutes: (at - minutes + 1440) % 1440 }
}

export const countdown = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)
