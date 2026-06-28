# GitHub → GitLab(self-hosted) 마이그레이션 런북

> 대상 GitLab: `http://59.29.231.14:20350/`
> 원본 GitHub: `https://github.com/romis9724/AbleWork.git`
> 작성일: 2026-06-29 · 상태: **실행 중**

## 진행 로그

| 단계 | 상태 | 비고 |
|---|---|---|
| Phase 1 — 그룹/프로젝트/미러 | ✅ 완료 | 그룹 `abmwc`(id 44, dhkim=Owner), 프로젝트 `abmwc/AbleWork`(id 5), 브랜치 17개 푸시, **G1 통과**(main HEAD `e43602f` 일치) |
| Phase 2 — Runner/IAM(arm64) | ⏳ 대기 | EC2 SSH + AWS IAM 작업 필요 |
| Phase 3·4 — `.gitlab-ci.yml` | ✅ 파일 작성 | 루트 `.gitlab-ci.yml` 생성. CI 동작은 Runner 등록(Phase 2) 후 |
| Phase 5 — CI/CD 변수 | ⏳ 대기 | A-1은 변수 거의 없음 |
| Phase 6 — GitHub push mirror | ⏳ 대기 | GitHub PAT(repo push) 필요 |
| Phase 7 — 로컬 remote 전환 | ⏳ 대기 | 컷오버 시 |

> **정정**: 실제 GitHub 브랜치는 **17개**(초기 인벤토리의 34개는 로컬 stale 원격추적 ref였음). PR 머지 ref(`refs/pull/*` 119개)는 방침대로 제외.

---

## 0. 확정된 결정사항 (인터뷰 결과)

| 항목 | 결정 |
|---|---|
| 이전 범위 | **코드 + 전체 히스토리 + CI/CD 전체** |
| 배포 파이프라인 | `deploy.yml` → **GitLab CI로 완전 이식** |
| Runner | **상태 미확인 → Phase 2에서 점검·구축** (EC2가 Graviton/arm64라 arm64 빌드 필요) |
| GitHub 리포 | **GitLab → GitHub 단방향 push mirror로 유지** (정본=GitLab) |
| 대상 경로 | **전용 그룹 아래** `<group>/AbleWork` (그룹명 미정 — §6 참고) |
| GitLab 권한 | **Admin/Owner 보유** (Runner 등록·미러·프로젝트 생성 가능) |
| AWS 인증 | **A안(러너 인스턴스 프로파일)** — 단, "비용 변동 없음" 조건 → **A-1(기존 EC2 겸용)** 기본 채택 (§2) |
| 컷오버 | **병행 운영 후 전환** (검증 G1~G6 통과 후 GitHub을 미러로 강등) |
| 실행 방식 | 본 런북 먼저, 이후 단계별 실행 |

---

## 1. 현황 인벤토리 (이전 대상)

```
원격 브랜치 : 34개 (origin/*)
로컬 브랜치 : 14개
태그/릴리스 : 없음
열린 PR     : 없음
열린 이슈    : 없음
GHA 워크플로우: .github/workflows/ci.yml, deploy.yml
```

- **이전 단순함**: PR/이슈/릴리스/태그가 없어 git 데이터(브랜치+히스토리)만 옮기면 됨. GitHub Issues/PR → GitLab Issues/MR 변환 같은 메타데이터 마이그레이션 불필요.
- **이전 난이도 집중 지점**: CI/CD. 특히 `deploy.yml`이 GitHub 전용 기능 3가지에 의존:
  1. **OIDC** — `aws-actions/configure-aws-credentials`로 IAM 역할 assume (GitHub issuer 신뢰)
  2. **`type=gha` 빌드 캐시** — GitLab에 없음
  3. **`ubuntu-24.04-arm` 무료 네이티브 러너** — public repo 한정 GitHub 제공. self-hosted GitLab은 직접 arm64 러너 필요.

---

## 2. ⚠️ 핵심 제약: AWS 인증 방식 (deploy 이식의 갈림길)

현재 `deploy.yml`은 **GitHub OIDC**로 IAM 역할을 assume한다(정적 키 없음). GitLab으로 옮길 때 이 방식을 그대로 못 쓰는 이유:

> **AWS IAM OIDC 페더레이션은 발급자(issuer) URL이 `https://` + 공인 TLS 인증서 + `/.well-known/openid-configuration` 디스커버리를 요구한다.**
> 현재 GitLab은 `http://59.29.231.14:20350`(평문 HTTP, IP+포트)라 AWS OIDC provider로 등록 불가.

