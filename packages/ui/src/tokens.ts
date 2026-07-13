/**
 * Design tokens (§8 of the brief): modern fintech, trust blue + growth green,
 * tasteful silver/gold accents, mobile-first, light/dark, WCAG-AA.
 * These are the single source for colors/spacing/type across the site,
 * charts, and PDF exports.
 */

export const colors = {
  light: {
    background: '#ffffff',
    surface: '#f6f8fa',
    text: '#0f172a',
    textMuted: '#475569',
    trustBlue: '#1d4ed8',
    trustBlueDark: '#1e3a8a',
    growthGreen: '#15803d',
    growthGreenLight: '#22c55e',
    accentSilver: '#94a3b8',
    accentGold: '#b45309',
    border: '#e2e8f0',
    warning: '#b45309',
    error: '#b91c1c',
  },
  dark: {
    background: '#0b1120',
    surface: '#111a2e',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    trustBlue: '#60a5fa',
    trustBlueDark: '#3b82f6',
    growthGreen: '#4ade80',
    growthGreenLight: '#86efac',
    accentSilver: '#64748b',
    accentGold: '#fbbf24',
    border: '#1e293b',
    warning: '#fbbf24',
    error: '#f87171',
  },
} as const

/** Fan-chart percentile band colors (p10–p90), light theme, low→high opacity. */
export const fanChart = {
  medianStroke: colors.light.trustBlue,
  bandFill: colors.light.trustBlue,
  bandOpacities: { p10p90: 0.12, p25p75: 0.22 },
} as const

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, xxl: 64 } as const

export const font = {
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  familyMono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  size: { sm: '0.875rem', base: '1rem', lg: '1.25rem', xl: '1.75rem', hero: '2.5rem' },
} as const

export const breakpoints = { sm: 480, md: 768, lg: 1024 } as const
