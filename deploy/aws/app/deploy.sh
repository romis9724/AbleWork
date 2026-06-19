#!/bin/bash
# EC2에서 실행(/opt/ablework) — ECR 로그인 → env 생성 → compose pull/up → 최초 1회 seed.
# (DB 마이그레이션은 api 컨테이너가 부팅 시 'prisma migrate deploy'로 자동 수행)
set -euo pipefail
cd /opt/ablework
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
export ECR_REGISTRY="${ACCOUNT}.dkr.ecr.${AWS_DEFAULT_REGION}.amazonaws.com"
aws ecr get-login-password | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

bash fetch-env.sh

docker compose -f docker-compose.aws.yml pull
docker compose -f docker-compose.aws.yml up -d

echo "api 컨테이너 기동 대기..."
sleep 15
docker compose -f docker-compose.aws.yml ps

# 최초 1회 시드(마커 파일로 가드)
if [ ! -f /opt/ablework/.seeded ]; then
  echo "최초 시드 실행..."
  if docker compose -f docker-compose.aws.yml exec -T api sh -c 'TS_NODE_TRANSPILE_ONLY=1 pnpm exec ts-node prisma/seed.ts'; then
    touch /opt/ablework/.seeded
    echo "seed done"
  else
    echo "seed failed — 다음 배포에서 재시도(마커 미생성)"
  fi
else
  echo "이미 시드됨(.seeded) — 건너뜀"
fi
echo "DEPLOY DONE"
