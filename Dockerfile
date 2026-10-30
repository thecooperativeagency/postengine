# PostEngine web service and the Friday cron job share this image.
# Playwright is a dependency of repo-root scraper scripts (Ada's workspace),
# not of the PostEngine server. Skip its browser download.

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts tailwind.config.ts postcss.config.js components.json ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY script ./script
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY scripts/railway-weekly-scan.mjs ./scripts/railway-weekly-scan.mjs
COPY .zernio-accounts.json ./
EXPOSE 5000
CMD ["npm", "start"]
