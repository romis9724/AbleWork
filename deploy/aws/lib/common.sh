#!/usr/bin/env bash
# AbleWork AWS 배포 공통 설정·헬퍼.
# 모든 deploy/aws/*.sh 가 맨 위에서 source 한다. 직접 실행용이 아니다.
#
# 환경변수로 덮어쓸 수 있는 값: AWS_PROFILE, AWS_REGION, DOMAIN, GH_REPO, S3_BUCKET 등.

set -euo pipefail

# ---- 자기 위치 기준 경로 ----
COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export AWS_DIR="$(cd "${COMMON_DIR}/.." && pwd)"        # deploy/aws
export REPO_ROOT="$(cd "${AWS_DIR}/../.." && pwd)"      # 모노레포 루트

# ---- 프로젝트 식별 ----
export PROJECT="${PROJECT:-ablework}"
export ENVIRONMENT="${ENVIRONMENT:-prod}"
export NAME="${PROJECT}-${ENVIRONMENT}"                 # ablework-prod (리소스 접두사)

# ---- AWS 프로파일/리전 (모든 aws 호출이 자동 사용) ----
export AWS_PROFILE="${AWS_PROFILE:-ablework}"
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export AWS_DEFAULT_REGION="${AWS_REGION}"
export CF_ACM_REGION="us-east-1"                        # CloudFront용 ACM은 버지니아 고정

# ---- 도메인 ----
export DOMAIN="${DOMAIN:-work.abmwc.net}"

# ---- SSM 파라미터 경로 ----
export SSM_PREFIX="${SSM_PREFIX:-/${PROJECT}/api/${ENVIRONMENT}}"

# ---- ECR 리포지토리 ----
export ECR_API="${PROJECT}-api"
export ECR_WEB="${PROJECT}-web"

# ---- IAM 리소스 이름 ----
export EC2_ROLE_NAME="${NAME}-ec2-role"
export EC2_PROFILE_NAME="${NAME}-ec2-profile"
export GHA_ROLE_NAME="${NAME}-gha-deploy-role"

# ---- S3 버킷(첨부 파일) ----
export S3_BUCKET="${S3_BUCKET:-${NAME}-files}"          # ablework-prod-files

# ---- GitHub 저장소 (OIDC 신뢰 대상). git 리모트에서 자동 추출, GH_REPO로 덮어쓰기 가능 ----
detect_gh_repo() {
  local url
  url="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || true)"
  [ -n "${url}" ] || { echo ""; return; }
  echo "${url}" | sed -E 's#(git@|https://)github.com[:/]##; s#\.git$##'
}
export GH_REPO="${GH_REPO:-$(detect_gh_repo)}"

# ---- 로깅 ----
log()  { printf '\033[0;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
ok()   { printf '\033[0;32m[ ok ]\033[0m %s\n'  "$*" >&2; }
warn() { printf '\033[0;33m[warn]\033[0m %s\n'  "$*" >&2; }
die()  { printf '\033[0;31m[fail]\033[0m %s\n'  "$*" >&2; exit 1; }

# ---- 공통 가드 ----
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "'$1' 명령을 찾을 수 없습니다. 먼저 설치하세요."; }

account_id() { aws sts get-caller-identity --query Account --output text; }

ensure_aws() {
  require_cmd aws
  if ! aws sts get-caller-identity >/dev/null 2>&1; then
    die "AWS 자격증명이 구성되지 않았습니다. 'aws configure --profile ${AWS_PROFILE}'(서울 리전)로 설정 후 다시 실행하세요. (현재 AWS_PROFILE=${AWS_PROFILE}, AWS_REGION=${AWS_REGION})"
  fi
}

# 리소스 태그(서비스별 포맷이 달라 호출부에서 직접 사용). 참고용 공통 값.
export TAG_PROJECT="Key=Project,Value=${PROJECT}"
export TAG_ENV="Key=Env,Value=${ENVIRONMENT}"
export TAG_MANAGED="Key=ManagedBy,Value=aws-cli-scripts"

# ---- 상태 파일 (스크립트 간 리소스 ID 공유. git-ignore) ----
export STATE_DIR="${AWS_DIR}/.state"
export STATE_FILE="${STATE_DIR}/${ENVIRONMENT}.env"
mkdir -p "${STATE_DIR}"
# 기존 상태 로드(있으면)
if [ -f "${STATE_FILE}" ]; then
  # shellcheck disable=SC1090
  set -a; source "${STATE_FILE}"; set +a
fi
# state_set KEY VALUE  — 상태파일에 기록(중복 키 교체) + 현재 셸에 export
state_set() {
  local k="$1" v="$2"
  touch "${STATE_FILE}"
  grep -v "^${k}=" "${STATE_FILE}" > "${STATE_FILE}.tmp" 2>/dev/null || true
  printf '%s=%s\n' "${k}" "${v}" >> "${STATE_FILE}.tmp"
  mv "${STATE_FILE}.tmp" "${STATE_FILE}"
  export "${k}=${v}"
}
# none_to_empty — aws --output text 의 'None'/'null' 을 빈 문자열로 정규화
none_to_empty() { local v="$1"; case "${v}" in None|null|"") echo "";; *) echo "${v}";; esac; }
