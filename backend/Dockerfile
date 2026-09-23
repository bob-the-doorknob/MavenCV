FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY mobile/package.json ./mobile/package.json
RUN npm ci --workspace @trajectory/backend --include-workspace-root=false

COPY backend ./backend
RUN npm run build --workspace @trajectory/backend
RUN npm prune --omit=dev --workspace @trajectory/backend --include-workspace-root=false

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist

USER node
EXPOSE 8080

CMD ["node", "backend/dist/index.js"]
