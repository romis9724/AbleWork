# AbleWork 프로덕션 이미지 (멀티타겟: api / web)
# 빌드 컨텍스트 = 모노레포 루트. 서버(x86_64)에서 빌드한다.
# - API: 현 프로젝트 방식대로 ts-node 런타임으로 실행(공유 패키지가 TS 소스라 컴파일 대신 ts-node 사용)
# - WEB: next build → next start
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
ENV CI=true

# ---- deps: 워크스페이스 의존성 설치 (api/web + 공유 패키지만, mobile 제외) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json turbo.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
RUN pnpm install --frozen-lockfile --filter "./apps/api..." --filter "./apps/web..."

# ---- API (NestJS, ts-node 런타임) ----
FROM deps AS api
COPY apps/api ./apps/api
RUN pnpm --filter api exec prisma generate
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001
# 컨테이너 기동 시 마이그레이션 적용 후 서버 실행
CMD ["sh","-c","pnpm exec prisma migrate deploy && TS_NODE_TRANSPILE_ONLY=1 pnpm exec ts-node -r tsconfig-paths/register src/main.ts"]

# ---- WEB (Next.js) ----
FROM deps AS web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY apps/web ./apps/web
RUN pnpm --filter web build
ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm","exec","next","start","-p","3000"]
