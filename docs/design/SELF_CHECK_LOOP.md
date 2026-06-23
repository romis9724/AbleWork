# 자가점검·자가수정 루프 (Self-Check & Self-Correction Loop)

> AbleWork ERP에 적용하는 "루프 엔지니어링" 실행 규격.
> 참고: Addy Osmani, *Loop Engineering* (addyosmani.com/blog/loop-engineering)
>
> **한 줄 요약:** "에이전트를 직접 프롬프트하지 말고, 에이전트를 프롬프트하는 루프를 설계하라."
> 사람이 매 턴 지시하는 대신 **목적(goal)** 과 **참(true)이 되어야 할 조건**을 정의하고,
> 에이전트가 그 조건이 실제로 충족될 때까지 *생성 → 검증 → 수정*을 반복한다.

---

## 0. 이 문서를 언제 읽는가

- Claude Code에게 "자가점검 돌려줘 / 루프 돌려줘 / 셀프 체크"를 지시할 때
- 미완료 기능을 자율적으로 완성·수정시키는 작업을 시작할 때
- CI 실패·회귀 버그를 무인(unattended)으로 분류·수정시킬 때

루프는 **편하려고 쓰는 것이 아니다.** "이해한 일을 더 빠르게" 하려고 쓴다.
무인 루프는 곧 **무인으로 실수하는 루프**다 (§8 참조).

---

## 1. 루프 구성요소 → AbleWork 자산 매핑

Osmani가 제시한 루프의 6개 1차 구성요소를 이 저장소의 실제 자산에 대응시킨다.

| 구성요소 | 역할 | AbleWork에서의 실체 |
|---|---|---|
| **Automation (심장박동)** | 일감을 주기적으로 발굴·분류 | CI 실패(`gh run list`), 미완료 Goal(`docs/*GAP_ANALYSIS.md`), `/loop`·CronCreate 스케줄 |
| **Worktree (격리)** | 병렬 실행 시 파일 충돌 방지 | `git worktree` / Agent `isolation: "worktree"`. 작업 1건 = 1 worktree = 1 브랜치 |
| **Skill (재사용 지식)** | 매 사이클 프로젝트를 0부터 재발견하지 않게 함 | `CLAUDE.md`, `docs/design/*`, `memory/MEMORY.md` 인덱스 |
| **Connector (외부 연동)** | "고치는 것"을 넘어 PR·알림까지 | `gh`(PR), Discord Webhook(알림), SSM(AWS 운영) |
| **Sub-agent (생성 vs 검증 분리)** | "코드를 쓴 모델은 자기 숙제 채점에 너무 관대하다" | `code-reviewer`, `security-reviewer`, `typescript-reviewer`, `tdd-guide` |
| **Persistent State (외부 기억)** | 런 사이의 컨텍스트 한계 보완 | `docs/loop/STATE.md`(아래 §5), 설계·테스트 문서 동기화 |

---

## 2. 루프 한 사이클의 흐름

```
        ┌──────────────────────────────────────────────────────┐
        │ ① TRIAGE  일감 발굴 → STATE.md 기록 (목표·정지조건 명시)│
        └───────────────────────────┬──────────────────────────┘
                                     ▼
        ┌──────────────────────────────────────────────────────┐
        │ ② PLAN    worktree 생성 · 영향 범위·설계문서 동기화 계획 │
        └───────────────────────────┬──────────────────────────┘
                                     ▼
        ┌──────────────────────────────────────────────────────┐
        │ ③ GENERATE  생성 서브에이전트가 TDD로 구현 (RED→GREEN)  │
        └───────────────────────────┬──────────────────────────┘
                                     ▼
        ┌──────────────────────────────────────────────────────┐
        │ ④ VERIFY   §3 게이트 전부 통과? + 독립 검증 서브에이전트 │
        └───────────────┬───────────────────────┬──────────────┘
              조건 미충족 │                       │ 모든 조건 = true
                         ▼                       ▼
        ┌────────────────────────┐   ┌──────────────────────────┐
        │ ⑤ CORRECT 원인 분석·수정 │   │ ⑥ SHIP  설계/테스트 문서   │
        │   → ③ 으로 복귀 (반복)   │   │   동기화 → PR(gh) → 알림   │
        └────────────────────────┘   └──────────────────────────┘
```

