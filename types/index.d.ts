export type Segment = { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }

export type Usage = {
  tokens: number | null
  window: number
  percent: number | null
  compactAt: number | null
  segments: Segment[]
  barMax: number
}

export type Rtk = { total: number; session: number; avgPct: number; commands: number }

// Today's prayer times for a city, as fetched; refetched when the date changes.
export type Prayer = {
  date: string
  timeZone: string
  city: string
  timings: Record<'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha', string>
}

export type SetupStep ='rtk' | 'hook' | 'bash' | 'matt'

export type Setup = {
  missing: SetupStep[]
  phase: 'idle' | 'running' | 'done' | 'hidden'
  progress: string
  results: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'yemeni-context-band': {
      isShown: boolean
      usage: Usage | null
      rtk: Rtk | null
      rtkBaseline: number | null
      setup: Setup | null
      prayer: Prayer | null
    }
  }
}
