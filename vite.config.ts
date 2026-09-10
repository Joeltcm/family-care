import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;
const isCloudflareDeployment = process.env.FAMILY_CARE_DEPLOY_TARGET === 'cloudflare';
const cloudflareR2Bucket = process.env.FAMILY_CARE_R2_BUCKET;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
  vars: {
    ...(process.env.FAMILY_CARE_API_URL ? { FAMILY_CARE_API_URL: process.env.FAMILY_CARE_API_URL } : {}),
    ...(process.env.FAMILY_CARE_SERVICE_KEY ? { FAMILY_CARE_SERVICE_KEY: process.env.FAMILY_CARE_SERVICE_KEY } : {}),
    ...(process.env.CF_ACCESS_TEAM_DOMAIN ? { CF_ACCESS_TEAM_DOMAIN: process.env.CF_ACCESS_TEAM_DOMAIN } : {}),
    ...(process.env.CF_ACCESS_AUD ? { CF_ACCESS_AUD: process.env.CF_ACCESS_AUD } : {}),
    ...(process.env.FAMILY_CARE_DEV_USER_ID ? { FAMILY_CARE_DEV_USER_ID: process.env.FAMILY_CARE_DEV_USER_ID } : {}),
    ...(process.env.FAMILY_CARE_DEV_USER_EMAIL ? { FAMILY_CARE_DEV_USER_EMAIL: process.env.FAMILY_CARE_DEV_USER_EMAIL } : {}),
    ...(process.env.FAMILY_CARE_DEV_USER_NAME ? { FAMILY_CARE_DEV_USER_NAME: process.env.FAMILY_CARE_DEV_USER_NAME } : {}),
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: (isCloudflareDeployment ? cloudflareR2Bucket : r2)
    ? [
        {
          binding: r2 || 'MEDICAL_FILES',
          bucket_name: isCloudflareDeployment ? cloudflareR2Bucket! : 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      ...(!isCloudflareDeployment ? [sites()] : []),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
