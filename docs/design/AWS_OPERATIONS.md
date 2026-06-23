# AbleWork AWS 운영 런북 (인수인계)

> 다른 세션·다른 사람이 AWS에 접속해 운영/배포를 이어갈 수 있도록 정리한 실전 가이드.
> 인프라 생성 스크립트는 `deploy/aws/`(멱등 aws cli), 설계 배경은 승인 계획서 참조.
> **이 문서의 리소스 ID·엔드포인트는 2026-06-22 기준 라이브 상태에서 검증됨.**

---

## 0. 한눈에 보기

| 항목 | 값 |
|---|---|
| AWS 계정 | `503447502349` |
| 리전 | `ap-northeast-2` (서울), CloudFront용 ACM만 `us-east-1` |
| 서비스 도메인 | https://work.abmwc.net |
| 로컬 운영 프로파일 | `ablework` (IAM User `ablework`) |
| 배포 방식 | `main` 푸시 → GitHub Actions(OIDC) → ECR → SSM로 EC2 재배포 |
| 컴퓨트 | EC2 1대(Graviton, Docker로 web+api 컨테이너) |
| 데이터 | RDS PostgreSQL · ElastiCache Redis · S3(첨부) |
| 비밀 | SSM Parameter Store `/ablework/api/prod/*` |
| 예상 비용 | 월 ~$50–65 (NAT 미사용으로 절감) |

토폴로지:

```
사용자 ─HTTPS─▶ CloudFront(work.abmwc.net) ─HTTP─▶ ALB(:80, 퍼블릭 ×2 AZ)
                                                    ├ 기본    → TG web → EC2:3000 (Next.js SSR)
                                                    └ /api/*  → TG api → EC2:3001 (NestJS, prefix /api/v1)
                                                              │ EC2 인스턴스 역할(SSM·ECR·S3·logs)
                                          ┌─────────────────────┼─────────────────────┐
                                   RDS PostgreSQL16      ElastiCache Redis7            S3
                                   db.t4g.micro          cache.t4g.micro        ablework-prod-files
                                   (private subnet)      (private subnet)       (instance-role 접근)
```

- VPC 1 / 2 AZ(2a·2c) / 퍼블릭 서브넷 2 + 프라이빗 2 / **NAT Gateway 없음**(비용 절감, EC2는 퍼블릭 서브넷+잠긴 SG).
- CloudFront↔ALB는 HTTP + 커스텀 시크릿 헤더 + CloudFront prefix-list로 직접 접근 차단. 뷰어↔CloudFront만 HTTPS.

---

## 1. 사전 준비 — 로컬에서 AWS 접속

새 머신/새 세션에서 작업하려면 `ablework` 프로파일과 도구가 필요하다.

```bash
# 1) aws cli (미설치 시): brew install awscli
# 2) ablework 프로파일 구성 (Access Key/Secret는 IAM User 'ablework'의 키 — 안전하게 보관된 것 사용)
aws configure --profile ablework      # region=ap-northeast-2, output=json
aws sts get-caller-identity --profile ablework   # Account 503447502349 확인

# 3) EC2 쉘 접속용 플러그인(현재 로컬 미설치)
brew install --cask session-manager-plugin
```

> 모든 `deploy/aws/*.sh`는 `AWS_PROFILE=ablework`, `AWS_REGION=ap-northeast-2`를 기본 사용한다(`lib/common.sh`). 다르게 쓰려면 `AWS_PROFILE=x AWS_REGION=y bash deploy/aws/0X-*.sh`.

---

## 2. 리소스 인벤토리 (검증된 라이브 값)

> 스크립트가 만드는 리소스 ID는 `deploy/aws/.state/prod.env`(git-ignore)에 자동 기록된다. 아래는 그 사본 + 라이브 확인값.

### 네트워크
| 리소스 | ID |
|---|---|
| VPC | `vpc-06b5e428cdc15c3d2` |
| 퍼블릭 서브넷 | `subnet-033560600d6c2a27a`(2a) · `subnet-0fc21783ca1187274`(2c) |
| 프라이빗 서브넷 | `subnet-06235b9c31313ee89`(2a) · `subnet-02d5850c9a438f984`(2c) |
| IGW | `igw-00f399ba204407390` |
| SG | alb `sg-02a95ace60c3a0f94` · ec2 `sg-0f129935f2efad7ff` · rds `sg-0d221bd7041cbe278` · redis `sg-01381e70f3e83bc6d` |

