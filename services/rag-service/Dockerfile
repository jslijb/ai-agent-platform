FROM node:20 AS base
WORKDIR /app

FROM base AS install
RUN cat > package.json << 'PKGJSON'
{
  "name": "rag-service-docker",
  "private": true,
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cors": "^10.0.0",
    "bullmq": "^5.30.0",
    "tsx": "^4.19.0",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0",
    "neo4j-driver": "^5.27.0",
    "ioredis": "^5.6.0",
    "redis": "^4.7.0",
    "js-yaml": "^4.1.0",
    "bcryptjs": "^2.4.3"
  }
}
PKGJSON
RUN npm install --legacy-peer-deps

FROM base AS production
COPY --from=install /app/node_modules ./node_modules
COPY packages/shared-types/ ./node_modules/@ai-agent/shared-types/
COPY packages/shared-utils/ ./node_modules/@ai-agent/shared-utils/
COPY packages/rag-client/ ./node_modules/@ai-agent/rag-client/
COPY services/rag-service/ ./services/rag-service/
COPY src/ ./src/
COPY scripts/qa-golden.json ./scripts/qa-golden.json
COPY tsconfig.json ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["npx", "tsx", "services/rag-service/src/index.ts"]
