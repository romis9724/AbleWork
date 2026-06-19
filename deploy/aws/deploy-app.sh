#!/usr/bin/env bash
# 앱 배포(로컬 오케스트레이터) — 배포 자산을 S3에 올리고 EC2에서 SSM로 deploy.sh 실행.
#   전제: 이미지가 ECR에 푸시됨, RDS/Redis 가용(SSM DATABASE_URL/REDIS_URL 기록됨),
#         EC2가 SSM 관리 대상(Online).
# 사용: bash deploy/aws/deploy-app.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws
[ -n "${INSTANCE_ID:-}" ] || die "INSTANCE_ID 없음 — 05-compute.sh 먼저."

# SSM 관리 상태 확인
PING="$(none_to_empty "$(aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
  --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null || true)")"
if [ "${PING}" != "Online" ]; then
  warn "EC2가 아직 SSM Online 아님(상태=${PING:-none}). user-data(docker 설치)·SSM 등록 대기 후 재실행하세요."
  exit 1
fi
ok "EC2 SSM Online: ${INSTANCE_ID}"

# DATABASE_URL/REDIS_URL 존재 확인(없으면 컨테이너 부팅 마이그레이션 실패)
for k in DATABASE_URL REDIS_URL; do
  aws ssm get-parameter --name "${SSM_PREFIX}/${k}" >/dev/null 2>&1 \
    || die "${SSM_PREFIX}/${k} 없음 — 04-data.sh(가용 후) 재실행으로 채우세요."
done
ok "SSM DATABASE_URL/REDIS_URL 확인"

# 배포 자산 S3 업로드
APP_DIR="$(dirname "${BASH_SOURCE[0]}")/app"
for f in docker-compose.aws.yml fetch-env.sh deploy.sh; do
  aws s3 cp "${APP_DIR}/${f}" "s3://${S3_BUCKET}/deploy/${f}" >/dev/null
done
ok "배포 자산 S3 업로드: s3://${S3_BUCKET}/deploy/"

# SSM RunShellScript
TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT
cat > "${TMP}/params.json" <<JSON
{ "commands": [
  "set -e",
  "mkdir -p /opt/ablework && cd /opt/ablework",
  "for f in docker-compose.aws.yml fetch-env.sh deploy.sh; do aws s3 cp s3://${S3_BUCKET}/deploy/\$f /opt/ablework/\$f; done",
  "bash /opt/ablework/deploy.sh"
] }
JSON
CMD_ID="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript --comment "AbleWork deploy" \
  --parameters "file://${TMP}/params.json" \
  --cloud-watch-output-config "CloudWatchOutputEnabled=true,CloudWatchLogGroupName=/ablework/ssm-deploy" \
  --query 'Command.CommandId' --output text)"
ok "SSM 명령 전송: ${CMD_ID} — 진행 폴링(최대 10분)"

STATUS="Pending"
for _ in $(seq 1 60); do
  sleep 10
  STATUS="$(none_to_empty "$(aws ssm get-command-invocation --command-id "${CMD_ID}" --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)")"
  log "  status=${STATUS}"
  case "${STATUS}" in Success|Failed|Cancelled|TimedOut) break;; esac
done

echo "================ STDOUT ================"
aws ssm get-command-invocation --command-id "${CMD_ID}" --instance-id "${INSTANCE_ID}" --query StandardOutputContent --output text 2>/dev/null || true
echo "================ STDERR ================"
aws ssm get-command-invocation --command-id "${CMD_ID}" --instance-id "${INSTANCE_ID}" --query StandardErrorContent --output text 2>/dev/null || true
echo "========================================"
[ "${STATUS}" = "Success" ] && ok "배포 성공" || die "배포 상태=${STATUS} — 위 로그 확인"
