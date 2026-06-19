#!/usr/bin/env bash
# Step 1-a: 사전 점검 + ECR 리포지토리 생성(멱등).
# 사용: bash deploy/aws/00-prereqs.sh
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ensure_aws
ACCOUNT="$(account_id)"
log "계정=${ACCOUNT}  리전=${AWS_REGION}  프로파일=${AWS_PROFILE}"
if [ -n "${GH_REPO}" ]; then
  log "GitHub 저장소(OIDC 대상)=${GH_REPO}"
else
  warn "GitHub 저장소를 감지하지 못했습니다. 01-iam.sh 실행 시 'GH_REPO=owner/repo'를 지정하세요."
fi

# ECR 리포 생성(멱등) + 수명주기(최근 10개 유지)
LIFECYCLE='{"rules":[{"rulePriority":1,"description":"keep last 10 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}'
for repo in "${ECR_API}" "${ECR_WEB}"; do
  if aws ecr describe-repositories --repository-names "${repo}" >/dev/null 2>&1; then
    ok "ECR 리포 존재: ${repo}"
  else
    aws ecr create-repository \
      --repository-name "${repo}" \
      --image-scanning-configuration scanOnPush=true \
      --image-tag-mutability MUTABLE \
      --encryption-configuration encryptionType=AES256 \
      --tags "${TAG_PROJECT}" "${TAG_ENV}" "${TAG_MANAGED}" >/dev/null
    ok "ECR 리포 생성: ${repo}"
  fi
  aws ecr put-lifecycle-policy --repository-name "${repo}" \
    --lifecycle-policy-text "${LIFECYCLE}" >/dev/null
done

ECR_REGISTRY="${ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ok "ECR 레지스트리: ${ECR_REGISTRY}"
log "API 이미지: ${ECR_REGISTRY}/${ECR_API}"
log "WEB 이미지: ${ECR_REGISTRY}/${ECR_WEB}"
ok "00-prereqs 완료"
