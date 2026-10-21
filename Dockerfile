# Moccapp: una sola imagen con la API y la app (PWA).
# Railway / Render / Fly la detectan sola. Los archivos subidos van a /data (monta un volumen ahí).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/client/dist \
    STORAGE_DIR=/data/uploads
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/drizzle ./server/drizzle
COPY --from=build /app/client/dist ./client/dist
WORKDIR /app/server
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.js"]
