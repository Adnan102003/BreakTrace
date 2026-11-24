FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund && npx playwright install --with-deps chromium
COPY . .
RUN npm run build && mkdir -p /app/.data && chown node:node /app/.data
ENV BREAKTRACE_CONTAINER=1 BREAKTRACE_DATA=/app/.data
USER node
EXPOSE 4311
CMD ["node", "--import", "tsx", "apps/api/main.ts"]
