# AbleWork AWS 배포 (aws cli 스크립트)

서울 리전(`ap-northeast-2`)에 AbleWork를 배포하는 멱등 bash 스크립트 모음.
전체 설계는 승인된 계획서(요약: `docs` 또는 PR 설명) 참조.

## 토폴로지

```
CloudFront(work.abmwc.net, HTTPS) → ALB(:80) → EC2 Docker(web:3000 / api:3001)
                                                  ├ RDS PostgreSQL
                                                  ├ ElastiCache Redis
                                                  └ S3(첨부) ← EC2 인스턴스 역할
```

비밀은 **SSM Parameter Store**, 컨테이너 이미지는 **ECR**, CI/CD는 **GitHub Actions(OIDC)**.

## 사전 준비 — 자격증명

스크립트는 `AWS_PROFILE=ablework`, `AWS_REGION=ap-northeast-2` 를 기본 사용한다.
부트스트랩(00~01)에는 **IAM/ECR/SSM/EC2/ELB/RDS/ElastiCache/S3/CloudFront/Route53/ACM** 생성 권한이 필요하다(초기엔 관리자 권한 사용 후 축소 권장).

```bash
aws configure --profile ablework      # Access Key / Secret / region=ap-northeast-2 / output=json
aws sts get-caller-identity --profile ablework   # 확인
```

> 다른 프로파일/리전을 쓰려면: `AWS_PROFILE=xxx AWS_REGION=xxx bash deploy/aws/00-prereqs.sh`

## 실행 순서

| 단계 | 스크립트 | 내용 |
|---|---|---|
| 1-a | `00-prereqs.sh` | 자격증명 점검 + ECR 리포(`ablework-api`,`ablework-web`) |
| 1-b | `01-iam.sh` | EC2 인스턴스 역할/프로파일 + GitHub OIDC + 배포 역할 |
| 1-c | `02-ssm-params.sh` | `.env.prod` → SSM 파라미터(`/ablework/api/prod/*`) |
| 3 | `03-network.sh` *(예정)* | VPC·서브넷·SG (NAT 없음) |
| 3 | `04-data.sh` *(예정)* | RDS·ElastiCache·S3 + DATABASE_URL/REDIS_URL SSM 기록 |
| 4 | `05-compute.sh` *(예정)* | EC2·ALB·타깃그룹·리스너 |
| 5 | `06-edge.sh` *(예정)* | ACM(us-east-1)·CloudFront·Route53(work.abmwc.net) |

### Step 1 빠른 시작

```bash
bash deploy/aws/00-prereqs.sh
GH_REPO=romis9724/AbleWork bash deploy/aws/01-iam.sh   # git 리모트 자동감지, 필요 시 지정

cp deploy/aws/.env.prod.example deploy/aws/.env.prod
# .env.prod 에서 MAIL_PASS(Gmail 앱비번) 등 채우기 — JWT_SECRET 은 비워두면 자동 생성
bash deploy/aws/02-ssm-params.sh
```

모든 스크립트는 **멱등**(재실행해도 안전)하다.

## 주의

- `deploy/aws/.env.prod` 는 **절대 커밋 금지**(`.gitignore` 등록됨). 비밀은 SSM SecureString 으로만 보관.
- 스토리지는 EC2 **인스턴스 역할**로 S3 접근 → 앱에 정적 AWS 키를 두지 않는다.
- `work.abmwc.net` Route53 호스팅존/위임은 Step 5(`06-edge.sh`)에서 DNS 현황 확인 후 진행.