### 컴퓨트·엣지
| 리소스 | 값 |
|---|---|
| EC2 | `i-016c7b5ada07cdc9c` · t4g.small · 2a · public IP `43.203.169.225`(SG로 잠김) |
| EC2 IAM 프로파일 | `ablework-prod-ec2-profile` |
| ALB DNS | `ablework-prod-alb-1511242728.ap-northeast-2.elb.amazonaws.com` |
| TG | web `ablework-prod-tg-web` · api `ablework-prod-tg-api` (둘 다 healthy) |
| CloudFront | `E2W15EYUO1ISTL` · `d1tk25eby9rktx.cloudfront.net` · alias `work.abmwc.net` |
| ACM(us-east-1) | `arn:aws:acm:us-east-1:503447502349:certificate/ab96ecde-28c0-453c-a751-fd6643f67fbb` |

### 데이터
| 리소스 | 값 |
|---|---|
| RDS | `ablework-prod-pg` · postgres16 · db.t4g.micro · `ablework-prod-pg.cqzgzhivsmx7.ap-northeast-2.rds.amazonaws.com:5432` |
| RDS 비밀번호 | `deploy/aws/.state/prod.env`의 `RDS_PASSWORD` (또는 SSM `DATABASE_URL`) |
| ElastiCache | `ablework-prod-redis` · cache.t4g.micro |
| S3 | `ablework-prod-files` (퍼블릭 차단, EC2 인스턴스 역할로 접근) |

### CI/CD·관측
| 리소스 | 값 |
|---|---|
| ECR | `ablework-api` · `ablework-web` (`503447502349.dkr.ecr.ap-northeast-2.amazonaws.com`) |
| GHA 배포 역할(OIDC) | `arn:aws:iam::503447502349:role/ablework-prod-gha-deploy-role` (저장소 Variable `AWS_DEPLOY_ROLE_ARN`에 등록됨) |
| CloudWatch 로그 | `/ablework/prod/api` · `/ablework/prod/web` · `/ablework/ssm-deploy` |
| 대시보드 | `ablework-prod` |
| 알람 | 14개 (`ablework-` 접두사) → SNS → Discord |
| SNS | `ablework-prod-alerts`(2) · `ablework-prod-alerts-use1`(us-east-1, CloudFront 알람용) · `ablework-prod-daily-report` |
| Lambda | `ablework-prod-discord-notify`(알람→Discord) · `ablework-prod-daily-report`(일일 인프라 보고) |
| 예산 | `ablework-prod-monthly` |

---

## 3. 배포

### 3-1. 표준(자동) — main 푸시
`.github/workflows/deploy.yml`가 `main` 푸시·`workflow_dispatch`에 트리거된다.

1. OIDC로 `ablework-prod-gha-deploy-role` assume (정적 키 없음)
2. **arm64 네이티브 러너**(`ubuntu-24.04-arm`)에서 `deploy/Dockerfile`의 `api`·`web` 타깃 빌드(EC2가 Graviton이라 arm64 필수, gha 캐시 사용)
3. ECR에 `latest` + `:<sha>` 푸시
4. 배포 자산(`docker-compose.aws.yml`·`fetch-env.sh`·`deploy.sh`)을 S3에 업로드
5. `aws ssm send-command`로 EC2에서 `deploy.sh` 실행(최대 10분 폴링)

소요 ~5분. 수동 트리거: `gh workflow run deploy.yml -R romis9724/AbleWork`. 상태: `gh run list --workflow=deploy.yml`.

### 3-2. EC2에서 `deploy.sh`가 하는 일 (`/opt/ablework`)
- ECR 로그인 → `fetch-env.sh`로 SSM에서 `.env.app`/`.env.web` 생성
- `docker image prune -af`(디스크 누적 방지) → `compose pull` → `compose up -d`
- **DB 마이그레이션은 api 컨테이너 부팅 시 `prisma migrate deploy` 자동 수행**
- 최초 1회만 `prisma/seed.ts` 실행(`.seeded` 마커로 가드)

