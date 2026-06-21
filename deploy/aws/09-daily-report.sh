#!/usr/bin/env bash
# Step 7-b: 일일 인프라 보고 — EventBridge(매일 08:00 KST) → Lambda가 현황 수집 → Discord 웹훅.
#   알람(DISCORD_ALERT_WEBHOOK_URL)과 다른 채널: 일일보고는 DISCORD_REPORT_WEBHOOK_URL.
# 전제: deploy/aws/.env.prod 의 DISCORD_REPORT_WEBHOOK_URL → SSM(02-ssm-params.sh)에 저장됨.
# 사용: bash deploy/aws/09-daily-report.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws
ACCOUNT="$(account_id)"
DB_ID="${NAME}-pg"; REDIS_ID="${NAME}-redis"
[ -n "${INSTANCE_ID:-}" ] || die "INSTANCE_ID 없음 — 05-compute.sh 먼저."
TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT
require_cmd zip

WEBHOOK="$(aws ssm get-parameter --name "${SSM_PREFIX}/DISCORD_REPORT_WEBHOOK_URL" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || true)"
[ -n "$(none_to_empty "${WEBHOOK}")" ] || die "SSM ${SSM_PREFIX}/DISCORD_REPORT_WEBHOOK_URL 없음 — .env.prod에 추가 후 'bash deploy/aws/02-ssm-params.sh' 실행하세요."

# ── Lambda 실행 역할(조회만; Discord는 외부 HTTPS라 추가 권한 불필요) ──
RROLE="${NAME}-lambda-report-role"
if ! aws iam get-role --role-name "${RROLE}" >/dev/null 2>&1; then
  cat > "${TMP}/trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
  aws iam create-role --role-name "${RROLE}" --assume-role-policy-document "file://${TMP}/trust.json" \
    --tags "${TAG_PROJECT}" "${TAG_ENV}" >/dev/null
  ok "Lambda 역할 생성: ${RROLE}"
fi
aws iam attach-role-policy --role-name "${RROLE}" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
cat > "${TMP}/report-policy.json" <<'JSON'
{"Version":"2012-10-17","Statement":[
  {"Sid":"Describe","Effect":"Allow","Action":[
    "ec2:DescribeInstances","rds:DescribeDBInstances","elasticache:DescribeCacheClusters",
    "elasticloadbalancing:DescribeTargetHealth","elasticloadbalancing:DescribeTargetGroups",
    "elasticloadbalancing:DescribeLoadBalancers","cloudwatch:DescribeAlarms","ce:GetCostAndUsage"],
   "Resource":"*"}
]}
JSON
aws iam put-role-policy --role-name "${RROLE}" --policy-name "${NAME}-report-inline" \
  --policy-document "file://${TMP}/report-policy.json" >/dev/null
RROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${RROLE}"
ok "Lambda 역할 권한 설정: ${RROLE}"

# ── 일일보고 Lambda(→ Discord 웹훅) ──
( cd "${AWS_DIR}/lambda" && zip -j -q "${TMP}/report.zip" daily_report.py )
cat > "${TMP}/report-env.json" <<JSON
{"Variables":{
  "REGION":"${AWS_REGION}","INSTANCE_ID":"${INSTANCE_ID}",
  "DB_ID":"${DB_ID}","REDIS_ID":"${REDIS_ID}",
  "TG_ARNS":"${TG_WEB_ARN:-},${TG_API_ARN:-}",
  "DISCORD_REPORT_WEBHOOK_URL":"${WEBHOOK}"
}}
JSON
FUNC="${NAME}-daily-report"
if aws lambda get-function --region "${AWS_REGION}" --function-name "${FUNC}" >/dev/null 2>&1; then
  aws lambda update-function-code --region "${AWS_REGION}" --function-name "${FUNC}" --zip-file "fileb://${TMP}/report.zip" >/dev/null
  aws lambda wait function-updated --region "${AWS_REGION}" --function-name "${FUNC}"
  aws lambda update-function-configuration --region "${AWS_REGION}" --function-name "${FUNC}" \
    --handler daily_report.handler --runtime python3.12 --timeout 60 --memory-size 128 \
    --environment "file://${TMP}/report-env.json" --role "${RROLE_ARN}" >/dev/null
  aws lambda wait function-updated --region "${AWS_REGION}" --function-name "${FUNC}"
  ok "Lambda 갱신: ${FUNC}"
else
  n=0
  until aws lambda create-function --region "${AWS_REGION}" --function-name "${FUNC}" \
      --runtime python3.12 --handler daily_report.handler --role "${RROLE_ARN}" \
      --zip-file "fileb://${TMP}/report.zip" --timeout 60 --memory-size 128 \
      --environment "file://${TMP}/report-env.json" \
      --tags "Project=${PROJECT},Env=${ENVIRONMENT}" >/dev/null 2>&1; do
    n=$((n+1)); [ "$n" -ge 6 ] && die "Lambda 생성 실패(역할 전파): ${FUNC}"; sleep 5
  done
  ok "Lambda 생성: ${FUNC}"
fi
FUNC_ARN="$(aws lambda get-function --region "${AWS_REGION}" --function-name "${FUNC}" --query 'Configuration.FunctionArn' --output text)"

# ── EventBridge 스케줄(매일 23:00 UTC = 08:00 KST) ──
RULE="${NAME}-daily-report"
aws events put-rule --region "${AWS_REGION}" --name "${RULE}" \
  --schedule-expression "cron(0 23 * * ? *)" --state ENABLED \
  --description "AbleWork 인프라 일일보고 08:00 KST" >/dev/null
RULE_ARN="$(aws events describe-rule --region "${AWS_REGION}" --name "${RULE}" --query 'Arn' --output text)"
aws lambda add-permission --region "${AWS_REGION}" --function-name "${FUNC}" \
  --statement-id "events-invoke" --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn "${RULE_ARN}" >/dev/null 2>&1 || true
aws events put-targets --region "${AWS_REGION}" --rule "${RULE}" \
  --targets "Id=1,Arn=${FUNC_ARN}" >/dev/null
ok "스케줄: 매일 08:00 KST → ${FUNC} → Discord(보고 채널)"

echo "----------------------------------------------------------------"
log "수동 테스트: aws lambda invoke --region ${AWS_REGION} --function-name ${FUNC} /dev/stdout"
ok "09-daily-report 완료 (일일보고 → Discord 보고 채널)"
