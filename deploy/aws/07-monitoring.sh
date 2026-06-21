#!/usr/bin/env bash
# Step 6: 운영 모니터링(멱등) — SNS 알림 + CloudWatch 알람 + 대시보드 + 예산 + CWAgent(mem/disk).
#   알림 수신: ALERT_EMAIL (기본 romis@naver.com). 이메일 구독은 확인 링크 클릭 필요.
# 사용: bash deploy/aws/07-monitoring.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws

ALERT_EMAIL="${ALERT_EMAIL:-romis@naver.com}"
ACCOUNT="$(account_id)"
DB_ID="${NAME}-pg"; REDIS_ID="${NAME}-redis"
[ -n "${INSTANCE_ID:-}" ] || die "INSTANCE_ID 없음 — 05-compute.sh 먼저."
[ -n "${ALB_ARN:-}" ]     || die "ALB_ARN 없음 — 05-compute.sh 먼저."

# CloudWatch 차원 문자열 도출
ALB_DIM="${ALB_ARN##*:loadbalancer/}"
TGWEB_DIM="${TG_WEB_ARN##*:targetgroup/}"
TGAPI_DIM="${TG_API_ARN##*:targetgroup/}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-100}"

# ───────────────────────── SNS 토픽 + 이메일 구독 ─────────────────────────
ensure_topic() {  # region topicName → echo arn
  local region="$1" name="$2" arn
  arn="$(aws sns create-topic --region "${region}" --name "${name}" \
    --tags "Key=Project,Value=${PROJECT}" "Key=Env,Value=${ENVIRONMENT}" \
    --query 'TopicArn' --output text)"
  # 이메일 구독(이미 있으면 SNS가 중복 생성하지 않음)
  local subbed
  subbed="$(aws sns list-subscriptions-by-topic --region "${region}" --topic-arn "${arn}" \
    --query "Subscriptions[?Endpoint=='${ALERT_EMAIL}'] | [0].SubscriptionArn" --output text 2>/dev/null || true)"
  if [ -z "$(none_to_empty "${subbed}")" ]; then
    aws sns subscribe --region "${region}" --topic-arn "${arn}" \
      --protocol email --notification-endpoint "${ALERT_EMAIL}" >/dev/null
    warn "SNS 이메일 구독 요청: ${ALERT_EMAIL} (${region}) — 확인 메일의 링크를 클릭해야 활성화"
  else
    ok "SNS 구독 존재: ${ALERT_EMAIL} (${region})"
  fi
  echo "${arn}"
}
TOPIC_A="$(ensure_topic "${AWS_REGION}" "${NAME}-alerts")"          # ap-northeast-2: 대부분 알람
TOPIC_B="$(ensure_topic "${CF_ACM_REGION}" "${NAME}-alerts-use1")"  # us-east-1: CloudFront 알람
state_set SNS_TOPIC_ARN "${TOPIC_A}"; state_set SNS_TOPIC_ARN_USE1 "${TOPIC_B}"
ok "SNS 토픽: ${TOPIC_A}"

# ───────────────────────── CWAgent 설치(mem/disk) ─────────────────────────
APP_DIR="$(dirname "${BASH_SOURCE[0]}")/app"
aws s3 cp "${APP_DIR}/cwagent.json" "s3://${S3_BUCKET}/deploy/cwagent.json" >/dev/null
TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT
cat > "${TMP}/cw.json" <<JSON
{ "commands": [
  "set -e",
  "dnf install -y amazon-cloudwatch-agent",
  "aws s3 cp s3://${S3_BUCKET}/deploy/cwagent.json /opt/aws/amazon-cloudwatch-agent/etc/cwagent.json",
  "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/cwagent.json",
  "/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a status | grep -E 'status|version' || true"
] }
JSON
CWCMD="$(aws ssm send-command --instance-ids "${INSTANCE_ID}" --document-name AWS-RunShellScript \
  --comment "install cwagent" --parameters "file://${TMP}/cw.json" --query 'Command.CommandId' --output text)"
log "CWAgent 설치 SSM 명령: ${CWCMD} — 대기"
CWST="Pending"
for _ in $(seq 1 30); do
  sleep 6
  CWST="$(none_to_empty "$(aws ssm get-command-invocation --command-id "${CWCMD}" --instance-id "${INSTANCE_ID}" --query Status --output text 2>/dev/null || true)")"
  case "${CWST}" in Success|Failed|Cancelled|TimedOut) break;; esac
done
[ "${CWST}" = "Success" ] && ok "CWAgent 설치·기동 완료" || warn "CWAgent 설치 상태=${CWST} (mem/disk 알람은 지표 도착 후 활성)"

