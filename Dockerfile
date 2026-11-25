FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund && node node_modules/playwright/cli.js install --with-deps chromium
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY tsconfig.json ./
RUN mkdir -p /app/.data && chown node:node /app/.data
ENV BREAKTRACE_CONTAINER=1 BREAKTRACE_DATA=/app/.data
USER node
EXPOSE 4311
CMD ["node", "--import", "tsx", "apps/api/main.ts"]
