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

# bash for interactive use in the Dokploy Docker Terminal (image is otherwise busybox-only)
RUN apk add --no-cache bash

ENV NODE_ENV=production
ENV HOME=/app
# Project-local bins on PATH, plus bun's node-fallback so `#!/usr/bin/env node` shebangs resolve.
# bun:alpine's /etc/profile resets PATH for login shells, so the rc hook below re-exports this.
ENV PATH="/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bun-node-fallback-bin"
ENV ENV=/etc/sh.shrc
ENV BASH_ENV=/etc/sh.shrc

RUN addgroup -S app && adduser -S app -G app -h /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Shell init: cd to /app and re-export PATH (login shells get PATH clobbered by /etc/profile),
# plus shims at /usr/local/bin/ so `prisma`, `migrate`, `seed` work from any cwd.
RUN printf 'export PATH="/app/node_modules/.bin:$PATH:/usr/local/bun-node-fallback-bin"\ncd /app 2>/dev/null\n' > /etc/profile.d/cd-to-app.sh \
 && chmod +x /etc/profile.d/cd-to-app.sh \
 && cp /etc/profile.d/cd-to-app.sh /etc/sh.shrc \
 && cp /etc/profile.d/cd-to-app.sh /etc/bash.bashrc \
 && printf '#!/bin/sh\ncd /app && exec bunx prisma "$@"\n' > /usr/local/bin/prisma \
 && printf '#!/bin/sh\ncd /app && exec bunx prisma migrate deploy "$@"\n' > /usr/local/bin/migrate \
 && printf '#!/bin/sh\ncd /app && exec bun run prisma/seed.ts "$@"\n' > /usr/local/bin/seed \
 && chmod +x /usr/local/bin/prisma /usr/local/bin/migrate /usr/local/bin/seed \
 && chown -R app:app /app

USER app
EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy && bun run dist/main.js"]
