import { expect, test } from 'claude-code/testing'

import { cityOf, countdown, localNow, nextPrayer, parseTimings, reminderOf, timingsUrl } from '../hooks/prayer'

const T = { Fajr: '04:50', Dhuhr: '11:58', Asr: '15:12', Maghrib: '17:35', Isha: '19:05' }

test('next prayer, including the wrap to tomorrow after Isha', () => {
  expect(nextPrayer(T, 9 * 60)).toEqual({ name: 'Dhuhr', time: '11:58', inMinutes: 178 })
  expect(nextPrayer(T, 15 * 60 + 12)).toEqual({ name: 'Maghrib', time: '17:35', inMinutes: 143 })
  expect(nextPrayer(T, 22 * 60)).toEqual({ name: 'Fajr', time: '04:50', inMinutes: 410 })
  expect(countdown(72)).toBe('1h 12m')
  expect(countdown(9)).toBe('9m')
})

test('city, URL, local time and parsing', () => {
  expect(cityOf('Asia/Riyadh')).toBe('Riyadh')
  expect(cityOf('America/New_York')).toBe('New York')
  expect(cityOf('UTC')).toBeNull()
  expect(timingsUrl('21-11-2026', 'New York')).toBe('https://api.aladhan.com/v1/timingsByAddress/21-11-2026?address=New%20York&method=4')
  expect(localNow('Asia/Riyadh', Date.UTC(2026, 10, 21, 9, 30))).toEqual({ date: '21-11-2026', minutes: 12 * 60 + 30 })
  expect(parseTimings(JSON.stringify({ data: { timings: { ...T, Fajr: '4:50 (+03)' } } }))?.Fajr).toBe('04:50')
  expect(parseTimings('{"data":{}}')).toBeNull()
})

test('reminder runs from 2 minutes before to 15 minutes after a prayer', () => {
  const asr = 15 * 60 + 12
  expect(reminderOf(T, asr - 3)).toBeNull()
  expect(reminderOf(T, asr - 2)?.text).toBe('Asr 15:12 · in 2m')
  expect(reminderOf(T, asr)?.text).toBe('Asr now')
  expect(reminderOf(T, asr + 6)?.text).toBe('Asr now · 6m ago')
  expect(reminderOf(T, asr + 15)?.name).toBe('Asr')
  expect(reminderOf(T, asr + 16)).toBeNull()
  expect(reminderOf(T, 23 * 60 + 59)).toBeNull()
  expect(reminderOf(T, 4 * 60 + 48)?.text).toBe('Fajr 04:50 · in 2m')
})