### 인증 방식 3안 (택1)

| 안 | 방식 | 장점 | 단점 | 추천 |
|---|---|---|---|---|
| **A. 러너 인스턴스 프로파일** | 배포용 GitLab Runner를 **AWS arm64 EC2**에 올리고, 그 EC2에 IAM 역할(인스턴스 프로파일) 부착. CI의 `aws` CLI가 메타데이터로 자동 인증 | 정적 키 0개, **arm64 러너 요구사항도 동시 해결**, OIDC/HTTPS 불필요 | 배포 전용 arm64 러너 1대 운영 | ✅ **1순위** |
| **B. 정적 IAM 액세스 키** | `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`를 GitLab CI 변수(masked+protected)로 저장 | 가장 단순, 러너 위치 무관 | 장수명 자격증명 노출 위험, 키 로테이션 필요 | 폴백 |
| **C. GitLab을 HTTPS화 후 OIDC** | 리버스 프록시+공인 인증서로 GitLab을 HTTPS 노출 → AWS OIDC provider 등록 → GitLab `id_tokens` + `AssumeRoleWithWebIdentity` | 무자격증명, GitHub 방식과 동형 | GitLab 인프라(도메인/인증서/프록시) 선작업 필요 | 장기 정공법 |

**확정: A안** (러너 인스턴스 프로파일). 배포 빌드가 어차피 arm64 네이티브 러너를 필요로 하므로(난이도 집중 지점 ③), 그 러너를 AWS EC2(Graviton)에 두고 인스턴스 프로파일을 부여하면 **arm64 빌드 + 자격증명 없는 AWS 접근**을 한 번에 해결한다.

### A안의 비용 전제 → A-1 채택

사용자 조건이 **"AWS 비용 변동이 없으면 A"**였다. A안을 글자 그대로(전용 러너 신규)하면 EC2 비용이 늘므로, 비용 0인 변형을 기본으로 한다.

| 변형 | 방식 | 비용 | 트레이드오프 |
|---|---|---|---|
| **A-1 (기본)** | 운영 중인 **Graviton 앱 EC2에 GitLab Runner 겸용 설치**, 인스턴스 프로파일 권한을 ECR/S3/SSM/EC2 Describe로 확장 | **변동 없음** | 배포 빌드가 운영 인스턴스 CPU/디스크 일시 점유 (배포는 main 푸시 시에만, 빈도 낮음) |
| A-2 | 전용 t4g 빌드 러너 신규 1대 | 월 EC2 비용 증가 | 운영 격리 우수 |

→ **A-1**을 기준으로 진행. 배포 빈도가 낮아(main 푸시 시) 운영 점유 영향은 제한적. 빌드가 운영에 부담되면 추후 A-2로 분리.

> ⚠️ A-1 적용 시 **기존 앱 EC2의 인스턴스 프로파일에 배포 권한(ECR push, S3 put, SSM SendCommand/GetCommandInvocation, EC2 DescribeInstances)을 추가**해야 한다. 기존 `deploy/aws/01-iam.sh`의 `gha-deploy-role` 정책 문서를 인스턴스 프로파일 역할에 그대로 attach.

---

## 3. 단계별 실행 계획

### Phase 0 — 사전 준비

```bash
# (로컬) glab CLI 설치 — 선택. 미러 푸시·러너 점검 자동화에 유용
brew install glab   # macOS

# GitLab 개인 액세스 토큰 발급 (Admin > User Settings > Access Tokens)
#   scope: api, write_repository, read_repository
#   → 환경변수로만 보관. 코드/문서에 하드코딩 금지
export GITLAB_HOST=http://59.29.231.14:20350
export GITLAB_TOKEN=<발급한_토큰>
```

체크리스트:
- [ ] GitLab Admin 계정 로그인 확인 (`/api/v4/version`이 토큰으로 200 반환)
- [ ] 대상 네임스페이스 결정 (개인 또는 그룹 `AbleWork`)
- [ ] GitHub `romis9724/AbleWork` 접근 토큰 보유(read) — 미러 소스 클론용

---

### Phase 1 — GitLab 프로젝트 생성 + 히스토리 전체 이전

