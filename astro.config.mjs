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

  // Aliases / corrected URLs so common-but-wrong paths don't 404.
  redirects: {
    '/app/facturi': '/app/facturare',
    '/app/login': '/auth/login',
    '/conectare': '/auth/login',
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      // Strip source maps in production — makes reverse-engineering minified
      // bundles meaningfully harder, and stops accidental leaks of original
      // file paths / inline comments via Vercel's CDN.
      sourcemap: false,
      // Drop console.* and debugger statements in prod bundles.
      minify: 'esbuild',
    },
    esbuild: {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    },
  },

  adapter,
});