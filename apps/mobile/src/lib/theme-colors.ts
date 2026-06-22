// Literal hex values for the design tokens defined in `src/global.css`, for the
// few React Native APIs that take a color value rather than a className
// (ActivityIndicator `color`, RefreshControl `tintColor`, Ionicons `color`,
// Tabs `screenOptions`). className-based styling stays the source of truth in
// global.css + tailwind.config.js — these MUST be kept in sync with it.
export type ColorScheme = 'light' | 'dark';

// Brand primary is identical in both themes (indigo500), so it's scheme-independent.
export const PRIMARY = '#6366f1';

export const themeColors = {
  dark: {
    background: '#0f172a', // slate900
    foreground: '#f1f5f9', // slate100
    card: '#1e293b', // slate800
    border: '#334155', // slate700
    primary: PRIMARY,
    primaryForeground: '#f1f5f9', // slate100 — text/spinner on a primary/danger fill
    mutedForeground: '#94a3b8', // slate400
  },
  light: {
    background: '#ffffff',
    foreground: '#0f172a', // slate900
    card: '#ffffff',
    border: '#e2e8f0', // slate200
    primary: PRIMARY,
    primaryForeground: '#ffffff',
    mutedForeground: '#64748b', // slate500
  },
} as const;

export function getThemeColors(scheme: ColorScheme | null | undefined) {
  return themeColors[scheme === 'dark' ? 'dark' : 'light'];
}
