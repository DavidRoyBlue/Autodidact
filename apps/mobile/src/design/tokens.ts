import { createTokens } from 'tamagui';

export const tokens = createTokens({
  color: {
    slate50:       '#f8fafc',
    slate100:      '#f1f5f9',
    slate400:      '#94a3b8',
    slate500:      '#64748b',
    slate600:      '#475569',
    slate700:      '#334155',
    slate800:      '#1e293b',
    slate900:      '#0f172a',
    indigo400:     '#818cf8',
    indigo500:     '#6366f1',
    indigo500a13:  'rgba(99, 102, 241, 0.13)',
    green500:      '#22c55e',
    green500a15:   'rgba(34, 197, 94, 0.15)',
    amber500:      '#f59e0b',
    amber500a15:   'rgba(245, 158, 11, 0.15)',
    red500:        '#ef4444',
    red500a15:     'rgba(239, 68, 68, 0.15)',
    transparent:   'rgba(0,0,0,0)',
  },
  space: {
    // Tamagui requires a `true` key for the default space, mirroring `size.true`.
    true: 16,
    0.5: 2,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
  },
  size: {
    // Tamagui requires a `true` key equal to the default size; it backs `$true`
    // and unprefixed sizing. Aliased to the medium size.
    true: 32,
    sm: 24,
    md: 32,
    lg: 40,
    xl: 56,
  },
  // Tamagui v2 requires radius/zIndex token keys to be a subset of the `size`
  // keys ({ true, sm, md, lg, xl }), each with a `true` default. Values are
  // independent of the size scale — only the key namespace is shared.
  radius: {
    true: 12,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 9999, // fully rounded (pills/circles) — was `full`
  },
  zIndex: {
    true: 100,
    sm: 100,
    md: 200,
    lg: 300,
  },
});
