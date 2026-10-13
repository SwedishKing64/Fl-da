# Single-container deployment of Alpsport CSV on any host that runs
# Docker with a persistent volume (Railway, Fly.io, Render, a VPS). SQLite and uploaded files
# live under /data so they survive restarts.
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/data/importer.db \
    STORAGE_DIR=/data/storage \
    PORT=3000

FROM base AS build
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM base AS runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/samples ./samples
COPY --from=build /app/src ./src
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json /app/postcss.config.mjs ./
RUN mkdir -p /data/storage
VOLUME ["/data"]
EXPOSE 3000
# Create/upgrade the schema, load default pricing/category rules, then serve.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx prisma/seed.ts && npx next start -p ${PORT}"]
