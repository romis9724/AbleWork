#!/usr/bin/env bash
# Step 1-b: IAM 구성(멱등).
#   A. EC2 인스턴스 역할/프로파일 — SSM 파라미터 읽기·ECR pull·S3·CloudWatch Logs
#   B. GitHub Actions OIDC 공급자 + 배포 역할 — ECR push·SSM SendCommand (정적 키 없음)
# 사용: bash deploy/aws/01-iam.sh   (필요 시 GH_REPO=owner/repo 지정)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

ensure_aws
ACCOUNT="$(account_id)"
[ -n "${GH_REPO}" ] || die "GH_REPO를 감지하지 못했습니다. 예) GH_REPO=romis9724/AbleWork bash deploy/aws/01-iam.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "${TMP}"' EXIT

# ============================================================
# A. EC2 인스턴스 역할
# ============================================================
cat > "${TMP}/ec2-trust.json" <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON

if aws iam get-role --role-name "${EC2_ROLE_NAME}" >/dev/null 2>&1; then
  ok "역할 존재: ${EC2_ROLE_NAME}"
else
  aws iam create-role --role-name "${EC2_ROLE_NAME}" \
    --assume-role-policy-document "file://${TMP}/ec2-trust.json" \
    --tags "${TAG_PROJECT}" "${TAG_ENV}" "${TAG_MANAGED}" >/dev/null
  ok "역할 생성: ${EC2_ROLE_NAME}"
fi

# SSM 세션 매니저 / RunCommand 기본 (멱등)
aws iam attach-role-policy --role-name "${EC2_ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore >/dev/null
ok "관리형 정책 연결: AmazonSSMManagedInstanceCore"

# 인라인 정책: SSM 읽기 + KMS Decrypt(SSM 경유 한정) + ECR pull + S3 + Logs
cat > "${TMP}/ec2-policy.json" <<JSON
{
  "Version":"2012-10-17",
  "Statement":[
    {"Sid":"SsmRead","Effect":"Allow",
     "Action":["ssm:GetParameter","ssm:GetParameters","ssm:GetParametersByPath"],
     "Resource":["arn:aws:ssm:${AWS_REGION}:${ACCOUNT}:parameter${SSM_PREFIX}",
                 "arn:aws:ssm:${AWS_REGION}:${ACCOUNT}:parameter${SSM_PREFIX}/*"]},
    {"Sid":"KmsDecryptViaSsm","Effect":"Allow","Action":"kms:Decrypt","Resource":"*",
     "Condition":{"StringEquals":{"kms:ViaService":"ssm.${AWS_REGION}.amazonaws.com"}}},
    {"Sid":"EcrAuth","Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
    {"Sid":"EcrPull","Effect":"Allow",
     "Action":["ecr:BatchCheckLayerAvailability","ecr:GetDownloadUrlForLayer","ecr:BatchGetImage"],
     "Resource":["arn:aws:ecr:${AWS_REGION}:${ACCOUNT}:repository/${ECR_API}",
                 "arn:aws:ecr:${AWS_REGION}:${ACCOUNT}:repository/${ECR_WEB}"]},
    {"Sid":"S3Object","Effect":"Allow",
     "Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],
     "Resource":"arn:aws:s3:::${S3_BUCKET}/*"},
    {"Sid":"S3List","Effect":"Allow",
     "Action":["s3:ListBucket","s3:GetBucketLocation"],
     "Resource":"arn:aws:s3:::${S3_BUCKET}"},
    {"Sid":"Logs","Effect":"Allow",
     "Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogStreams"],
     "Resource":"arn:aws:logs:${AWS_REGION}:${ACCOUNT}:log-group:/${PROJECT}/*"}
  ]
}
JSON
aws iam put-role-policy --role-name "${EC2_ROLE_NAME}" \
  --policy-name "${NAME}-ec2-inline" \
  --policy-document "file://${TMP}/ec2-policy.json" >/dev/null
ok "인라인 정책 설정: ${NAME}-ec2-inline"

# 인스턴스 프로파일
if aws iam get-instance-profile --instance-profile-name "${EC2_PROFILE_NAME}" >/dev/null 2>&1; then
  ok "인스턴스 프로파일 존재: ${EC2_PROFILE_NAME}"
else
  aws iam create-instance-profile --instance-profile-name "${EC2_PROFILE_NAME}" >/dev/null
  ok "인스턴스 프로파일 생성: ${EC2_PROFILE_NAME}"
fi
# 역할 연결(이미 연결돼 있으면 LimitExceeded/EntityAlreadyExists → 무시)
aws iam add-role-to-instance-profile \
  --instance-profile-name "${EC2_PROFILE_NAME}" \
  --role-name "${EC2_ROLE_NAME}" >/dev/null 2>&1 || true
