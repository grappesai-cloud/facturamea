# Reusable Dockerfile for an Astro SSR app on Node (Hetzner/Coolify).
# Build with: DEPLOY_TARGET=node so astro.config picks @astrojs/node.
# Copy into each Astro repo root as `Dockerfile`.

FROM node:22-slim AS base
ENV PNPM_HOME=/usr/local/bin
WORKDIR /app

# ── deps ──
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ── build ──
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DEPLOY_TARGET=node
RUN npm run build

# ── runtime ──
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
# Mark the runtime as the Node/Coolify target so security code (e.g. getClientIp)
# never trusts the spoofable x-vercel-forwarded-for header here.
ENV DEPLOY_TARGET=node

# Chromium for Puppeteer (ONLY transport-hub needs PDFs). Harmless elsewhere;
# delete these 3 lines for apps without Puppeteer to slim the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