```bash
# 1) GitLab에 빈 프로젝트 생성 (UI 또는 API). 초기화 옵션(README 등) 모두 OFF
curl -s --request POST "$GITLAB_HOST/api/v4/projects" \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --data "name=AbleWork&visibility=private&initialize_with_readme=false"
# → 응답의 "ssh_url_to_repo" / "http_url_to_repo" 확보

# 2) GitHub에서 미러 클론 (모든 브랜치/태그 포함, 작업본 아님)
cd /tmp
git clone --mirror https://github.com/romis9724/AbleWork.git AbleWork.git
cd AbleWork.git

# 3) GitLab으로 전체 푸시 (모든 ref)
git remote add gitlab "$GITLAB_HOST/<namespace>/AbleWork.git"
git push --mirror gitlab
```

검증:
- [ ] GitLab UI에서 브랜치 34개 + `main` 기본 브랜치 확인
- [ ] 최근 커밋 SHA가 GitHub와 일치 (`6f56f90` 등)
- [ ] 파일 트리 정상 (특히 `.github/`, `deploy/`, `docs/`)

> 참고: `--mirror`는 PR ref(`refs/pull/*`)까지 가져올 수 있다. GitLab에서 불필요하면 푸시 전 정리하거나, 정상 브랜치만 푸시(`git push gitlab 'refs/heads/*:refs/heads/*'`)로 대체.

---

### Phase 2 — Runner 점검 및 구축 (arm64)

**점검 (Admin)**: GitLab > Admin Area > CI/CD > Runners 에서 등록된 러너와 아키텍처 확인.

#### 필요 러너 2종

| 러너 | 용도 | executor | 아키텍처 | tags |
|---|---|---|---|---|
| 테스트 러너 | typecheck/lint/unit/integration | docker | x86 또는 arm 무관 | `test` |
| **배포 러너** | arm64 이미지 빌드 + AWS 배포 | docker(+dind) 또는 shell | **arm64 (AWS EC2 권장)** | `arm64`, `aws-deploy` |

#### 배포 러너(A-1) 구축 절차 — 기존 Graviton 앱 EC2 겸용

```bash
# (AWS) 신규 EC2 생성 없음 — 운영 중인 앱 EC2를 그대로 사용 (비용 변동 0)
#   ① 기존 앱 EC2의 IAM 인스턴스 프로파일 역할에 배포 권한 추가:
#      ECR push, S3 put(배포 에셋), SSM SendCommand/GetCommandInvocation, EC2 DescribeInstances
#      → deploy/aws/01-iam.sh의 gha-deploy-role 정책 문서를 인스턴스 프로파일 역할에 attach
#   ② SSM 자기호출 주의: 러너가 EC2 내부에서 자기 인스턴스에 send-command 하는 구조 →
#      deploy.sh 직접 실행으로 단순화 가능(아래 Phase 4 주석 참고)

# (EC2 내부) GitLab Runner 설치
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt-get install gitlab-runner docker.io -y
sudo usermod -aG docker gitlab-runner

# 등록 (Admin Area에서 registration token 확보)
sudo gitlab-runner register \
  --url "$GITLAB_HOST" \
  --registration-token "<RUNNER_TOKEN>" \
  --executor docker \
  --docker-image "docker:27" \
  --docker-privileged \
  --tag-list "arm64,aws-deploy" \
  --description "ablework-arm64-deploy"
```

> dind(`--docker-privileged`)는 buildx 빌드에 필요. 보안상 격리가 중요하면 shell executor + 호스트 docker 사용도 가능.

체크리스트:
- [ ] 테스트 러너 online + `test` 태그
- [ ] 배포 러너 online + `arm64,aws-deploy` 태그 + `aws sts get-caller-identity` 성공(인스턴스 프로파일 검증)
- [ ] EC2 인스턴스 프로파일에 ECR/S3/SSM/EC2 Describe 권한 확인

---

### Phase 3 — `.gitlab-ci.yml` 작성 (CI 이식: ci.yml → GitLab)

루트에 `.gitlab-ci.yml` 신규 생성. **GHA와 다른 핵심 차이**: 서비스 컨테이너 호스트명이 `localhost`가 아니라 **alias(`postgres`/`redis`)**.