ok "프로파일↔역할 연결 확인"

# ============================================================
# B. GitHub Actions OIDC + 배포 역할
# ============================================================
OIDC_HOST="token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${ACCOUNT}:oidc-provider/${OIDC_HOST}"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_ARN}" >/dev/null 2>&1; then
  ok "OIDC 공급자 존재: ${OIDC_HOST}"
else
  aws iam create-open-id-connect-provider \
    --url "https://${OIDC_HOST}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd >/dev/null
  ok "OIDC 공급자 생성: ${OIDC_HOST}"
fi

# 배포 역할 신뢰정책 — 이 저장소만
cat > "${TMP}/gha-trust.json" <<JSON
{
  "Version":"2012-10-17",
  "Statement":[{
    "Effect":"Allow",
    "Principal":{"Federated":"${OIDC_ARN}"},
    "Action":"sts:AssumeRoleWithWebIdentity",
    "Condition":{
      "StringEquals":{"${OIDC_HOST}:aud":"sts.amazonaws.com"},
      "StringLike":{"${OIDC_HOST}:sub":"repo:${GH_REPO}:*"}
    }
  }]
}
JSON
if aws iam get-role --role-name "${GHA_ROLE_NAME}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "${GHA_ROLE_NAME}" \
    --policy-document "file://${TMP}/gha-trust.json" >/dev/null
  ok "배포 역할 신뢰정책 갱신: ${GHA_ROLE_NAME}"
else
  aws iam create-role --role-name "${GHA_ROLE_NAME}" \
    --assume-role-policy-document "file://${TMP}/gha-trust.json" \
    --tags "${TAG_PROJECT}" "${TAG_ENV}" "${TAG_MANAGED}" >/dev/null
  ok "배포 역할 생성: ${GHA_ROLE_NAME}"
fi

# 배포 역할 권한 — ECR push + SSM SendCommand(태그 한정) + 폴링
cat > "${TMP}/gha-policy.json" <<JSON
{
  "Version":"2012-10-17",
  "Statement":[
    {"Sid":"EcrAuth","Effect":"Allow","Action":"ecr:GetAuthorizationToken","Resource":"*"},
    {"Sid":"EcrPush","Effect":"Allow",
     "Action":["ecr:BatchCheckLayerAvailability","ecr:InitiateLayerUpload","ecr:UploadLayerPart",
               "ecr:CompleteLayerUpload","ecr:PutImage","ecr:BatchGetImage","ecr:GetDownloadUrlForLayer"],
     "Resource":["arn:aws:ecr:${AWS_REGION}:${ACCOUNT}:repository/${ECR_API}",
                 "arn:aws:ecr:${AWS_REGION}:${ACCOUNT}:repository/${ECR_WEB}"]},
    {"Sid":"SsmSendDoc","Effect":"Allow","Action":"ssm:SendCommand",
     "Resource":"arn:aws:ssm:${AWS_REGION}::document/AWS-RunShellScript"},
    {"Sid":"SsmSendInstance","Effect":"Allow","Action":"ssm:SendCommand",
     "Resource":"arn:aws:ec2:${AWS_REGION}:${ACCOUNT}:instance/*",
     "Condition":{"StringEquals":{"aws:ResourceTag/Project":"${PROJECT}","aws:ResourceTag/Env":"${ENVIRONMENT}"}}},
    {"Sid":"SsmPoll","Effect":"Allow",
     "Action":["ssm:GetCommandInvocation","ssm:ListCommandInvocations","ssm:ListCommands"],
     "Resource":"*"},
    {"Sid":"S3DeployAssets","Effect":"Allow",
     "Action":["s3:PutObject"],
     "Resource":"arn:aws:s3:::${S3_BUCKET}/deploy/*"}
  ]
}
JSON
aws iam put-role-policy --role-name "${GHA_ROLE_NAME}" \
  --policy-name "${NAME}-gha-inline" \
  --policy-document "file://${TMP}/gha-policy.json" >/dev/null
ok "배포 역할 권한 설정: ${NAME}-gha-inline"

echo "----------------------------------------------------------------"
echo "EC2_INSTANCE_PROFILE = ${EC2_PROFILE_NAME}"
echo "GHA_DEPLOY_ROLE_ARN  = arn:aws:iam::${ACCOUNT}:role/${GHA_ROLE_NAME}"
echo "  ↳ GitHub 저장소 Variables/Secrets에 AWS_DEPLOY_ROLE_ARN 으로 등록(Step 6 워크플로에서 사용)"
echo "----------------------------------------------------------------"
ok "01-iam 완료"
