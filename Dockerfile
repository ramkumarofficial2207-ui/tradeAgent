# ── Stage 1: Build frontend ───────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Build backend ────────────────────────────────────
FROM node:20-alpine AS backend-build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# Install runtime dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built backend and prisma client
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/prisma ./prisma
COPY --from=backend-build /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Expose port and start
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
