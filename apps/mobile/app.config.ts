import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config. The static base (name, icons, identifiers, the dev
 * default `extra`) lives in `app.json`; this layer makes the API base URL
 * build-environment-driven so production binaries point at Cloud Run instead of
 * localhost.
 *
 * EAS build profiles set `AUTODIDACT_API_BASE_URL` (see `eas.json`):
 *   - production / preview → the Cloud Run api URL
 *   - local `expo start`   → no env set, falls back to the app.json dev default
 *
 * The app reads the resolved value via `expo-constants` (`src/api/client.ts`).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Autodidact',
  slug: config.slug ?? 'autodidact',
  extra: {
    ...config.extra,
    apiBaseUrl:
      process.env.AUTODIDACT_API_BASE_URL ??
      (config.extra?.apiBaseUrl as string | undefined) ??
      'http://localhost:3000/v1',
  },
});
