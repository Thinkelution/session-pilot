export type Sample = { tokens: number; pct: number; window: number }
export type Prefs = { asked: boolean; band: 'always' | 'warn' | 'off'; toast: boolean }

declare module 'claude-code' {
  interface PluginState {
    'session-pilot-ui': { history: Sample[]; prefs: Prefs; original: string }
  }
}