```yaml
stages:
  - test
  - deploy

variables:
  PNPM_VERSION: "9.15.9"
  PNPM_STORE: "$CI_PROJECT_DIR/.pnpm-store"

# main 푸시 + MR 에서만 파이프라인 실행
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_PIPELINE_SOURCE == "web"

.node_base:
  image: node:22-bookworm-slim
  tags: [test]
  cache:
    key:
      files: [pnpm-lock.yaml]
    paths: [.pnpm-store]
  before_script:
    - corepack enable
    - corepack prepare "pnpm@$PNPM_VERSION" --activate
    - pnpm config set store-dir "$PNPM_STORE"
    - pnpm install --frozen-lockfile

typecheck-lint:
  extends: .node_base
  stage: test
  script:
    - DATABASE_URL='postgresql://ablework:test@localhost:5432/ablework' pnpm --filter api prisma generate
    - pnpm --filter api exec tsc --noEmit
    - pnpm --filter api exec eslint 'src/**/*.ts' --max-warnings=0 || true

unit-test:
  extends: .node_base
  stage: test
  variables:
    NODE_ENV: test
  script:
    - DATABASE_URL='postgresql://ablework:test@localhost:5432/ablework' pnpm --filter api prisma generate
    - pnpm --filter api test -- --coverage --coverageThreshold='{"global":{"lines":70}}'
  coverage: '/All files[^|]*\|[^|]*\s+([\d.]+)/'
  artifacts:
    when: always
    paths: [apps/api/coverage/]
    expire_in: 1 week

integration-test:
  extends: .node_base
  stage: test
  services:
    - name: postgres:16-alpine
      alias: postgres
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_DB: ablework_test
    POSTGRES_USER: ablework
    POSTGRES_PASSWORD: test_pass
    # 서비스 호스트는 alias 사용 (GHA의 localhost와 다른 핵심 차이점)
    DATABASE_URL: "postgresql://ablework:test_pass@postgres:5432/ablework_test"
    REDIS_URL: "redis://redis:6379"
    JWT_SECRET: "test-secret-key-32-characters-long!"
    NODE_ENV: test
  script:
    - pnpm --filter api prisma generate
    - pnpm --filter api prisma migrate deploy
    - pnpm --filter api test:e2e
  allow_failure: true   # GHA의 continue-on-error: true 대응
```

> `coverage:` 정규식은 Jest 출력 포맷에 맞춰 1회 검증 후 조정.

---

### Phase 4 — `.gitlab-ci.yml` 배포 잡 (deploy.yml 이식, A안 기준)

CI 파일에 deploy 스테이지 잡 추가. **GHA 대비 변경점**:
- OIDC `configure-aws-credentials` 제거 → 러너 **인스턴스 프로파일**이 자동 인증
- `type=gha` 캐시 → **레지스트리 캐시**(`type=registry`)로 교체
- `runs-on: ubuntu-24.04-arm` → `tags: [arm64, aws-deploy]`

```yaml
deploy:
  stage: deploy
  tags: [arm64, aws-deploy]
  image: docker:27
  services:
    - docker:27-dind
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_PIPELINE_SOURCE == "web"   # 수동 실행(workflow_dispatch 대응)
  resource_group: deploy-prod            # concurrency: group=deploy-prod 대응
  variables:
    AWS_REGION: ap-northeast-2
    PROJECT: ablework
    S3_BUCKET: ablework-prod-files
    NEXT_PUBLIC_API_URL: https://work.abmwc.net/api/v1
    DOCKER_BUILDKIT: "1"
  before_script:
    - apk add --no-cache aws-cli docker-cli-buildx
    # 인스턴스 프로파일로 인증됨 — 정적 키 불필요
    - export ECR_REGISTRY="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com"
    - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"
    - docker buildx create --use --name ablework || docker buildx use ablework
  script:
    - SHA="$CI_COMMIT_SHA"
    # type=gha → type=registry 캐시로 교체 (api/web scope 분리 유지)
    - |
      docker buildx build --platform linux/arm64 -f deploy/Dockerfile --target api \
        --cache-from "type=registry,ref=$ECR_REGISTRY/ablework-api:buildcache" \
        --cache-to   "type=registry,ref=$ECR_REGISTRY/ablework-api:buildcache,mode=max" \
        -t "$ECR_REGISTRY/ablework-api:latest" -t "$ECR_REGISTRY/ablework-api:$SHA" --push .
    - |
      docker buildx build --platform linux/arm64 -f deploy/Dockerfile --target web \
        --cache-from "type=registry,ref=$ECR_REGISTRY/ablework-web:buildcache" \
        --cache-to   "type=registry,ref=$ECR_REGISTRY/ablework-web:buildcache,mode=max" \
        --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
        -t "$ECR_REGISTRY/ablework-web:latest" -t "$ECR_REGISTRY/ablework-web:$SHA" --push .
    # 배포 에셋 S3 업로드 (기존 deploy.yml과 동일)
    - |
      for f in docker-compose.aws.yml fetch-env.sh deploy.sh; do
        aws s3 cp "deploy/aws/app/$f" "s3://$S3_BUCKET/deploy/$f"
      done
    # EC2(SSM) 재배포 — 기존 deploy.yml 폴링 로직 이식
    - |
      IID=$(aws ec2 describe-instances \
        --filters "Name=tag:Project,Values=$PROJECT" "Name=tag:Env,Values=prod" "Name=instance-state-name,Values=running" \
        --query 'Reservations[0].Instances[0].InstanceId' --output text)
      CMD=$(aws ssm send-command --instance-ids "$IID" --document-name AWS-RunShellScript \
        --comment "GitLab deploy $SHA" \
        --parameters commands='["set -e","mkdir -p /opt/ablework && cd /opt/ablework","for f in docker-compose.aws.yml fetch-env.sh deploy.sh; do aws s3 cp s3://'"$S3_BUCKET"'/deploy/$f .; done","bash deploy.sh"]' \
        --query 'Command.CommandId' --output text)
      ST="Pending"
      for _ in $(seq 1 60); do
        ST=$(aws ssm get-command-invocation --command-id "$CMD" --instance-id "$IID" --query Status --output text 2>/dev/null || echo Pending)
        case "$ST" in Success|Failed|Cancelled|TimedOut) break;; esac
        sleep 10
      done
      echo "----- output -----"; aws ssm get-command-invocation --command-id "$CMD" --instance-id "$IID" --query StandardOutputContent --output text || true
      echo "----- stderr -----"; aws ssm get-command-invocation --command-id "$CMD" --instance-id "$IID" --query StandardErrorContent --output text || true
      echo "status=$ST"; [ "$ST" = "Success" ]
```

