FROM node:20 AS base
WORKDIR /app

FROM base AS install
RUN cat > package.json << 'PKGJSON'
{
  "name": "evaluation-service-docker",
  "private": true,
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cors": "^10.0.0",
    "bullmq": "^5.30.0",
    "tsx": "^4.19.0"
  }
}
PKGJSON
RUN npm install

FROM base AS production
COPY --from=install /app/node_modules ./node_modules
COPY packages/ ./packages/
COPY services/evaluation-service/ ./services/evaluation-service/
COPY src/ ./src/
COPY scripts/qa-golden.json ./scripts/qa-golden.json
COPY tsconfig.json ./
RUN mkdir -p node_modules/@ai-agent && \
    ln -s ../../../packages/shared-types node_modules/@ai-agent/shared-types && \
    ln -s ../../../packages/shared-utils node_modules/@ai-agent/shared-utils && \
    ln -s ../../../packages/rag-client node_modules/@ai-agent/rag-client && \
    ln -s ../../../packages/llm-client node_modules/@ai-agent/llm-client
ENV NODE_ENV=production
EXPOSE 3003
CMD ["npx", "tsx", "services/evaluation-service/src/index.ts"]
