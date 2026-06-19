#!/bin/bash
# EC2에서 실행 — SSM Parameter Store(/ablework/api/prod/*)를 읽어 .env.app / .env.web 생성.
set -euo pipefail
PREFIX="/ablework/api/prod"
REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
APP_ENV="/opt/ablework/.env.app"
WEB_ENV="/opt/ablework/.env.web"

: > "${APP_ENV}"
aws ssm get-parameters-by-path --region "${REGION}" --path "${PREFIX}" --recursive --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text | while IFS=$'\t' read -r name value; do
  key="${name##*/}"
  printf '%s=%s\n' "${key}" "${value}" >> "${APP_ENV}"
done
echo "NODE_ENV=production" >> "${APP_ENV}"

# web 컨테이너: 미들웨어 JWT 검증용 JWT_SECRET + NODE_ENV
JWT="$(aws ssm get-parameter --region "${REGION}" --name "${PREFIX}/JWT_SECRET" --with-decryption --query Parameter.Value --output text)"
{ printf 'JWT_SECRET=%s\n' "${JWT}"; echo "NODE_ENV=production"; } > "${WEB_ENV}"

echo "env 파일 생성 완료: ${APP_ENV} ($(wc -l < "${APP_ENV}") keys), ${WEB_ENV}"