### 3-3. 수동 재배포(코드 변경 없이 EC2만 다시 굴리기)
```bash
aws ssm start-session --target i-016c7b5ada07cdc9c --profile ablework
# EC2 안에서:
cd /opt/ablework && bash deploy.sh
```

### 3-4. 롤백
이미지에 커밋 SHA 태그가 같이 푸시되므로, 특정 SHA로 되돌리려면 EC2에서 compose 이미지 태그를 `:<sha>`로 바꿔 pull/up 하거나, 해당 SHA로 `git revert` 후 main에 푸시(권장 — 파이프라인 일관성).

---

## 4. 비밀·설정 (SSM Parameter Store)

경로: `/ablework/api/prod/*`. `fetch-env.sh`가 배포 때 읽어 `.env.app`(api 전체)·`.env.web`(JWT_SECRET+NODE_ENV)을 만든다.

**현재 등록된 키**(값은 SecureString, 출력 금지):
```
AWS_REGION  CORS_ORIGINS  DATABASE_URL  FRONTEND_URL  PORT  S3_BUCKET
JWT_SECRET  JWT_ACCESS_EXPIRES_IN  JWT_REFRESH_EXPIRES_IN
MAIL_HOST  MAIL_PORT  MAIL_SECURE  MAIL_USER  MAIL_PASS  MAIL_FROM
ERROR_REPORT_EMAIL
DISCORD_BOT_TOKEN  DISCORD_APPLICATION_ID  DISCORD_PUBLIC_KEY
DISCORD_ALERT_WEBHOOK_URL  DISCORD_REPORT_WEBHOOK_URL
```
SecureString 분류: `DATABASE_URL REDIS_URL JWT_SECRET MAIL_USER MAIL_PASS DISCORD_BOT_TOKEN DISCORD_ALERT_WEBHOOK_URL DISCORD_REPORT_WEBHOOK_URL`.

**파라미터 변경 후에는 재배포해야 컨테이너에 반영**된다(`.env.*`는 배포 시 재생성).
```bash
# 값 변경(예: 메일 비번 갱신)
aws ssm put-parameter --profile ablework --name /ablework/api/prod/MAIL_PASS \
  --type SecureString --value 'NEW' --overwrite
# 이름만 보기(값 제외)
aws ssm get-parameters-by-path --profile ablework --path /ablework/api/prod --recursive \
  --query 'Parameters[].Name' --output text | tr '\t' '\n' | sort
```
> `deploy/aws/.env.prod`(git-ignore)에 평문으로 값을 채우고 `bash deploy/aws/02-ssm-params.sh`를 재실행해도 된다(멱등 일괄 등록).

---

## 5. 접속·진단 명령 모음

### EC2 쉘 / 컨테이너
```bash
aws ssm start-session --target i-016c7b5ada07cdc9c --profile ablework
# 안에서:
cd /opt/ablework
docker compose -f docker-compose.aws.yml ps
docker compose -f docker-compose.aws.yml logs -f --tail=100 api    # 또는 web
```

### CloudWatch 로그 tail (로컬에서)
```bash
aws logs tail /ablework/prod/api --profile ablework --since 15m --follow
aws logs tail /ablework/prod/web --profile ablework --since 15m
aws logs tail /ablework/ssm-deploy --profile ablework --since 1h   # 배포 로그
```

### RDS 접속 (SSM 포트포워딩 → 로컬 psql)
```bash
aws ssm start-session --target i-016c7b5ada07cdc9c --profile ablework \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["ablework-prod-pg.cqzgzhivsmx7.ap-northeast-2.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["15432"]}'
# 다른 터미널: psql 'postgresql://<user>:<pw>@localhost:15432/<db>'  (자격은 SSM DATABASE_URL 참조)
```

### 헬스·상태
```bash
curl -sI https://work.abmwc.net | head -1                       # 200 기대
curl -s https://work.abmwc.net/api/v1/health || true            # API
aws elbv2 describe-target-health --profile ablework \
  --target-group-arn <TG_API_ARN> --query 'TargetHealthDescriptions[].TargetHealth.State'
```

---

## 6. 인프라 (재)구성 스크립트 — `deploy/aws/`