핵심은 ④의 **정지 조건**이다. "다 된 것 같다"가 아니라 **§3의 모든 게이트가 객관적으로 true**일 때만 ⑥으로 간다.

---

## 3. 검증 게이트 (정지 조건) — 객관적이고 기계 검증 가능해야 함

루프는 아래가 **전부 통과**해야 종료한다. 하나라도 실패하면 ⑤ CORRECT로 돌아간다.
명령은 모두 저장소 루트 기준이며 CI(`.github/workflows/ci.yml`)와 정합한다.

| # | 게이트 | 명령 | 통과 기준 |
|---|---|---|---|
| G1 | 타입체크 | `pnpm typecheck` | 에러 0 |
| G2 | 린트 | `pnpm lint` | warning 0 (`--max-warnings=0`) |
| G3 | 단위 테스트 + 커버리지 | `pnpm --filter api test -- --coverage` | 통과 · **Service 레이어 라인 80%+**(CI 하한 70%) |
| G4 | 통합/E2E (API) | `pnpm --filter api test:e2e` | 통과 (DB·Redis 기동 필요) |
| G5 | 프로덕션 빌드 | `pnpm build` | api·web 모두 성공 |
| G6 | Prisma 정합 | 스키마 변경 시 `prisma migrate dev` + `prisma generate` | 마이그레이션 파일 존재 · 클라이언트 최신 (§4-D) |
| G7 | 프론트 E2E (해당 시) | `pnpm test:e2e` (Playwright) | 변경된 화면 흐름 통과 |

> **로컬 인프라 주의 (memory: 로컬 포트):** 이 환경은 web 4000 · api 4001 · redis 6380(standalone).
> G4 실행 전 `pnpm infra:up`으로 postgres·redis 기동, `pnpm --filter api prisma migrate deploy` 적용.
> API는 ts-node 직접 실행이라 코드 변경 후 **수동 재시작** 필요.

---

## 4. 가드레일 — 검증 게이트와 별개로 *절대 위반 금지*

`pnpm test`가 초록불이어도 아래를 위반하면 루프는 **즉시 중단**하고 사람에게 보고한다.

### A. NEVER 목록 (`CLAUDE.md` §1)
급여 정산(payroll)·전자계약·급여명세서 메시지·Enterprise 전용 기능(생체/2FA/IP화이트리스트/스케줄 publish/비례연차)·`payroll_*` 테이블·**repository 레이어 클래스 생성**·**Tailwind 사용**·**마이그레이션 없는 스키마 직접 변경**은 절대 금지.

### B. 멀티테넌시 강제 (보안 — CRITICAL)
모든 DB 쿼리에 `companyId` 조건 필수. 누락 시 타사 데이터 유출.

```bash
# 자가점검 휴리스틱: companyId 누락 가능성이 있는 쿼리 후보 추출
grep -rnE "prisma\.[a-zA-Z]+\.(findMany|findFirst|findUnique|count|aggregate|updateMany|deleteMany)" \
  apps/api/src --include=*.ts | grep -vi "companyId"
```
출력된 각 라인은 **반드시 사람이 또는 검증 서브에이전트가** companyId 스코핑 여부를 확인한다 (false positive 존재).

### C. 코드 품질 하드 리밋
- 단일 파일 **800줄** 초과 금지 · 함수/메서드 **50줄** 초과 시 분리
- 레이어 패턴 준수: `Controller → Service → PrismaService(직접)`
- 불변성: 기존 객체 변형 금지, 새 객체 반환

### D. 마이그레이션 정합
`apps/api/prisma/schema.prisma`를 변경했는데 `apps/api/prisma/migrations/`에 새 디렉토리가 없으면 **G6 실패로 간주**. 런타임 에러의 주원인.

