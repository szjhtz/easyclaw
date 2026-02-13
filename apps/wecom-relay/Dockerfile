FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.6.2 --activate
WORKDIR /app

# --- deps stage ---
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# --- build stage ---
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsdown.config.ts ./
COPY src/ src/
RUN pnpm build

# --- prod stage ---
FROM node:22-alpine AS prod
WORKDIR /app
RUN addgroup -g 1001 -S relay && adduser -S relay -u 1001
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /app/data && chown relay:relay /app/data
USER relay
EXPOSE 3000 3001
CMD ["node", "dist/index.mjs"]
