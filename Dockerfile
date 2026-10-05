# syntax=docker/dockerfile:1
# openssl in every stage: Prisma picks its engine by the openssl it finds, and
# the slim image has none, so generate and runtime must see the same one.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 AUTH_TRUST_HOST=true
# Prisma CLI in its own folder, so it can't disturb the traced standalone node_modules.
# Pinned to the same version as package.json.
RUN mkdir /prisma-cli && cd /prisma-cli && npm init -y >/dev/null && npm install prisma@6.19.3
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --chmod=755 docker-entrypoint.sh ./
USER node
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