### E. 문서 동기화 (`feedback: ablework_workflow`)
구현이 끝나면 관련 **설계 문서(`docs/design/*`)와 테스트 문서(`docs/testing/*`)를 항상 같이 갱신**한다. 알림 이벤트 추가 시 SSOT는 `packages/shared-constants/src/notification.ts`.

---

## 5. 영속 상태 파일 규약 — `docs/loop/STATE.md`

루프는 런 사이의 기억을 이 파일로 유지한다. 모델 컨텍스트가 끊겨도 이 파일만 읽으면 재개 가능해야 한다.
**루프 시작 시 없으면 생성**, 매 사이클 갱신, 종료 시 결과 기록.

```markdown
# 루프 상태 — <목표 한 줄>

## 목표 (Goal)
<무엇을 참으로 만들 것인가. 측정 가능하게.>

## 정지 조건 (Done = 아래가 전부 true)
- [ ] G1~G7 전부 통과
- [ ] 가드레일 §4 위반 0
- [ ] <기능 고유 수용 기준, 예: "POST /requests → Document 자동 생성 e2e 통과">

## 백로그 (우선순위 순)
1. [ ] <작업> — 영향 파일: <경로> — worktree: <브랜치명>

## 진행 중
- 작업: <…> / 사이클: N / 마지막 게이트 결과: G3 FAIL(커버리지 76%)

## 발견·결정 로그 (append-only)
- 2026-06-23 G4 실패: leave_balance 차감 트랜잭션 경합 → $transaction로 감쌈
- 2026-06-23 결정: wage-info 모듈 분리는 보류 (memory 근거)

## 미해결·사람 확인 필요 (BLOCKED)
- <NEVER 경계에 닿는 모호 케이스 등>
```

`docs/loop/` 는 신규 디렉토리다. 런별 상세 로그가 필요하면 `docs/loop/runs/<date>.md`로 분리한다.

---

## 6. 서브에이전트 역할 분리 (생성 ≠ 검증)

> "코드를 쓴 모델은 자기 숙제 채점에 너무 관대하다." → **생성과 검증은 다른 에이전트가 한다.**

| 단계 | 에이전트 | 비고 |
|---|---|---|
| 생성 ③ | `tdd-guide`(테스트 우선) → 본 세션/`general-purpose` | RED→GREEN→REFACTOR |
| 검증 ④ | `code-reviewer` | 품질·패턴·파일/함수 크기 |
| 검증 ④ | `security-reviewer` | **멀티테넌시·인증/인가·입력검증 (CRITICAL 우선)** |
| 검증 ④ | `typescript-reviewer` | 타입 안정성·async 정확성 |
| 검증 ④ | `pr-test-analyzer` | 테스트가 실제 버그를 막는가 (행위 커버리지) |

독립 검증 에이전트가 **CRITICAL/HIGH를 하나라도** 내면 ④는 실패 → ⑤ CORRECT.

---

## 7. 안전장치 — "엔지니어로 남기" (Osmani의 3가지 경고)

1. **검증 책임은 여전히 사람의 것.** 무인 루프는 무인으로 실수한다 → 게이트를 기계 검증 가능하게 유지하고, PR 전 사람 승인 게이트를 둔다.
2. **이해 부채(comprehension debt).** 루프가 빨리 짤수록 "존재하는 것"과 "내가 이해한 것"의 간극이 커진다 → STATE.md 결정 로그로 *왜* 그렇게 했는지 남긴다.
3. **인지적 항복.** "루프가 내놓은 걸 그냥 받기"는 *생각을 회피하려고* 할 때 가속 페달이 된다 → 모호하거나 NEVER 경계에 닿으면 자동 진행 대신 **BLOCKED 보고**.

**자동 진행 vs 사람 확인 경계**
- 자동 진행 OK: 게이트가 명확하고, 변경이 NEVER 목록 밖이며, 설계 의도가 문서로 확정된 작업
- 반드시 사람 확인: 스키마 파괴적 변경, 권한/인증 로직, NEVER 인접, 외부로 나가는 행위(배포·메일·알림 대량 발송), 되돌리기 어려운 작업

---

