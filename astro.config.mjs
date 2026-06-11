// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

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

  adapter: vercel({
    // Server-side Puppeteer (PDF rendering) needs the Chromium binary at
    // /tmp; @sparticuz/chromium pulls a slim build (~50 MB). Externalize so
    // it isn't bundled by Vite. The PDF endpoint also needs a higher
    // memory ceiling and a longer max duration than the default.
    maxDuration: 60,
  }),
});