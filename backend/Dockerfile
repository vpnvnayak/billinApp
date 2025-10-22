FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy source
COPY backend/ ./

RUN chmod +x ./scripts/docker-entrypoint.sh || true

ENV NODE_ENV=production

EXPOSE 4000

CMD ["/bin/sh", "./scripts/docker-entrypoint.sh"]
