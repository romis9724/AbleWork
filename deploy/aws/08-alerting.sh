#!/usr/bin/env bash
# Step 7-a: 알람을 Discord로 — SNS→Discord 웹훅 Lambda(ap-ne-2+us-east-1) + 구독,
#   API 에러 로그 메트릭 필터/알람, 예산→Discord. (기존 이메일 구독은 유지)
# 전제: deploy/aws/.env.prod 의 DISCORD_ALERT_WEBHOOK_URL → SSM(02-ssm-params.sh)에 저장됨.
# 사용: bash deploy/aws/08-alerting.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws
ACCOUNT="$(account_id)"
[ -n "${SNS_TOPIC_ARN:-}" ]      || die "SNS_TOPIC_ARN 없음 — 07-monitoring.sh 먼저."
[ -n "${SNS_TOPIC_ARN_USE1:-}" ] || die "SNS_TOPIC_ARN_USE1 없음 — 07-monitoring.sh 먼저."
TOPIC_A="${SNS_TOPIC_ARN}"; TOPIC_B="${SNS_TOPIC_ARN_USE1}"

WEBHOOK="$(aws ssm get-parameter --name "${SSM_PREFIX}/DISCORD_ALERT_WEBHOOK_URL" --with-decryption --query 'Parameter.Value' --output text 2>/dev/null || true)"
[ -n "$(none_to_empty "${WEBHOOK}")" ] || die "SSM ${SSM_PREFIX}/DISCORD_ALERT_WEBHOOK_URL 없음 — .env.prod에 추가 후 'bash deploy/aws/02-ssm-params.sh' 실행하세요."

TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT
require_cmd zip

# ── Lambda 실행 역할(로그만) ──
LROLE="${NAME}-lambda-notify-role"
if ! aws iam get-role --role-name "${LROLE}" >/dev/null 2>&1; then
  cat > "${TMP}/trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
  aws iam create-role --role-name "${LROLE}" --assume-role-policy-document "file://${TMP}/trust.json" \
    --tags "${TAG_PROJECT}" "${TAG_ENV}" >/dev/null
  ok "Lambda 역할 생성: ${LROLE}"
fi
aws iam attach-role-policy --role-name "${LROLE}" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
LROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${LROLE}"

# ── Discord 중계 Lambda 패키지 ──
( cd "${AWS_DIR}/lambda" && zip -j -q "${TMP}/discord.zip" discord_notify.py )
cat > "${TMP}/discord-env.json" <<JSON
{"Variables":{"DISCORD_WEBHOOK_URL":"${WEBHOOK}"}}
JSON

deploy_lambda() {  # region func handler zip envfile
  local region="$1" func="$2" handler="$3" zip="$4" envfile="$5"
  if aws lambda get-function --region "${region}" --function-name "${func}" >/dev/null 2>&1; then
    aws lambda update-function-code --region "${region}" --function-name "${func}" --zip-file "fileb://${zip}" >/dev/null
    aws lambda wait function-updated --region "${region}" --function-name "${func}"
    aws lambda update-function-configuration --region "${region}" --function-name "${func}" \
      --handler "${handler}" --runtime python3.12 --timeout 30 --memory-size 128 \
      --environment "file://${envfile}" --role "${LROLE_ARN}" >/dev/null
    aws lambda wait function-updated --region "${region}" --function-name "${func}"
    ok "Lambda 갱신: ${func} (${region})"
  else
    local n=0
    until aws lambda create-function --region "${region}" --function-name "${func}" \
        --runtime python3.12 --handler "${handler}" --role "${LROLE_ARN}" \
        --zip-file "fileb://${zip}" --timeout 30 --memory-size 128 \
        --environment "file://${envfile}" \
        --tags "Project=${PROJECT},Env=${ENVIRONMENT}" >/dev/null 2>&1; do
      n=$((n+1)); [ "$n" -ge 6 ] && die "Lambda 생성 실패(역할 전파 대기 초과): ${func}"
      sleep 5  # IAM 역할 전파 대기
    done
    ok "Lambda 생성: ${func} (${region})"
  fi
}
deploy_lambda "${AWS_REGION}"   "${NAME}-discord-notify"      "discord_notify.handler" "${TMP}/discord.zip" "${TMP}/discord-env.json"
deploy_lambda "${CF_ACM_REGION}" "${NAME}-discord-notify-use1" "discord_notify.handler" "${TMP}/discord.zip" "${TMP}/discord-env.json"

