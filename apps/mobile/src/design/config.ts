import { createTamagui } from 'tamagui';
import { createAnimations } from '@tamagui/animations-react-native';
import { tokens } from './tokens';
import { dark } from './themes';
import { systemFont, monoFont } from './typography';

const animations = createAnimations({
  fast:   { damping: 20, mass: 1.2, stiffness: 250, type: 'spring' },
  medium: { damping: 15, stiffness: 120, type: 'spring' },
  slow:   { damping: 20, stiffness: 60, type: 'spring' },
});

const config = createTamagui({
  animations,
  tokens,
  themes: { dark },
  fonts: {
    body:    systemFont,
    heading: systemFont,
    mono:    monoFont,
  },
  defaultFont: 'body',
  shorthands: {
    p:  'padding',
    px: 'paddingHorizontal',
    py: 'paddingVertical',
    m:  'margin',
    mx: 'marginHorizontal',
    my: 'marginVertical',
    bg: 'backgroundColor',
    f:  'flex',
    ai: 'alignItems',
    jc: 'justifyContent',
  } as const,
});

export type AppConfig = typeof config;

// Merge our config into Tamagui's module so all styled() calls are fully typed.
declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
