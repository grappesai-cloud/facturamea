// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import node from '@astrojs/node';

// DEPLOY_TARGET=node → standalone Node server (Hetzner/Docker). Default = Vercel.
const adapter = process.env.DEPLOY_TARGET === 'node'
  ? node({ mode: 'standalone' })
  : vercel({ maxDuration: 60 });

// https://astro.build/config
export default defineConfig({
  output: 'server',
  site: 'https://facturamea.com',
  integrations: [react()],

  // Astro's built-in checkOrigin (default-on) rejects multipart/form POSTs
  // behind the Coolify reverse proxy ("Cross-site POST form submissions are
  // forbidden") because the proxy rewrites Host so Origin !== Host — this
  // breaks ALL file uploads. We disable it and rely on our own CSRF in
  // src/middleware.ts (isCrossOrigin check on cookie-based mutating /api
  // requests; Bearer/JSON requests are token-authenticated and exempt).
  security: { checkOrigin: false },

  // Aliases / corrected URLs so common-but-wrong paths don't 404.
  redirects: {
    '/app/facturi': '/app/facturare',
    '/app/login': '/auth/login',
    '/conectare': '/auth/login',
  },

  vite: {
    plugins: [
      tailwindcss(),
      {
        // Drop console.*/debugger ONLY from the CLIENT bundle. The SSR server
        // build MUST keep console so production logging (logger.ts emit,
        // cron catch-blocks, captureError) actually reaches the container logs.
        // A global esbuild.drop was silencing all prod observability.
        name: 'facturamea:drop-console-client-only',
        apply: 'build',
        config(_conf, env) {
          if (env.isSsrBuild || _conf.build?.ssr) return {};
          return { esbuild: { drop: ['console', 'debugger'] } };
        },
      },
    ],
    build: {
      // Strip source maps in production — makes reverse-engineering minified
      // bundles harder and avoids leaking original paths/comments.
      sourcemap: false,
      minify: 'esbuild',
    },
    esbuild: {
      legalComments: 'none',
    },
  },

  adapter,
});