> **A-1 단순화(러너=앱 EC2 동일 호스트)**: 러너가 배포 대상 EC2 위에서 돌므로, 마지막 SSM `send-command`(자기 자신 호출)는 생략하고 `cd /opt/ablework && bash deploy.sh`를 **직접 실행**해도 된다. 단 dind 컨테이너 안이 아니라 호스트 docker에 접근해야 하므로, 이 경우 **shell executor 러너** 사용을 권장(dind 대신 호스트 docker 마운트). SSM 경로를 유지하면 executor 종류와 무관하게 기존 deploy.sh 흐름을 그대로 재사용할 수 있어 **호환성 측면에선 SSM 유지가 안전**하다.
>
> **B안(정적 키)을 택할 경우**: 배포 러너를 AWS 밖에 둘 수 있고, `before_script`의 `sts get-caller-identity`는 그대로 동작하되 자격증명은 CI 변수 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`(masked+protected)에서 온다. `tags`에서 `aws-deploy`는 빼고 `arm64`만 유지.

---

### Phase 5 — GitLab CI/CD 변수 등록 (Settings > CI/CD > Variables)

기존 GitHub `vars.AWS_DEPLOY_ROLE_ARN`은 A안에서 **불필요**(인스턴스 프로파일 사용). 등록 항목:

| 변수 | 값 | 옵션 | 비고 |
|---|---|---|---|
| (A안) — | — | — | 정적 자격증명 없음 |
| (B안) `AWS_ACCESS_KEY_ID` | 배포 IAM 키 | masked, protected | B안 한정 |
| (B안) `AWS_SECRET_ACCESS_KEY` | 배포 IAM 시크릿 | masked, protected | B안 한정 |

> `protected` 변수는 protected 브랜치(main)에서만 노출되므로, **main을 protected 브랜치로 설정**해야 배포 잡에서 변수가 주입된다. (GitLab은 기본적으로 main이 protected)

---

### Phase 6 — GitLab → GitHub 단방향 push mirror 설정

정본=GitLab, GitHub=읽기 백업. (GitLab Free에서 **push mirror는 지원**, pull mirror는 Premium)

1. GitHub에서 `repo` scope PAT 발급 (push 권한)
2. GitLab > 프로젝트 > Settings > Repository > **Mirroring repositories**
   - Git repository URL: `https://github.com/romis9724/AbleWork.git`
   - Mirror direction: **Push**
   - Authentication: Password → GitHub PAT
   - ☑ Keep divergent refs / ☑ Mirror only protected branches (선택)
3. **Update now**로 즉시 동기화 검증

체크리스트:
- [ ] GitLab 커밋이 GitHub에 반영되는지 확인
- [ ] GitHub의 GHA(`ci.yml`/`deploy.yml`)는 **비활성화**(미러로 인한 중복 배포 방지) — `.github/workflows/` 제거 또는 GitHub Actions 설정에서 disable

