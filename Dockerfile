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

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

USER app
EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy && bun run dist/main.js"]
