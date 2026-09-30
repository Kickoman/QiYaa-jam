FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY server/package.json server/
RUN npm ci --workspace server --include-workspace-root
COPY spec/jam/protocol spec/jam/protocol
COPY server server
RUN npm run generate --workspace server && npm run build --workspace server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8090
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8090/healthz || exit 1
CMD ["node", "server/dist/main.js"]
