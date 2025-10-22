FROM node:18-alpine as build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM scratch
# nothing to run here; frontend static assets are produced in build step and will be mounted into Caddy via compose