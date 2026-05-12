# syntax=docker/dockerfile:1.7
# ───── build stage ─────
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
RUN bunx prisma generate

COPY src ./src
RUN bunx nest build

# ───── runtime stage ─────
FROM oven/bun:1-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOME=/app
# Any interactive shell (login or not) — Dokploy's terminal may bypass WORKDIR — lands in /app
ENV ENV=/etc/sh.shrc

RUN addgroup -S app && adduser -S app -G app -h /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Shell init: login shells via profile.d, non-login interactive via $ENV. Both cd to /app so
# `bun run <anything>` works no matter how Dokploy's web terminal invokes the shell.
RUN printf 'cd /app 2>/dev/null\n' > /etc/profile.d/cd-to-app.sh \
 && chmod +x /etc/profile.d/cd-to-app.sh \
 && cp /etc/profile.d/cd-to-app.sh /etc/sh.shrc \
 && printf '#!/bin/sh\ncd /app && exec bun run prisma/seed.ts "$@"\n' > /usr/local/bin/seed \
 && chmod +x /usr/local/bin/seed \
 && chown -R app:app /app

USER app
EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy && bun run dist/main.js"]
