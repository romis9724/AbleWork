#!/usr/bin/env bash
# Step 1-c: SSM Parameter Store에 앱 환경변수/비밀 등록(멱등).
#   - deploy/aws/.env.prod (git-ignore) 의 KEY=VALUE 들을 ${SSM_PREFIX}/KEY 로 put.
#   - 비밀 키는 SecureString, 그 외 String.
#   - JWT_SECRET 이 파일·SSM 양쪽에 없으면 자동 생성.
#   - DATABASE_URL / REDIS_URL 은 비워두면 04-data.sh 가 RDS/ElastiCache 생성 후 채운다.
# 사용: cp deploy/aws/.env.prod.example deploy/aws/.env.prod && (값 채우기) && bash deploy/aws/02-ssm-params.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ensure_aws

ENV_FILE="${AWS_DIR}/.env.prod"
[ -f "${ENV_FILE}" ] || die ".env.prod 가 없습니다. '${AWS_DIR}/.env.prod.example' 를 복사해 값을 채우세요."

# 비밀로 분류할 키(SecureString)
SECURE_KEYS=" DATABASE_URL REDIS_URL JWT_SECRET MAIL_USER MAIL_PASS "

put_param() {
  local key="$1" val="$2" type="String"
  case "${SECURE_KEYS}" in *" ${key} "*) type="SecureString";; esac
  aws ssm put-parameter --name "${SSM_PREFIX}/${key}" --type "${type}" \
    --value "${val}" --overwrite \
    --tags "${TAG_PROJECT}" "${TAG_ENV}" >/dev/null 2>&1 \
    || aws ssm put-parameter --name "${SSM_PREFIX}/${key}" --type "${type}" \
         --value "${val}" --overwrite >/dev/null  # 이미 존재 시 --tags 불가 → 재시도
  ok "SSM put: ${SSM_PREFIX}/${key} (${type})"
}

HAS_JWT="false"
# .env.prod 파싱 (주석/빈줄 스킵, 첫 '=' 기준 분리, 따옴표 제거)
while IFS= read -r line || [ -n "${line}" ]; do
  line="${line#"${line%%[![:space:]]*}"}"          # 좌측 공백 제거
  [ -z "${line}" ] && continue
  case "${line}" in \#*) continue;; esac
  case "${line}" in *=*) :;; *) continue;; esac
  key="${line%%=*}"; val="${line#*=}"
  key="${key%%[[:space:]]*}"                        # 키 우측 공백 제거
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  [ -z "${val}" ] && { warn "값 비어있음 — 스킵: ${key}"; continue; }
  [ "${key}" = "JWT_SECRET" ] && HAS_JWT="true"
  put_param "${key}" "${val}"
done < "${ENV_FILE}"

# JWT_SECRET 보장: 파일에 없고 SSM에도 없으면 생성
if [ "${HAS_JWT}" = "false" ]; then
  if aws ssm get-parameter --name "${SSM_PREFIX}/JWT_SECRET" >/dev/null 2>&1; then
    ok "JWT_SECRET 이미 SSM에 존재 — 유지"
  else
    require_cmd openssl
    GEN="$(openssl rand -base64 48 | tr -d '\n')"
    put_param "JWT_SECRET" "${GEN}"
    ok "JWT_SECRET 자동 생성·저장(48바이트 base64)"
  fi
fi

echo "----------------------------------------------------------------"
log "등록된 파라미터(${SSM_PREFIX}/):"
aws ssm get-parameters-by-path --path "${SSM_PREFIX}" --recursive \
  --query 'Parameters[].Name' --output text | tr '\t' '\n' | sed 's#^#  #' >&2 || true
echo "----------------------------------------------------------------"
warn "DATABASE_URL / REDIS_URL 이 아직 없으면 04-data.sh 실행 시 자동 등록됩니다."
ok "02-ssm-params 완료"