# ── 토픽 → Lambda 구독 ──
subscribe_lambda() {  # region topic func
  local region="$1" topic="$2" func="$3"
  local farn; farn="$(aws lambda get-function --region "${region}" --function-name "${func}" --query 'Configuration.FunctionArn' --output text)"
  aws lambda add-permission --region "${region}" --function-name "${func}" \
    --statement-id "sns-invoke" --action lambda:InvokeFunction \
    --principal sns.amazonaws.com --source-arn "${topic}" >/dev/null 2>&1 || true
  local existing; existing="$(aws sns list-subscriptions-by-topic --region "${region}" --topic-arn "${topic}" \
    --query "Subscriptions[?Endpoint=='${farn}'] | [0].SubscriptionArn" --output text 2>/dev/null || true)"
  if [ -z "$(none_to_empty "${existing}")" ]; then
    aws sns subscribe --region "${region}" --topic-arn "${topic}" --protocol lambda --notification-endpoint "${farn}" >/dev/null
    ok "구독 추가: ${func} ← ${topic##*:}"
  else ok "구독 존재: ${func} ← ${topic##*:}"; fi
}
subscribe_lambda "${AWS_REGION}"   "${TOPIC_A}" "${NAME}-discord-notify"
subscribe_lambda "${CF_ACM_REGION}" "${TOPIC_B}" "${NAME}-discord-notify-use1"

# ── API 에러 로그 메트릭 필터 + 알람 ──
aws logs put-metric-filter --region "${AWS_REGION}" \
  --log-group-name /ablework/prod/api --filter-name "${NAME}-api-errors" \
  --filter-pattern '"ERROR"' \
  --metric-transformations metricName=ApiErrorCount,metricNamespace=AbleWork/Logs,metricValue=1,defaultValue=0 >/dev/null
ok "메트릭 필터: /ablework/prod/api \"ERROR\" → AbleWork/Logs:ApiErrorCount"
aws cloudwatch put-metric-alarm --region "${AWS_REGION}" \
  --alarm-name "${NAME}-api-errors" --namespace AbleWork/Logs --metric-name ApiErrorCount \
  --statistic Sum --period 300 --evaluation-periods 1 --threshold 0 --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions "${TOPIC_A}" --ok-actions "${TOPIC_A}" \
  --alarm-description "AbleWork API 에러 로그 발생(5분 내 ERROR ≥1)" \
  --tags "Key=Project,Value=${PROJECT}" "Key=Env,Value=${ENVIRONMENT}" >/dev/null
ok "알람: ${NAME}-api-errors → Discord(+이메일)"

# ── 예산 → Discord(us-east-1 토픽) ──
# TOPIC_B 정책: 계정·CloudWatch·Budgets 게시 허용
cat > "${TMP}/topicb-policy.json" <<JSON
{"Version":"2012-10-17","Id":"ablework-alerts","Statement":[
  {"Sid":"Owner","Effect":"Allow","Principal":{"AWS":"${ACCOUNT}"},"Action":["SNS:Publish","SNS:Subscribe","SNS:GetTopicAttributes","SNS:SetTopicAttributes"],"Resource":"${TOPIC_B}"},
  {"Sid":"CloudWatch","Effect":"Allow","Principal":{"Service":"cloudwatch.amazonaws.com"},"Action":"SNS:Publish","Resource":"${TOPIC_B}","Condition":{"StringEquals":{"AWS:SourceAccount":"${ACCOUNT}"}}},
  {"Sid":"Budgets","Effect":"Allow","Principal":{"Service":"budgets.amazonaws.com"},"Action":"SNS:Publish","Resource":"${TOPIC_B}","Condition":{"StringEquals":{"AWS:SourceAccount":"${ACCOUNT}"}}}
]}
JSON
aws sns set-topic-attributes --region "${CF_ACM_REGION}" --topic-arn "${TOPIC_B}" \
  --attribute-name Policy --attribute-value "file://${TMP}/topicb-policy.json" >/dev/null
ok "TOPIC_B 정책 갱신(Budgets 게시 허용)"
add_budget_sns() {  # notificationType comparison threshold
  aws budgets create-subscriber --account-id "${ACCOUNT}" --budget-name "${NAME}-monthly" \
    --notification "NotificationType=$1,ComparisonOperator=$2,Threshold=$3,ThresholdType=PERCENTAGE" \
    --subscriber "SubscriptionType=SNS,Address=${TOPIC_B}" >/dev/null 2>&1 \
    && ok "예산 SNS 구독 추가: $1 $2 $3%" || ok "예산 SNS 구독 존재/스킵: $1 $3%"
}
add_budget_sns ACTUAL GREATER_THAN 80
add_budget_sns FORECASTED GREATER_THAN 100

echo "----------------------------------------------------------------"
ok "08-alerting 완료 — 알람이 Discord로 전송됩니다(이메일도 유지). 테스트: 알람을 임시로 ALARM 상태로 두거나 set-alarm-state로 확인."
