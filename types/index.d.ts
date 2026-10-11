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

declare module 'claude-code' {
  interface PluginState {
    'yemeni-context-band': {
      isShown: boolean
      usage: Usage | null
      rtk: Rtk | null
      rtkBaseline: number | null
    }
  }
}
