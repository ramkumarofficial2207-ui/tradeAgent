# ── Stage 1: Build frontend ───────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Backend runtime ──────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install backend deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source + built prisma + env
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY tsconfig.json ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Build TypeScript
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
