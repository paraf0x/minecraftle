# LFS fork: multi-stage build, Next.js standalone output, runs as non-root.
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
ARG NEXT_PUBLIC_DISCORD_CLIENT_ID=""
ARG NEXT_PUBLIC_GA_ID=""
ENV NEXT_PUBLIC_DISCORD_CLIENT_ID=$NEXT_PUBLIC_DISCORD_CLIENT_ID \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm generate && pnpm build

# Prisma CLI for "migrate deploy" at start. The standalone bundle has no CLI.
FROM base AS prisma-cli
WORKDIR /opt/prisma
RUN npm init -y >/dev/null && npm install --no-audit --no-fund prisma@6.19.3

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=prisma-cli --chown=app:app /opt/prisma /opt/prisma
COPY --chown=app:app docker/entrypoint.sh /usr/local/bin/entrypoint.sh
USER app
EXPOSE 3000
ENTRYPOINT ["entrypoint.sh"]
