# Apex Production

Apex is a full-stack algorithmic trading research and paper-trading assistant for Indian equities. The production UI is `apex-intelligence`; the API is an Express and TypeScript service backed by PostgreSQL through Prisma.

## Safety defaults

The supplied environment template keeps the application in paper mode:

```env
PAPER_TRADING_MODE=true
ENABLE_LIVE_TRADING=false
ENABLE_AUTOMATION=false
```

Do not enable live trading until broker exit execution, reconciliation, idempotency, and operational monitoring have been validated in a dedicated release.

## Local verification

```bash
npm ci
npm --prefix apex-intelligence ci
npm test
npm run build
npm --prefix apex-intelligence run build
```

Copy `.env.example` to `.env`, configure PostgreSQL and a strong JWT secret, then run:

```bash
npx prisma migrate deploy
npm run dev
```

## Deployment

The repository includes Railway, Render, and Docker configuration. Production startup applies committed Prisma migrations before starting the API. Use `/api/health` for liveness and `/api/ready` for database readiness.

Secrets, broker tokens, runtime market data, local databases, logs, screenshots, generated builds, and dependency directories are intentionally excluded from version control and Docker build context.