# ───────────────────────── CloudWatch 알람 ─────────────────────────
put_alarm() {  # region name ns metric stat period evalp thr cmp topic dims [missing]
  local region="$1" name="$2" ns="$3" metric="$4" stat="$5" period="$6" evalp="$7" thr="$8" cmp="$9" topic="${10}" dims="${11}" missing="${12:-notBreaching}"
  aws cloudwatch put-metric-alarm --region "${region}" \
    --alarm-name "${name}" --namespace "${ns}" --metric-name "${metric}" \
    --statistic "${stat}" --period "${period}" --evaluation-periods "${evalp}" \
    --threshold "${thr}" --comparison-operator "${cmp}" \
    --dimensions ${dims} \
    --alarm-actions "${topic}" --ok-actions "${topic}" \
    --treat-missing-data "${missing}" \
    --alarm-description "AbleWork ${ENVIRONMENT} ${name}" \
    --tags "Key=Project,Value=${PROJECT}" "Key=Env,Value=${ENVIRONMENT}" >/dev/null
  ok "alarm: ${name}"
}
R="${AWS_REGION}"
# EC2
put_alarm "$R" "${NAME}-ec2-cpu-high"       AWS/EC2 CPUUtilization      Average 300 3 85 GreaterThanThreshold          "$TOPIC_A" "Name=InstanceId,Value=${INSTANCE_ID}"
put_alarm "$R" "${NAME}-ec2-statuscheck"    AWS/EC2 StatusCheckFailed   Maximum 60  2 1  GreaterThanOrEqualToThreshold "$TOPIC_A" "Name=InstanceId,Value=${INSTANCE_ID}"
# RDS
put_alarm "$R" "${NAME}-rds-cpu-high"       AWS/RDS CPUUtilization      Average 300 3 85 GreaterThanThreshold "$TOPIC_A" "Name=DBInstanceIdentifier,Value=${DB_ID}"
put_alarm "$R" "${NAME}-rds-storage-low"    AWS/RDS FreeStorageSpace    Average 300 1 2147483648 LessThanThreshold "$TOPIC_A" "Name=DBInstanceIdentifier,Value=${DB_ID}"
put_alarm "$R" "${NAME}-rds-memory-low"     AWS/RDS FreeableMemory      Average 300 3 104857600  LessThanThreshold "$TOPIC_A" "Name=DBInstanceIdentifier,Value=${DB_ID}"
# ElastiCache
put_alarm "$R" "${NAME}-redis-cpu-high"     AWS/ElastiCache CPUUtilization                 Average 300 3 85 GreaterThanThreshold "$TOPIC_A" "Name=CacheClusterId,Value=${REDIS_ID}"
put_alarm "$R" "${NAME}-redis-memory-high"  AWS/ElastiCache DatabaseMemoryUsagePercentage  Average 300 3 85 GreaterThanThreshold "$TOPIC_A" "Name=CacheClusterId,Value=${REDIS_ID}"
# ALB
put_alarm "$R" "${NAME}-alb-5xx-high"       AWS/ApplicationELB HTTPCode_Target_5XX_Count Sum     300 1 10 GreaterThanThreshold "$TOPIC_A" "Name=LoadBalancer,Value=${ALB_DIM}"
put_alarm "$R" "${NAME}-alb-latency-high"   AWS/ApplicationELB TargetResponseTime        Average 300 3 2  GreaterThanThreshold "$TOPIC_A" "Name=LoadBalancer,Value=${ALB_DIM}"
put_alarm "$R" "${NAME}-alb-web-unhealthy"  AWS/ApplicationELB UnHealthyHostCount Maximum 60 3 1 GreaterThanOrEqualToThreshold "$TOPIC_A" "Name=TargetGroup,Value=${TGWEB_DIM} Name=LoadBalancer,Value=${ALB_DIM}"
put_alarm "$R" "${NAME}-alb-api-unhealthy"  AWS/ApplicationELB UnHealthyHostCount Maximum 60 3 1 GreaterThanOrEqualToThreshold "$TOPIC_A" "Name=TargetGroup,Value=${TGAPI_DIM} Name=LoadBalancer,Value=${ALB_DIM}"
# EC2 mem/disk (CWAgent) — 지표 도착 전엔 missing 처리
put_alarm "$R" "${NAME}-ec2-mem-high"       CWAgent mem_used_percent  Average 300 3 85 GreaterThanThreshold "$TOPIC_A" "Name=InstanceId,Value=${INSTANCE_ID}" missing
put_alarm "$R" "${NAME}-ec2-disk-high"      CWAgent disk_used_percent Average 300 1 80 GreaterThanThreshold "$TOPIC_A" "Name=InstanceId,Value=${INSTANCE_ID}" missing
# CloudFront (us-east-1 + TOPIC_B)
if [ -n "${CF_DIST_ID:-}" ]; then
  put_alarm "${CF_ACM_REGION}" "${NAME}-cf-5xx-high" AWS/CloudFront 5xxErrorRate Average 300 3 5 GreaterThanThreshold "$TOPIC_B" "Name=DistributionId,Value=${CF_DIST_ID} Name=Region,Value=Global"
