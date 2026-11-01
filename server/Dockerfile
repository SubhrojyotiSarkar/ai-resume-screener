# ---- Dependencies stage: production node_modules + generated Prisma client ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY prisma.config.js ./
# `prisma generate` reads the config, which requires DATABASE_URL; no connection is made.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
# OpenSSL is used by Prisma's migration engine.
RUN apk add --no-cache openssl
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json prisma.config.js ./
COPY prisma ./prisma
COPY src ./src

USER node
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Apply pending migrations, then start the API. `exec` makes node PID 1 so it receives SIGTERM.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node src/index.js"]
