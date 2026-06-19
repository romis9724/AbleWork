#!/usr/bin/env bash
# Step 3-a: 네트워크(멱등) — VPC·서브넷4·IGW·라우트·SG 4종. NAT Gateway 없음(비용 절감).
# 사용: bash deploy/aws/03-network.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws

VPC_CIDR="10.20.0.0/16"
AZ_A="${AWS_REGION}a"; AZ_C="${AWS_REGION}c"

tag_res() { aws ec2 create-tags --resources "$1" --tags "Key=Name,Value=$2" "${TAG_PROJECT}" "${TAG_ENV}" "${TAG_MANAGED}" >/dev/null; }
q() { local v; v="$(aws ec2 "$@" 2>/dev/null || true)"; none_to_empty "$v"; }

# ---- VPC ----
VPC_ID="$(q describe-vpcs --filters "Name=tag:Name,Values=${NAME}-vpc" --query 'Vpcs[0].VpcId' --output text)"
if [ -z "${VPC_ID}" ]; then
  VPC_ID="$(aws ec2 create-vpc --cidr-block "${VPC_CIDR}" --query 'Vpc.VpcId' --output text)"
  aws ec2 modify-vpc-attribute --vpc-id "${VPC_ID}" --enable-dns-support  >/dev/null
  aws ec2 modify-vpc-attribute --vpc-id "${VPC_ID}" --enable-dns-hostnames >/dev/null
  tag_res "${VPC_ID}" "${NAME}-vpc"
  ok "VPC 생성: ${VPC_ID}"
else ok "VPC 존재: ${VPC_ID}"; fi
state_set VPC_ID "${VPC_ID}"

# ---- 서브넷 ----
ensure_subnet() {  # nm cidr az public  → echo subnet-id
  local nm="$1" cidr="$2" az="$3" public="$4" sid
  sid="$(q describe-subnets --filters "Name=tag:Name,Values=${nm}" "Name=vpc-id,Values=${VPC_ID}" --query 'Subnets[0].SubnetId' --output text)"
  if [ -z "${sid}" ]; then
    sid="$(aws ec2 create-subnet --vpc-id "${VPC_ID}" --cidr-block "${cidr}" --availability-zone "${az}" --query 'Subnet.SubnetId' --output text)"
    tag_res "${sid}" "${nm}"
    [ "${public}" = "true" ] && aws ec2 modify-subnet-attribute --subnet-id "${sid}" --map-public-ip-on-launch >/dev/null
    ok "서브넷 생성: ${nm} (${sid})"
  else ok "서브넷 존재: ${nm} (${sid})"; fi
  echo "${sid}"
}
SUBNET_PUB_A="$(ensure_subnet "${NAME}-public-a"  10.20.0.0/24  "${AZ_A}" true)"
SUBNET_PUB_C="$(ensure_subnet "${NAME}-public-c"  10.20.1.0/24  "${AZ_C}" true)"
SUBNET_PRV_A="$(ensure_subnet "${NAME}-private-a" 10.20.10.0/24 "${AZ_A}" false)"
SUBNET_PRV_C="$(ensure_subnet "${NAME}-private-c" 10.20.11.0/24 "${AZ_C}" false)"
state_set SUBNET_PUB_A "${SUBNET_PUB_A}"; state_set SUBNET_PUB_C "${SUBNET_PUB_C}"
state_set SUBNET_PRV_A "${SUBNET_PRV_A}"; state_set SUBNET_PRV_C "${SUBNET_PRV_C}"

# ---- IGW ----
IGW_ID="$(q describe-internet-gateways --filters "Name=tag:Name,Values=${NAME}-igw" --query 'InternetGateways[0].InternetGatewayId' --output text)"
if [ -z "${IGW_ID}" ]; then
  IGW_ID="$(aws ec2 create-internet-gateway --query 'InternetGateway.InternetGatewayId' --output text)"
  tag_res "${IGW_ID}" "${NAME}-igw"
  ok "IGW 생성: ${IGW_ID}"
else ok "IGW 존재: ${IGW_ID}"; fi
aws ec2 attach-internet-gateway --internet-gateway-id "${IGW_ID}" --vpc-id "${VPC_ID}" >/dev/null 2>&1 || true
state_set IGW_ID "${IGW_ID}"

# ---- 퍼블릭 라우트테이블 ----
RT_ID="$(q describe-route-tables --filters "Name=tag:Name,Values=${NAME}-public-rt" "Name=vpc-id,Values=${VPC_ID}" --query 'RouteTables[0].RouteTableId' --output text)"
if [ -z "${RT_ID}" ]; then
  RT_ID="$(aws ec2 create-route-table --vpc-id "${VPC_ID}" --query 'RouteTable.RouteTableId' --output text)"
  tag_res "${RT_ID}" "${NAME}-public-rt"
  ok "퍼블릭 라우트테이블 생성: ${RT_ID}"