## 8. 진입 프롬프트 (Claude Code에 그대로 지시)

### (A) 1회성 자가점검 — 현재 작업물 점검·수정
```
docs/design/SELF_CHECK_LOOP.md 를 읽고 자가점검·자가수정 루프를 1사이클 실행해라.

1. docs/loop/STATE.md 가 없으면 §5 템플릿으로 생성하고, 이번 점검 목표·정지조건을 채워라.
2. §3 게이트 G1~G6 를 순서대로 실행하고 결과를 STATE.md 발견 로그에 기록해라.
3. 실패한 게이트가 있으면 원인을 분석해 최소 diff로 수정하고 해당 게이트를 재실행해라.
4. §4 가드레일(특히 B 멀티테넌시 grep, A NEVER, D 마이그레이션)을 점검해라.
5. 코드 수정 후 code-reviewer·security-reviewer 서브에이전트로 독립 검증을 받아라.
6. NEVER 경계에 닿거나 파괴적 변경이 필요하면 진행을 멈추고 STATE.md BLOCKED에 적고 나에게 물어라.

모든 게이트가 true가 되면 변경 요약과 게이트 결과표를 보고해라. 내 승인 없이 커밋·PR·푸시하지 마라.
```

### (B) 자율 루프 — 미완료 목표를 정지조건까지 완성
```
/loop docs/design/SELF_CHECK_LOOP.md 의 루프를 실행해서 <목표: 예) Phase 2 Goal 14 부서협조 흐름> 를
§3 게이트가 전부 통과하고 §4 가드레일 위반이 0이 될 때까지 생성→검증→수정을 반복해라.

- 작업은 git worktree(또는 Agent isolation:"worktree")로 격리해서 진행해라.
- 생성과 검증은 다른 서브에이전트가 맡아라(§6).
- 매 사이클 docs/loop/STATE.md 를 갱신해라.
- 막히거나 NEVER 경계면 멈추고 BLOCKED 보고 후 다음 백로그로 넘어가라.
- 정지조건 충족 시 설계/테스트 문서를 동기화하고, PR 초안까지만 만들고(푸시·머지는 내 승인 대기) 멈춰라.
```

### (C) CI 실패 분류·수정 (Automation/heartbeat 용)
```
gh run list 로 최근 실패한 CI 런을 확인하고, docs/design/SELF_CHECK_LOOP.md 루프로
각 실패를 분류(triage)해 STATE.md 백로그에 우선순위와 함께 적은 뒤,
worktree에서 하나씩 §3 게이트가 초록불이 될 때까지 수정해라. 푸시 전 나에게 보고해라.
```

---

## 9. 빠른 참조 — 검증 명령 묶음

```bash
# 인프라 (G4용)
pnpm infra:up && pnpm --filter api prisma migrate deploy

# 게이트 일괄 (실패 즉시 멈춤)
pnpm typecheck \
  && pnpm lint \
  && pnpm --filter api test -- --coverage \
  && pnpm --filter api test:e2e \
  && pnpm build

# 멀티테넌시 자가점검 휴리스틱
grep -rnE "prisma\.[a-zA-Z]+\.(findMany|findFirst|findUnique|count|aggregate|updateMany|deleteMany)" \
  apps/api/src --include=*.ts | grep -vi "companyId"

# 스키마 변경 정합 점검
git status --porcelain apps/api/prisma/schema.prisma
ls apps/api/prisma/migrations | tail -3
```

---

## 10. 참조 문서

| 문서 | 내용 |
|---|---|
| `CLAUDE.md` | NEVER 목록·비즈니스 룰·코딩 컨벤션·가드레일 SSOT |
| `.github/workflows/ci.yml` | 게이트 정합 기준(typecheck/lint/unit+coverage/integration) |
| `docs/design/PHASE2_GAP_ANALYSIS.md` · `docs/phase1-gap-analysis.md` | 미완료 목표 = 루프 백로그 후보 |
| `docs/testing/*` | 수용 기준·테스트 시나리오 |
| `packages/shared-constants/src/notification.ts` | 알림 이벤트 SSOT |
