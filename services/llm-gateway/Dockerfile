FROM node:20 AS base
WORKDIR /app

FROM base AS install
RUN cat > package.json << 'PKGJSON'
{
  "name": "llm-gateway-docker",
  "private": true,
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cors": "^10.0.0",
    "tsx": "^4.19.0",
    "drizzle-orm": "^0.38.0",
    "postgres": "^3.4.0",
    "ioredis": "^5.6.0",
    "js-yaml": "^4.1.0"
  }
}
PKGJSON
RUN npm install

FROM base AS production
COPY --from=install /app/node_modules ./node_modules
COPY packages/shared-types/ ./node_modules/@ai-agent/shared-types/
COPY packages/shared-utils/ ./node_modules/@ai-agent/shared-utils/
COPY packages/llm-client/ ./node_modules/@ai-agent/llm-client/
COPY services/llm-gateway/ ./services/llm-gateway/
COPY src/ ./src/
COPY config/api_keys.yaml ./config/api_keys.yaml
COPY tsconfig.json ./
ENV NODE_ENV=production
EXPOSE 3002
CMD ["npx", "tsx", "services/llm-gateway/src/index.ts"]
