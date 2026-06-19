#!/usr/bin/env bash
# Step 3-b: 데이터 계층(멱등) — S3 버킷 + RDS PostgreSQL + ElastiCache Redis.
#   생성은 즉시 반환되고(비동기), 가용 상태가 되면 DATABASE_URL/REDIS_URL 을 SSM에 기록한다.
#   → 최초 1회 실행으로 생성, 가용 후 다시 실행하면 SSM URL이 채워진다(멱등).
# 사용: bash deploy/aws/04-data.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
ensure_aws
[ -n "${VPC_ID:-}" ] || die "VPC_ID 상태값 없음 — 먼저 03-network.sh 를 실행하세요."

DB_USER="ablework"; DB_NAME="ablework"
DB_ID="${NAME}-pg"; REDIS_ID="${NAME}-redis"
DB_SUBNET_GROUP="${NAME}-db-subnets"; REDIS_SUBNET_GROUP="${NAME}-redis-subnets"

# =============== S3 (첨부 파일) ===============
if aws s3api head-bucket --bucket "${S3_BUCKET}" 2>/dev/null; then
  ok "S3 버킷 존재: ${S3_BUCKET}"
else
  aws s3api create-bucket --bucket "${S3_BUCKET}" --region "${AWS_REGION}" \
    --create-bucket-configuration LocationConstraint="${AWS_REGION}" >/dev/null
  aws s3api put-public-access-block --bucket "${S3_BUCKET}" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true >/dev/null
  aws s3api put-bucket-encryption --bucket "${S3_BUCKET}" \
    --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' >/dev/null
  aws s3api put-bucket-tagging --bucket "${S3_BUCKET}" \
    --tagging "TagSet=[{Key=Project,Value=${PROJECT}},{Key=Env,Value=${ENVIRONMENT}}]" >/dev/null 2>&1 || true
  ok "S3 버킷 생성: ${S3_BUCKET} (퍼블릭 차단·SSE-S3)"
fi

# =============== RDS PostgreSQL ===============
if aws rds describe-db-subnet-groups --db-subnet-group-name "${DB_SUBNET_GROUP}" >/dev/null 2>&1; then
  ok "DB 서브넷 그룹 존재: ${DB_SUBNET_GROUP}"
else
  aws rds create-db-subnet-group --db-subnet-group-name "${DB_SUBNET_GROUP}" \
    --db-subnet-group-description "AbleWork RDS private subnets" \
    --subnet-ids "${SUBNET_PRV_A}" "${SUBNET_PRV_C}" \
    --tags "Key=Project,Value=${PROJECT}" "Key=Env,Value=${ENVIRONMENT}" >/dev/null
  ok "DB 서브넷 그룹 생성: ${DB_SUBNET_GROUP}"
fi

if aws rds describe-db-instances --db-instance-identifier "${DB_ID}" >/dev/null 2>&1; then
  ok "RDS 인스턴스 존재: ${DB_ID}"
else
  PG_VERSION="${PG_VERSION:-$(aws rds describe-db-engine-versions --engine postgres \
    --query 'DBEngineVersions[?starts_with(EngineVersion, `16.`)].EngineVersion | [-1]' --output text)}"
  [ -n "${RDS_PASSWORD:-}" ] || RDS_PASSWORD="$(openssl rand -hex 20)"
  state_set RDS_PASSWORD "${RDS_PASSWORD}"   # 재실행 시 DATABASE_URL 재구성을 위해 보관(.state, gitignore)
  log "RDS 생성 시작 (postgres ${PG_VERSION}, db.t4g.micro, Single-AZ, gp3 20GB) — 수 분 소요"
  aws rds create-db-instance \
    --db-instance-identifier "${DB_ID}" \
    --engine postgres --engine-version "${PG_VERSION}" \
    --db-instance-class db.t4g.micro \
    --allocated-storage 20 --storage-type gp3 --storage-encrypted \
    --master-username "${DB_USER}" --master-user-password "${RDS_PASSWORD}" \
    --db-name "${DB_NAME}" --port 5432 \
    --db-subnet-group-name "${DB_SUBNET_GROUP}" \
    --vpc-security-group-ids "${RDS_SG}" \
    --no-multi-az --no-publicly-accessible \
    --backup-retention-period 7 \
    --tags "Key=Project,Value=${PROJECT}" "Key=Env,Value=${ENVIRONMENT}" >/dev/null
  ok "RDS 생성 요청 완료: ${DB_ID}"
