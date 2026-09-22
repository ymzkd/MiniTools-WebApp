# Multi-stage build for Dokploy.
# Build the Vite SPA, then run the Express server (server.js) which serves
# dist/ and the MLIT/KuniJiban API proxies. A Dockerfile is used instead of
# nixpacks because nixpacks auto-detects the Vite app as a static site and
# serves it with Caddy, which would drop the /api/* proxy routes.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js ./
# Keep production and PR-preview images distinct (Dokploy sets
# BUILD_TARGET=preview for previews). Without this, a merge builds the same
# tree as its preview, both tags share one image ID, and Dokploy's nightly
# `docker image prune -a` strips the production tag, so the service can't
# restart after a host reboot. Declared last so every layer above stays cached.
ARG BUILD_TARGET=production
LABEL minitools.build-target=$BUILD_TARGET
EXPOSE 3000
CMD ["node", "server.js"]
