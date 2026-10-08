// Literal hex values for the design tokens defined in `src/global.css`, for the
// few React Native APIs that take a color value rather than a className
// (ActivityIndicator `color`, RefreshControl `tintColor`, icon colors, React
// Navigation options). className-based styling stays the source of truth in
// global.css + tailwind.config.js — these MUST be kept in sync with it.
import { useColorScheme } from 'nativewind';

// Brand primary is identical in both themes (indigo500).
const primary = '#6366f1';

const themeColors = {
  dark: {
    background: '#0f172a', // slate900
    foreground: '#f1f5f9', // slate100
    card: '#1e293b', // slate800
    border: '#334155', // slate700
    primary,
    primaryForeground: '#f1f5f9', // slate100 — text/spinner on a primary fill
    mutedForeground: '#94a3b8', // slate400
    success: '#22c55e',
    destructive: '#ef4444',
  },
  light: {
    background: '#ffffff',
    foreground: '#0f172a', // slate900
    card: '#ffffff',
    border: '#e2e8f0', // slate200
    primary,
    primaryForeground: '#ffffff',
    mutedForeground: '#64748b', // slate500
    success: '#22c55e',
    destructive: '#ef4444',
  },
} as const;

export type ThemeColor = keyof (typeof themeColors)['dark'];

export function useThemeColors() {
  return themeColors[useColorScheme().colorScheme === 'dark' ? 'dark' : 'light'];
}
