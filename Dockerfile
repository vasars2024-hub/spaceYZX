# Lethal Recoil game server image (used by deploy/docker-compose.yml on the rented server).
#
# Stage 1 installs everything, builds the game client (Vite) and bundles the server into one
# file. Stage 2 only has Node, that one file and the built client, so the image stays small and
# has no build tools in it.
#
# Build by hand (normally deploy/docker-compose.yml does it):
#   docker build -t lethal-recoil .

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- stage 1: build ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /src

# Dependencies first: this layer is reused as long as the package files don't change.
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci --no-audit --no-fund

# Then the source code, the client build and the server bundle.
COPY . .
ARG SPACEYZ_VERSION=server
ENV SPACEYZ_VERSION=${SPACEYZ_VERSION}
RUN npm run build \
 && npx tsx tools/deploy/bundle-server.ts --out /out/server.mjs \
 && cp -r packages/client/dist /out/client

# ---------- stage 2: run ----------
FROM ${NODE_IMAGE} AS run
ENV NODE_ENV=production \
    PORT=7777 \
    HOST=0.0.0.0 \
    SPACEYZ_DATA=/data \
    CLIENT_DIST=/app/client
WORKDIR /app
COPY --from=build /out/ /app/
# The database lives in /data (a folder on the server mounted here). "node" is the unprivileged
# user that comes with the Node image (uid 1000).
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 7777
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||7777)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
STOPSIGNAL SIGTERM
CMD ["node", "server.mjs"]
