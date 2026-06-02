import { createFont } from 'tamagui';

// Numeric keys map to Tamagui's internal $1–$7 font size scale.
// Our named scale (xs–h1) maps to these keys via the typescale export.
export const systemFont = createFont({
  family:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica Neue, sans-serif',
  size: {
    1: 12, // xs
    2: 13, // sm
    3: 15, // md
    4: 16, // lg
    5: 18, // xl
    6: 26, // h2
    7: 32, // h1
  },
  lineHeight: {
    1: 16,
    2: 18,
    3: 22,
    4: 24,
    5: 27,
    6: 32,
    7: 38,
  },
  weight: {
    1: '400',
    2: '600',
    3: '700',
  },
  letterSpacing: {
    1: 0,
  },
});

// Monospace font — same numeric scale as systemFont so size/variant props resolve
// identically; only the family differs. Used for inline code and code blocks.
export const monoFont = createFont({
  family:
    'ui-monospace, Menlo, Monaco, Consolas, "Roboto Mono", "Courier New", monospace',
  size: {
    1: 12, // xs
    2: 13, // sm
    3: 15, // md
    4: 16, // lg
    5: 18, // xl
    6: 26, // h2
    7: 32, // h1
  },
  lineHeight: {
    1: 16,
    2: 18,
    3: 22,
    4: 24,
    5: 27,
    6: 32,
    7: 38,
  },
  weight: {
    1: '400',
    2: '600',
    3: '700',
  },
  letterSpacing: {
    1: 0,
  },
});

// Named scale — used in AppText and Heading variants to avoid exposing $1/$7 to screens.
export const typescale = {
  size: {
    xs: 1,
    sm: 2,
    md: 3,
    lg: 4,
    xl: 5,
    h2: 6,
    h1: 7,
  },
  weight: {
    regular:  '400',
    semibold: '600',
    bold:     '700',
  },
} as const;