fi

# =============== ElastiCache Redis ===============
if aws elasticache describe-cache-subnet-groups --cache-subnet-group-name "${REDIS_SUBNET_GROUP}" >/dev/null 2>&1; then
  ok "Redis 서브넷 그룹 존재: ${REDIS_SUBNET_GROUP}"
else
  aws elasticache create-cache-subnet-group --cache-subnet-group-name "${REDIS_SUBNET_GROUP}" \
    --cache-subnet-group-description "AbleWork Redis private subnets" \
    --subnet-ids "${SUBNET_PRV_A}" "${SUBNET_PRV_C}" >/dev/null
  ok "Redis 서브넷 그룹 생성: ${REDIS_SUBNET_GROUP}"
fi

if aws elasticache describe-cache-clusters --cache-cluster-id "${REDIS_ID}" >/dev/null 2>&1; then
  ok "Redis 클러스터 존재: ${REDIS_ID}"
else
  REDIS_VERSION="${REDIS_VERSION:-$(aws elasticache describe-cache-engine-versions --engine redis \
    --query 'CacheEngineVersions[?starts_with(EngineVersion, `7.`)].EngineVersion | [-1]' --output text)}"
  log "Redis 생성 시작 (redis ${REDIS_VERSION}, cache.t4g.micro, 1 노드) — 수 분 소요"
  aws elasticache create-cache-cluster \
    --cache-cluster-id "${REDIS_ID}" \
    --engine redis --engine-version "${REDIS_VERSION}" \
    --cache-node-type cache.t4g.micro --num-cache-nodes 1 \
    --cache-subnet-group-name "${REDIS_SUBNET_GROUP}" \
    --security-group-ids "${REDIS_SG}" \
    --tags "Key=Project,Value=${PROJECT}" "Key=Env,Value=${ENVIRONMENT}" >/dev/null
  ok "Redis 생성 요청 완료: ${REDIS_ID}"
fi

# =============== 가용 시 SSM 기록 (멱등) ===============
echo "----------------------------------------------------------------"
DB_STATUS="$(none_to_empty "$(aws rds describe-db-instances --db-instance-identifier "${DB_ID}" --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || true)")"
DB_EP="$(none_to_empty "$(aws rds describe-db-instances --db-instance-identifier "${DB_ID}" --query 'DBInstances[0].Endpoint.Address' --output text 2>/dev/null || true)")"
if [ "${DB_STATUS}" = "available" ] && [ -n "${DB_EP}" ]; then
  [ -n "${RDS_PASSWORD:-}" ] || die "RDS_PASSWORD 상태값 없음(.state). 최초 생성 로그를 확인하세요."
  DB_URL="postgresql://${DB_USER}:${RDS_PASSWORD}@${DB_EP}:5432/${DB_NAME}?schema=public"
  aws ssm put-parameter --name "${SSM_PREFIX}/DATABASE_URL" --type SecureString --value "${DB_URL}" --overwrite >/dev/null
  ok "SSM DATABASE_URL 기록 (endpoint=${DB_EP})"
else
  warn "RDS 준비 전(status=${DB_STATUS:-none}). 가용 후 재실행하면 DATABASE_URL 기록됨."
fi

REDIS_STATUS="$(none_to_empty "$(aws elasticache describe-cache-clusters --cache-cluster-id "${REDIS_ID}" --query 'CacheClusters[0].CacheClusterStatus' --output text 2>/dev/null || true)")"
REDIS_EP="$(none_to_empty "$(aws elasticache describe-cache-clusters --cache-cluster-id "${REDIS_ID}" --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text 2>/dev/null || true)")"
if [ "${REDIS_STATUS}" = "available" ] && [ -n "${REDIS_EP}" ]; then
  REDIS_URL="redis://${REDIS_EP}:6379"
  aws ssm put-parameter --name "${SSM_PREFIX}/REDIS_URL" --type SecureString --value "${REDIS_URL}" --overwrite >/dev/null
  ok "SSM REDIS_URL 기록 (endpoint=${REDIS_EP})"
else
  warn "Redis 준비 전(status=${REDIS_STATUS:-none}). 가용 후 재실행하면 REDIS_URL 기록됨."
fi
echo "----------------------------------------------------------------"
ok "04-data 완료 (RDS=${DB_STATUS:-creating}, Redis=${REDIS_STATUS:-creating})"
