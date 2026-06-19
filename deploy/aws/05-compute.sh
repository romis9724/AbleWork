#!/usr/bin/env bash
# Step 4: 컴퓨트(멱등) — EC2(app) + ALB + 타깃그룹 + 리스너(/api/* 분기).
# 사용: bash deploy/aws/05-compute.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws
[ -n "${VPC_ID:-}" ]  || die "VPC_ID 없음 — 03-network.sh 먼저."
[ -n "${EC2_SG:-}" ]  || die "EC2_SG 없음 — 03-network.sh 먼저."

TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT
AMI_ID="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query Parameter.Value --output text)"

# ---- EC2 인스턴스 ----
INSTANCE_ID="$(none_to_empty "$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=${NAME}-app" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || true)")"
if [ -z "${INSTANCE_ID}" ]; then
  cat > "${TMP}/user-data.sh" <<'UD'
#!/bin/bash
set -e
dnf update -y
dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user || true
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
mkdir -p /opt/ablework
UD
  INSTANCE_ID="$(aws ec2 run-instances \
    --image-id "${AMI_ID}" --instance-type t4g.small \
    --iam-instance-profile "Name=${EC2_PROFILE_NAME}" \
    --subnet-id "${SUBNET_PUB_A}" --security-group-ids "${EC2_SG}" \
    --user-data "file://${TMP}/user-data.sh" \
    --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3","Encrypted":true}}]' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME}-app},{Key=Project,Value=${PROJECT}},{Key=Env,Value=${ENVIRONMENT}}]" \
    --query 'Instances[0].InstanceId' --output text)"
  ok "EC2 생성: ${INSTANCE_ID} (t4g.small, AL2023 arm64, docker user-data)"
else
  ok "EC2 존재: ${INSTANCE_ID}"
fi
state_set INSTANCE_ID "${INSTANCE_ID}"

# ---- ALB ----
ALB_ARN="$(none_to_empty "$(aws elbv2 describe-load-balancers --names "${NAME}-alb" --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)")"
if [ -z "${ALB_ARN}" ]; then
  ALB_ARN="$(aws elbv2 create-load-balancer --name "${NAME}-alb" --type application --scheme internet-facing \
    --subnets "${SUBNET_PUB_A}" "${SUBNET_PUB_C}" --security-groups "${ALB_SG}" \
    --tags "Key=Project,Value=${PROJECT}" "Key=Env,Value=${ENVIRONMENT}" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)"
  ok "ALB 생성: ${ALB_ARN}"
else ok "ALB 존재: ${ALB_ARN}"; fi
ALB_DNS="$(aws elbv2 describe-load-balancers --load-balancer-arns "${ALB_ARN}" --query 'LoadBalancers[0].DNSName' --output text)"
state_set ALB_ARN "${ALB_ARN}"; state_set ALB_DNS "${ALB_DNS}"

# ---- 타깃그룹 ----
ensure_tg() {  # name port healthpath → echo arn
  local nm="$1" port="$2" hp="$3" arn
  arn="$(none_to_empty "$(aws elbv2 describe-target-groups --names "${nm}" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || true)")"
  if [ -z "${arn}" ]; then
    arn="$(aws elbv2 create-target-group --name "${nm}" --protocol HTTP --port "${port}" \
      --vpc-id "${VPC_ID}" --target-type instance \
      --health-check-protocol HTTP --health-check-path "${hp}" --matcher HttpCode=200-399 \
      --health-check-interval-seconds 30 --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
      --query 'TargetGroups[0].TargetGroupArn' --output text)"
    ok "타깃그룹 생성: ${nm} (:${port} hc=${hp})"
  else ok "타깃그룹 존재: ${nm}"; fi
  echo "${arn}"
}
TG_WEB_ARN="$(ensure_tg "${NAME}-tg-web" 3000 /login)"
TG_API_ARN="$(ensure_tg "${NAME}-tg-api" 3001 /api)"
state_set TG_WEB_ARN "${TG_WEB_ARN}"; state_set TG_API_ARN "${TG_API_ARN}"

# 인스턴스를 두 타깃그룹에 등록(멱등) — 등록 후 확인, 누락 시 1회 재시도
register_target() {  # tg-arn
  local tg="$1"
  aws elbv2 register-targets --target-group-arn "${tg}" --targets "Id=${INSTANCE_ID}" >/dev/null 2>&1 || true
  if [ -z "$(none_to_empty "$(aws elbv2 describe-target-health --target-group-arn "${tg}" --query 'TargetHealthDescriptions[0].Target.Id' --output text 2>/dev/null || true)")" ]; then
    sleep 2
    aws elbv2 register-targets --target-group-arn "${tg}" --targets "Id=${INSTANCE_ID}" >/dev/null 2>&1 || true
  fi
}
register_target "${TG_WEB_ARN}"
register_target "${TG_API_ARN}"
ok "EC2를 web/api 타깃그룹에 등록(확인 포함)"

# ---- 리스너(:80) + /api/* 규칙 ----
LISTENER_ARN="$(none_to_empty "$(aws elbv2 describe-listeners --load-balancer-arn "${ALB_ARN}" --query 'Listeners[?Port==`80`].ListenerArn | [0]' --output text 2>/dev/null || true)")"
if [ -z "${LISTENER_ARN}" ]; then
  LISTENER_ARN="$(aws elbv2 create-listener --load-balancer-arn "${ALB_ARN}" --protocol HTTP --port 80 \
    --default-actions "Type=forward,TargetGroupArn=${TG_WEB_ARN}" \
    --query 'Listeners[0].ListenerArn' --output text)"
  ok "리스너 생성: :80 → web(default)"
else ok "리스너 존재: :80"; fi
state_set LISTENER_ARN "${LISTENER_ARN}"

API_RULE="$(none_to_empty "$(aws elbv2 describe-rules --listener-arn "${LISTENER_ARN}" \
  --query "Rules[?Conditions[?Field=='path-pattern' && contains(Values, '/api/*')]].RuleArn | [0]" --output text 2>/dev/null || true)")"
if [ -z "${API_RULE}" ]; then
  aws elbv2 create-rule --listener-arn "${LISTENER_ARN}" --priority 10 \
    --conditions "Field=path-pattern,Values=/api/*" \
    --actions "Type=forward,TargetGroupArn=${TG_API_ARN}" >/dev/null
  ok "리스너 규칙 생성: /api/* → api"
else ok "리스너 규칙 존재: /api/* → api"; fi

echo "----------------------------------------------------------------"
log "EC2=${INSTANCE_ID}"
log "ALB DNS=${ALB_DNS}"
log "TG web=${TG_WEB_ARN}"
log "TG api=${TG_API_ARN}"
echo "----------------------------------------------------------------"
ok "05-compute 완료 (다음: 이미지 빌드 후 deploy-app.sh, 그리고 06-edge.sh)"
