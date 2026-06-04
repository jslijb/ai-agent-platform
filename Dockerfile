FROM node:20 AS base
WORKDIR /app

FROM base AS install
COPY package.json package-lock.json ./
RUN npm install

FROM base AS build
ENV NODE_OPTIONS="--max-old-space-size=4096"
COPY --from=install /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS standalone-deps
RUN cat > package.json << 'PKGJSON'
{ "name": "standalone-deps", "private": true, "dependencies": { "redis": "^4.7.0", "neo4j-driver": "^5.27.0", "ioredis": "^5.6.0" } }
PKGJSON
RUN npm install --omit=dev

FROM base AS production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=standalone-deps /app/node_modules ./node_modules

RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next/cache

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
