import type { ConfigContext, ExpoConfig } from 'expo/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Dev only: load the monorepo-root .env.dev so SUPABASE_URL / keys reach this
// config at resolution time. Missing file (EAS/CI) is a silent no-op.
loadEnv({ path: path.resolve(__dirname, '../../.env.dev') });

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Autodidact',
  slug: config.slug ?? 'autodidact',
  plugins: [
    ...(config.plugins ?? []),
    'expo-router',
    '@react-native-google-signin/google-signin',
    // Kotlin 1.9.25: expo-modules-core's Compose Compiler 1.5.15 rejects the
    // RN-default 1.9.24 (EAS build 0f3cdd0d failed on exactly this).
    ['expo-build-properties', { android: { kotlinVersion: '1.9.25' } }],
  ],
  extra: {
    ...config.extra,
    apiBaseUrl:
      process.env.AUTODIDACT_API_BASE_URL ??
      (config.extra?.apiBaseUrl as string | undefined) ??
      'http://localhost:3000/v1',
    supabaseUrl:
      process.env.SUPABASE_URL ??
      (config.extra?.supabaseUrl as string | undefined),
    supabasePublishableKey:
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      (config.extra?.supabasePublishableKey as string | undefined),
    // Google OAuth *Web* client ID (the audience the Supabase id-token exchange
    // expects) — distinct from the Android client IDs of D6a (those bind by SHA-1
    // in the Google Cloud console, not here). Facebook is enabled in the Supabase
    // dashboard; the app only needs to know it's available.
    googleWebClientId:
      process.env.GOOGLE_WEB_CLIENT_ID ??
      (config.extra?.googleWebClientId as string | undefined),
    facebookEnabled:
      (process.env.FACEBOOK_ENABLED ?? config.extra?.facebookEnabled) === 'true' ||
      config.extra?.facebookEnabled === true,
  },
});
