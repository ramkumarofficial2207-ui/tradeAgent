# ── Stage 1: Build frontend ───────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/apex-intelligence
COPY apex-intelligence/package*.json ./
RUN npm ci
COPY apex-intelligence/ ./
RUN npm run build

# ── Stage 2: Build backend ────────────────────────────────────
FROM node:20-alpine AS backend-build
RUN apk add --no-cache openssl libc6-compat tzdata
WORKDIR /app
COPY package*.json ./
COPY prisma/ ./prisma/
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Runtime ──────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat tzdata
ENV TZ=Asia/Kolkata
ENV NODE_ENV=production
WORKDIR /app

# Install runtime dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built backend and prisma client
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/prisma ./prisma
COPY --from=backend-build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=backend-build /app/node_modules/.prisma ./node_modules/.prisma

# Copy built frontend
COPY --from=frontend-build /app/apex-intelligence/dist ./apex-intelligence/dist

# Expose port and start
EXPOSE 3000
CMD ["npm", "start"]