else ok "퍼블릭 라우트테이블 존재: ${RT_ID}"; fi
aws ec2 create-route --route-table-id "${RT_ID}" --destination-cidr-block 0.0.0.0/0 --gateway-id "${IGW_ID}" >/dev/null 2>&1 || true
for s in "${SUBNET_PUB_A}" "${SUBNET_PUB_C}"; do
  aws ec2 associate-route-table --route-table-id "${RT_ID}" --subnet-id "${s}" >/dev/null 2>&1 || true
done
ok "퍼블릭 서브넷 라우트 연결(→IGW) 확인 (프라이빗은 NAT 없이 로컬 전용)"
state_set PUBLIC_RT_ID "${RT_ID}"

# ---- 보안그룹 ----
ensure_sg() {  # nm desc → echo group-id
  local nm="$1" desc="$2" gid
  gid="$(q describe-security-groups --filters "Name=group-name,Values=${nm}" "Name=vpc-id,Values=${VPC_ID}" --query 'SecurityGroups[0].GroupId' --output text)"
  if [ -z "${gid}" ]; then
    gid="$(aws ec2 create-security-group --group-name "${nm}" --description "${desc}" --vpc-id "${VPC_ID}" --query 'GroupId' --output text)"
    aws ec2 create-tags --resources "${gid}" --tags "Key=Name,Value=${nm}" "${TAG_PROJECT}" "${TAG_ENV}" >/dev/null
    ok "SG 생성: ${nm} (${gid})"
  else ok "SG 존재: ${nm} (${gid})"; fi
  echo "${gid}"
}
ALB_SG="$(ensure_sg "${NAME}-alb-sg"   "AbleWork ALB - ingress from CloudFront only")"
EC2_SG="$(ensure_sg "${NAME}-ec2-sg"   "AbleWork app EC2 - web/api from ALB")"
RDS_SG="$(ensure_sg "${NAME}-rds-sg"   "AbleWork RDS Postgres - from EC2")"
REDIS_SG="$(ensure_sg "${NAME}-redis-sg" "AbleWork ElastiCache Redis - from EC2")"
state_set ALB_SG "${ALB_SG}"; state_set EC2_SG "${EC2_SG}"
state_set RDS_SG "${RDS_SG}"; state_set REDIS_SG "${REDIS_SG}"

# CloudFront origin-facing 관리형 prefix list (ALB ingress 제한용)
CF_PL="$(aws ec2 describe-managed-prefix-lists --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" --query 'PrefixLists[0].PrefixListId' --output text 2>/dev/null || true)"
CF_PL="$(none_to_empty "${CF_PL}")"
state_set CF_PREFIX_LIST "${CF_PL}"

allow() { aws ec2 authorize-security-group-ingress "$@" >/dev/null 2>&1 || true; }
# ALB: 80 from CloudFront prefix list (없으면 임시로 0.0.0.0/0 — 06-edge에서 좁힘)
if [ -n "${CF_PL}" ]; then
  allow --group-id "${ALB_SG}" --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=${CF_PL},Description=cloudfront-origin-facing}]"
  ok "ALB ingress: 80 ← CloudFront prefix list (${CF_PL})"
else
  warn "CloudFront prefix list 미발견 — ALB 80을 임시 0.0.0.0/0 으로 개방(06-edge에서 좁힐 것)"
  allow --group-id "${ALB_SG}" --protocol tcp --port 80 --cidr 0.0.0.0/0
fi
# EC2: 3000/3001 ← ALB SG
allow --group-id "${EC2_SG}" --ip-permissions "IpProtocol=tcp,FromPort=3000,ToPort=3000,UserIdGroupPairs=[{GroupId=${ALB_SG}}]"
allow --group-id "${EC2_SG}" --ip-permissions "IpProtocol=tcp,FromPort=3001,ToPort=3001,UserIdGroupPairs=[{GroupId=${ALB_SG}}]"
ok "EC2 ingress: 3000/3001 ← ALB SG"
# RDS: 5432 ← EC2 SG / Redis: 6379 ← EC2 SG
allow --group-id "${RDS_SG}"   --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=${EC2_SG}}]"
allow --group-id "${REDIS_SG}" --ip-permissions "IpProtocol=tcp,FromPort=6379,ToPort=6379,UserIdGroupPairs=[{GroupId=${EC2_SG}}]"
ok "RDS 5432 / Redis 6379 ← EC2 SG"

echo "----------------------------------------------------------------"
log "VPC=${VPC_ID}  IGW=${IGW_ID}"
log "public: ${SUBNET_PUB_A}, ${SUBNET_PUB_C}   private: ${SUBNET_PRV_A}, ${SUBNET_PRV_C}"
log "SG: alb=${ALB_SG} ec2=${EC2_SG} rds=${RDS_SG} redis=${REDIS_SG}"
echo "----------------------------------------------------------------"
ok "03-network 완료 (상태파일: ${STATE_FILE})"
