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
EXPOSE 3000
CMD ["node", "server.js"]
