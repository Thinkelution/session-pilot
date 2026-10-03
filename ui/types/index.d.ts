export type Sample = { tokens: number; pct: number; window: number }

declare module 'claude-code' {
  interface PluginState {
    'session-pilot-ui': { history: Sample[]; isHidden: boolean }
  }
}
