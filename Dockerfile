# ─── Stage 1 : dépendances ──────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─── Stage 2 : build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

# URLs du backend — à surcharger avec --build-arg lors du docker build
ARG API_URL=http://192.168.1.40:3007
ARG WS_BASE=ws://192.168.1.40:8099

# Exposées à Nuxt/Vite pendant le build (baked dans le bundle client)
ENV API_URL=$API_URL
ENV WS_BASE=$WS_BASE

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# ─── Stage 3 : runner ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Seul le répertoire .output est nécessaire à l'exécution
COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
