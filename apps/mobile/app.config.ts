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
  },
});