모두 **멱등**(재실행 안전). `lib/common.sh`의 공통 변수 사용. 처음부터 다시 세울 때의 순서:

| 순서 | 스크립트 | 내용 |
|---|---|---|
| 1 | `00-prereqs.sh` | 자격증명 점검 + ECR 리포 2개 |
| 2 | `01-iam.sh` | EC2 역할/프로파일 + GitHub OIDC + 배포 역할 |
| 3 | `02-ssm-params.sh` | `.env.prod` → SSM 파라미터 |
| 4 | `03-network.sh` | VPC·서브넷4·IGW·라우트·SG 4종 (NAT 없음) |
| 5 | `04-data.sh` | RDS·ElastiCache·S3 + `DATABASE_URL`/`REDIS_URL` SSM 기록 |
| 6 | `05-compute.sh` | EC2(user-data로 docker 설치)·ALB·TG·리스너 |
| 7 | `06-edge.sh` | ACM(us-east-1)·CloudFront·Route53(work.abmwc.net) |
| 8 | `07-monitoring.sh` | SNS·CloudWatch 알람·대시보드·예산 |
| 9 | `08-alerting.sh` | 알람→Discord Lambda + SNS 구독 |
| 10 | `09-daily-report.sh` | 일일 인프라 보고 Lambda + EventBridge 스케줄 |

앱 자산: `deploy/aws/app/`(`docker-compose.aws.yml`·`deploy.sh`·`fetch-env.sh`·`cwagent.json`), Lambda 소스: `deploy/aws/lambda/`.

---

## 7. 트러블슈팅

| 증상 | 점검 |
|---|---|
| 배포 실패 | `gh run view <id> --log-failed`; EC2 단계는 `/ablework/ssm-deploy` 로그 확인 |
| 컨테이너 unhealthy | EC2에서 `docker compose ps`·`logs api`; api 부팅 시 마이그레이션/DB 연결 오류 흔함 |
| 디스크 부족으로 pull 실패 | `deploy.sh`가 매번 `docker image prune -af` 수행 — 그래도 차면 `docker system prune -af` |
| 500/502 | TG health 확인 → api 컨테이너 로그 → RDS/Redis 연결(SG·엔드포인트) |
| 시드 재실행 필요 | EC2에서 `/opt/ablework/.seeded` 삭제 후 `bash deploy.sh` (⚠ 운영 데이터 주의) |
| 설정 변경 미반영 | SSM 변경만으론 부족 — 재배포 필요(`.env.*` 재생성) |
| 인증서/DNS | ACM은 us-east-1, Route53 `work.abmwc.net` ALIAS→CloudFront |
| 에러 자동분석 | API 에러는 AI 분석 후 이메일+Discord+DB(`error_analysis_logs`) 적재. **404·401은 의도적으로 제외**(노이즈, `ErrorAnalysisService.IGNORED_STATUSES`). 관리자 화면: 부가기능 > AI 에러 분석 |

---

## 8. 보안·주의

- `deploy/aws/.env.prod`·`deploy/aws/.state/`는 **`.gitignore` 등록됨 — 절대 커밋 금지**(RDS 비밀번호·시크릿 포함). 비밀은 SSM SecureString이 정본.
- 앱에 **정적 AWS 키 없음** — EC2 인스턴스 역할로 S3·SSM·로그 접근.
- EC2는 퍼블릭 IP가 있으나 SG로 3000·3001을 ALB SG에서만 허용(직접 접근 차단). 쉘은 SSH가 아닌 **SSM Session Manager**.
- GitHub Actions는 OIDC로 역할을 assume — 저장소에 장기 키를 두지 않는다.
- 로컬 `ablework` 프로파일 키는 IAM User의 장기 키이므로 유출 주의(가능하면 권한 축소).

---

## 9. 관련 파일·문서

- 인프라 스크립트: `deploy/aws/` (+ `deploy/aws/README.md` 빠른 시작)
- 멀티타깃 이미지: `deploy/Dockerfile` (api·web)
- CI: `.github/workflows/ci.yml`(typecheck·unit·integration) / CD: `.github/workflows/deploy.yml`
- 설계 배경: `docs/design/ENGINEERING_DESIGN.md`, `docs/design/SYSTEM_DESIGN.md`