> ⚠️ **중복 배포 주의**: GitHub로 미러되면 GitHub의 `deploy.yml`도 main push에 트리거될 수 있다. GitLab이 배포를 담당하므로 **GitHub Actions를 끄거나 워크플로우 파일을 제거**해야 한다. (단, OIDC 역할 ARN이 GitHub repo variable에 남아있고 미러된 코드에 `.github/`가 있으면 실행됨)

---

### Phase 7 — 로컬 개발 remote 전환

```bash
cd /Users/user/Workspace/AbleWork
git remote rename origin github-backup           # 기존 GitHub 보존
git remote add origin "$GITLAB_HOST/<namespace>/AbleWork.git"
git fetch origin
git branch --set-upstream-to=origin/main main
git remote -v   # origin=GitLab, github-backup=GitHub 확인
```

팀원 공지: 각자 `git remote set-url origin <GitLab URL>` 안내.

---

## 4. 검증 게이트 (컷오버 전)

| # | 게이트 | 통과 기준 |
|---|---|---|
| G1 | 히스토리 무결성 | GitLab `main` HEAD SHA == GitHub HEAD, 브랜치 34개 |
| G2 | CI 통과 | typecheck/lint/unit/integration 잡 green (integration은 allow_failure) |
| G3 | 배포 빌드 | arm64 이미지 ECR 푸시 성공, 캐시 동작 |
| G4 | 배포 실행 | SSM 재배포 status=Success, `work.abmwc.net` 200/307 응답 |
| G5 | 미러 | GitLab→GitHub 동기화 확인, GitHub GHA 비활성 |
| G6 | 운영 문서 갱신 | `docs/design/AWS_OPERATIONS.md`의 배포 트리거를 GitLab 기준으로 수정 |

---

## 5. 리스크 & 롤백

| 리스크 | 대응 |
|---|---|
| arm64 러너 미구축 → 배포 빌드 불가 | Phase 2 선행 필수. 임시로 x86 러너 + buildx QEMU(느림) 가능하나 비권장 |
| AWS 인증(OIDC HTTP 제약) | §2 A안(인스턴스 프로파일) 우선. 불가 시 B안(정적 키) |
| 미러로 인한 GitHub 중복 배포 | Phase 6에서 GitHub Actions 비활성 필수 |
| `type=gha` 캐시 손실로 빌드 지연 | 레지스트리 캐시 첫 빌드는 캐시 미스(느림), 2회차부터 정상 |
| 롤백 | GitLab은 이전 추가일 뿐 GitHub 원본 보존 → 문제 시 `origin`을 GitHub로 되돌리고 GHA 재활성화 |

---

## 6. 결정 현황 & 남은 확인

**확정됨**
- ✅ AWS 인증: **A안 → A-1(기존 Graviton 앱 EC2 겸용, 비용 변동 0)** (§2)
- ✅ 네임스페이스: **전용 그룹 아래** `<group>/AbleWork`
- ✅ 컷오버: **병행 운영 후 전환** (G1~G6 통과 후 GitHub 미러 강등)

**남은 확인 (실행 직전 1줄 답이면 충분)**
1. **전용 그룹명** — 예: `abmwc`. (미정 시 `abmwc/AbleWork`를 기본으로 진행)
2. **PR ref(`refs/pull/*`) 포함 여부** — 보통 **제외 권장**(정상 브랜치만 푸시). 별도 지시 없으면 제외.
3. **A-1 점유 허용 확인** — 운영 앱 EC2에서 배포 빌드가 잠시 CPU/디스크를 점유하는 것 수용 가능한지. (불가 시 A-2 전용 러너로 전환 — 비용 발생)

---

## 부록 A — 실행 순서 요약

```
Phase 0  사전준비(토큰·glab)
Phase 1  GitLab 프로젝트 생성 + git push --mirror
Phase 2  Runner 점검/구축 (arm64 배포 러너 = AWS EC2 + 인스턴스 프로파일)
Phase 3  .gitlab-ci.yml CI 잡 작성
Phase 4  .gitlab-ci.yml deploy 잡 작성
Phase 5  CI/CD 변수 등록 (A안은 거의 없음)
Phase 6  GitLab→GitHub push mirror + GitHub Actions 비활성
Phase 7  로컬/팀 remote 전환
검증 G1~G6 → 컷오버
```
