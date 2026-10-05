# Dockerfile and entry script

A starting point. Check it against the Next.js and Prisma versions in `package.json`
before you rely on it. In particular, if the project uses `prisma.config.ts`, copy that
file into the runtime image too.

## `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Prisma CLI in its own folder, so it can't disturb the traced standalone node_modules.
# Pin the same version as package.json.
RUN mkdir /prisma-cli && cd /prisma-cli && npm init -y >/dev/null && npm install prisma@<pinned>
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --chmod=755 docker-entrypoint.sh ./
USER node
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
```

## `docker-entrypoint.sh`

```sh
#!/bin/sh
# A failed migration must stop the container. set -e makes the script exit
# before the server starts.
set -e
/prisma-cli/node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
exec node server.js
```

## Local `npm start` (the same artifact, for Fleet QA)

```json
{
  "scripts": {
    "build": "prisma generate && next build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/",
    "start": "prisma migrate deploy && node .next/standalone/server.js"
  }
}
```

## `/api/health` (App Router)

```ts
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, commit: process.env.GIT_REV ?? null });
}
```