else
  warn "CF_DIST_ID 없음 — CloudFront 알람 생략(06-edge.sh 후 재실행)"
fi

# ───────────────────────── 대시보드 ─────────────────────────
cat > "${TMP}/dash.json" <<JSON
{ "widgets": [
  {"type":"metric","x":0,"y":0,"width":12,"height":6,"properties":{"title":"EC2 CPU / Mem / Disk","region":"${R}","period":300,"stat":"Average","metrics":[
    ["AWS/EC2","CPUUtilization","InstanceId","${INSTANCE_ID}"],
    ["CWAgent","mem_used_percent","InstanceId","${INSTANCE_ID}"],
    ["CWAgent","disk_used_percent","InstanceId","${INSTANCE_ID}"]]}},
  {"type":"metric","x":12,"y":0,"width":12,"height":6,"properties":{"title":"RDS CPU / FreeStorage / FreeableMem","region":"${R}","period":300,"stat":"Average","metrics":[
    ["AWS/RDS","CPUUtilization","DBInstanceIdentifier","${DB_ID}"],
    ["AWS/RDS","FreeStorageSpace","DBInstanceIdentifier","${DB_ID}",{"yAxis":"right"}],
    ["AWS/RDS","FreeableMemory","DBInstanceIdentifier","${DB_ID}",{"yAxis":"right"}]]}},
  {"type":"metric","x":0,"y":6,"width":12,"height":6,"properties":{"title":"ElastiCache CPU / Memory%","region":"${R}","period":300,"stat":"Average","metrics":[
    ["AWS/ElastiCache","CPUUtilization","CacheClusterId","${REDIS_ID}"],
    ["AWS/ElastiCache","DatabaseMemoryUsagePercentage","CacheClusterId","${REDIS_ID}"]]}},
  {"type":"metric","x":12,"y":6,"width":12,"height":6,"properties":{"title":"ALB 5xx / Latency / Hosts","region":"${R}","period":300,"metrics":[
    ["AWS/ApplicationELB","HTTPCode_Target_5XX_Count","LoadBalancer","${ALB_DIM}",{"stat":"Sum"}],
    ["AWS/ApplicationELB","TargetResponseTime","LoadBalancer","${ALB_DIM}",{"stat":"Average","yAxis":"right"}],
    ["AWS/ApplicationELB","HealthyHostCount","TargetGroup","${TGWEB_DIM}","LoadBalancer","${ALB_DIM}",{"stat":"Average"}]]}},
  {"type":"metric","x":0,"y":12,"width":12,"height":6,"properties":{"title":"CloudFront Requests / 5xx%","region":"us-east-1","period":300,"metrics":[
    ["AWS/CloudFront","Requests","DistributionId","${CF_DIST_ID:-}","Region","Global",{"stat":"Sum"}],
    ["AWS/CloudFront","5xxErrorRate","DistributionId","${CF_DIST_ID:-}","Region","Global",{"stat":"Average","yAxis":"right"}]]}}
] }
JSON
aws cloudwatch put-dashboard --region "${R}" --dashboard-name "${NAME}" \
  --dashboard-body "file://${TMP}/dash.json" >/dev/null
ok "대시보드: ${NAME} (region ${R})"

# ───────────────────────── 예산(AWS Budgets) ─────────────────────────
if aws budgets describe-budget --account-id "${ACCOUNT}" --budget-name "${NAME}-monthly" >/dev/null 2>&1; then
  ok "예산 존재: ${NAME}-monthly"
else
  aws budgets create-budget --account-id "${ACCOUNT}" \
    --budget "{\"BudgetName\":\"${NAME}-monthly\",\"BudgetLimit\":{\"Amount\":\"${BUDGET_AMOUNT}\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}" \
    --notifications-with-subscribers "[{\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":80,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"${ALERT_EMAIL}\"}]},{\"Notification\":{\"NotificationType\":\"FORECASTED\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"${ALERT_EMAIL}\"}]}]" >/dev/null
  ok "예산 생성: ${NAME}-monthly (월 \$${BUDGET_AMOUNT}, 80% 실제·100% 예측 시 ${ALERT_EMAIL} 알림)"
fi

echo "----------------------------------------------------------------"
log "SNS: ${TOPIC_A}"
log "        ${TOPIC_B} (CloudFront용)"
log "대시보드: https://${R}.console.aws.amazon.com/cloudwatch/home?region=${R}#dashboards/dashboard/${NAME}"
warn "이메일(${ALERT_EMAIL}) 구독 확인 링크 2건(ap-northeast-2·us-east-1)을 클릭해야 알림이 발송됩니다."
echo "----------------------------------------------------------------"
ok "07-monitoring 완료"
