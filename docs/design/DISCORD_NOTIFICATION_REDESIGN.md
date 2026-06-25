# Discord 알림 개인화 재설계 (Personal DM Notification)

> 출퇴근·휴가·전자결재 등 모든 알림을 **직원 개인 Discord DM 중심**으로 전환하고,
> 직원이 **Discord OAuth로 본인 계정을 연동**하게 한다. 공용 채널 Webhook은 폐지한다.
> 인터뷰 확정안(2026-06-25) 기반. 관련: `MESSENGER_APPROVAL.md`, `SYSTEM_DESIGN.md` §알림.

---

## 1. 배경 / 목표

현재 Discord 알림은 두 갈래로 분리돼 있고, 개인화가 안 돼 있다.

- **목표**: 본인 관련 이벤트(내 결재 차례·내 휴가 결과·내 지각 등)를 **당사자 개인 Discord DM**으로 받는다.
- **직원 연동**: 직원이 "Discord로 연동" 버튼으로 OAuth 인증 → User ID 자동 저장.
- **공용 채널 폐지**: 모두가 한 채널에서 보던 방식을 없애고 개인 DM으로 일원화.
- **누락 방지**: Discord 미연동 직원은 인앱 + 이메일로 자동 fallback.

---

## 2. 현황 정리 (AS-IS)

### 2.1 두 갈래 발송 경로 (분리돼 있음)

| 경로 | 모듈 | 방식 | 대상 | 트리거 |
|---|---|---|---|---|
| **① 공용 채널 Webhook** | `notifications` (`NotificationRule`) | Incoming Webhook → 회사 공용 채널 1곳 브로드캐스트 | 채널 전체(개인 구분 없음) | 21개 이벤트 전부 |
| **② 개인 DM** | `integrations/messenger` (`MessengerApprovalListener`) | 봇 DM + `[승인][반려]` 버튼 | 현재 결재자 본인 | 전자결재/요청 **상신** 시 |

- 경로 ①: `NotificationRule(eventType, channelType, webhookUrl, isActive)` — 관리자가 이벤트별 on/off.
- 경로 ②: `MessengerAccount(employeeId ↔ externalUserId)` 매핑 사용, 봇이 DM 채널 개설 후 발송.
- email·in_app 채널도 `NotificationRule`로 존재(개인 수신자 = `assigneeId ?? drafterId ?? requesterId`).

### 2.2 21개 알림 이벤트 (`packages/shared-constants/src/notification.ts`)

- **출퇴근**: `attendance.clock_in`, `attendance.late`
- **휴가**: `leave.requested/approved/rejected`
- **근무·근태 요청**: `shift.*`, `attendance.*`(정정) (requested/approved/rejected)
- **기타 요청**: `device.change_*`, `offsite.*`, `custom.*`
- **전자결재**: `document.submitted/step_pending/approved/rejected/recalled/bounced`

### 2.3 직원 연동 현황 (`MessengerAccount`)

- 백엔드 **완비**: `POST/GET/DELETE /integrations/messenger/accounts` (본인 JWT, upsert).
- 연동 방식: 직원이 **Discord User ID 수동 입력**(개발자 모드로 ID 복사). 검증 없음.
- ⚠️ **프론트엔드 UI 없음** — 일반 직원이 연동할 경로가 사실상 없음.
- 봇 DM 전제: 직원이 **봇이 들어가 있는 회사 Discord 서버에 가입**돼 있어야 함(Discord 정책).

---

## 3. 재설계 (TO-BE)

### 3.1 원칙

1. **당사자 = 개인 DM**. 알림은 그 일에 직접 관여하는 사람에게 개인 DM으로 보낸다.
2. **공용 채널 Webhook 폐지**. 모두에게 뿌리는 채널 브로드캐스트는 없앤다.
3. **모니터링성은 본인 + 관리자 DM**. 지각 등 관리가 필요한 건 본인과 관리자 모두에게.
4. **미연동 fallback**: Discord 미연동 시 인앱 + 이메일. 연동되면 Discord DM 우선(중복 발송 안 함).

### 3.2 이벤트별 수신자 매핑

> 패턴: **requested/submitted → 다음 처리자(결재자)** · **결과(approved/rejected 등) → 당사자(신청자·기안자)** · **모니터링성 → 본인 + 관리자**

| 이벤트 | 수신자 | DM 형태 | 비고 |
|---|---|---|---|
| `document.submitted` | 기안자 | 텍스트 | 본인 상신 확인용 — 저가치, **기본 OFF 권장** |
| `document.step_pending` | 해당 결재자 | `[승인][반려]` 버튼 | 핵심 |
| `document.approved` | 기안자 | 텍스트 | |
| `document.rejected` | 기안자 | 텍스트 | |
| `document.recalled` | 기안자 | 텍스트 | 저가치 — 기본 OFF 가능 |
| `document.bounced` | 기안자 | 텍스트 | |
| `leave.requested` / `shift.requested` / `attendance.requested` / `device.change_requested` / `offsite.requested` / `custom.requested` | **현재 결재자**(PENDING step) | `[승인][반려]` 버튼 | 신청자 본인 아님 — 처리자에게 |
| `*.approved` (휴가/근무/근태/기기/외근/기타) | 신청자 본인 | 텍스트 | 결과 통보 |
| `*.rejected` (동일) | 신청자 본인 | 텍스트 | 결과 통보 |
| `attendance.late` | **본인 + 관리자** | 텍스트 | 모니터링성 |
| `attendance.clock_in` | (없음) | — | 정상 출근은 알림 가치 낮음 — **기본 OFF/미발송** |

> **수정 포인트(현 버그)**: 현재 email/in_app 수신자 우선순위가 `assigneeId ?? drafterId ?? requesterId`라 `*.requested`가 **신청자 본인**에게 가는 경우가 있음("내가 신청한 걸 나에게 통보" — 무의미). requested 계열은 **결재자**로 보내도록 수신자 해석을 바로잡는다(개인 DM 경로 `MessengerApprovalListener`는 이미 PENDING 결재자로 보냄 — 일관화).

### 3.3 "관리자" 정의 (모니터링성 수신자) — 확정

- **소속 부서 팀장**(`organization.approverId`) 에게만 본인 외 모니터링 DM. (회사 관리자 미포함 — 인터뷰 확정)

---

## 4. 직원 Discord 연동 — OAuth 플로우

### 4.1 흐름

```
[me/profile · 연동 UI]
  └─ "Discord로 연동" 클릭
      → GET /integrations/discord/oauth/start   (state 발급·세션 보관)
      → Discord 인증 화면 (scope: identify + guilds.join)
      → (콜백 후) 봇이 회사 길드에 사용자 자동 합류 (guilds.join — 봇 토큰 + 길드 ID)
      → 콜백 GET /integrations/discord/oauth/callback?code&state
          ├─ state 검증 (CSRF)
          ├─ code → access_token 교환 (token endpoint)
          ├─ GET /users/@me → Discord user id 획득
          ├─ MessengerAccount upsert(employeeId, platform=discord, externalUserId=user.id)
          └─ me/profile로 리다이렉트 (연동 완료 토스트)
```

### 4.2 필요 설정 / 환경변수

> **AWS는 `.env` 파일이 아니라 SSM Parameter Store(`/ablework/api/prod/*`)로 관리**한다.
> 배포 시 `deploy/aws/app/fetch-env.sh`가 경로 전체를 `--with-decryption`으로 읽어 컨테이너 env로 주입하므로,
> SSM에 키만 추가하면 코드 수정 없이 반영된다(반영하려면 **재배포** 필요).

- 기존(SSM에 이미 존재): `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`
- **추가할 키**:
  | 키 | 타입 | 값 |
  |---|---|---|
  | `DISCORD_CLIENT_SECRET` | SecureString | Discord 포털 OAuth2 Client Secret |
  | `DISCORD_OAUTH_REDIRECT_URI` | String | `https://work.abmwc.net/api/v1/integrations/discord/oauth/callback` ← **globalPrefix `api/v1` 포함** |
  | `DISCORD_GUILD_ID` | String | 회사 Discord 서버 ID (guilds.join 대상) |
  | `WEB_BASE_URL` | String | `https://work.abmwc.net` (콜백 후 FE 리다이렉트, 기본값 동일) |
  | `DISCORD_CLIENT_ID` | String | 생략 시 `DISCORD_APPLICATION_ID` 재사용 |
- Discord 개발자 포털: OAuth2 → Redirects에 위 redirect URI 등록 + Client Secret 발급, scope `identify guilds.join`.

### 4.3 봇 DM 전제 (중요 제약)

- 봇이 DM을 보내려면 **수신자와 봇이 같은 길드(서버)에 공존**해야 한다.
- 따라서 연동 시 회사 Discord 서버 가입을 유도(초대 링크 안내) 하거나, OAuth `guilds.join` scope + 봇의 `Create Instant Invite`로 자동 합류.
- 미충족 시 DM 발송이 403(Cannot send messages to this user) → **fallback(인앱·이메일)** 으로 처리.

### 4.4 연동 UI (FE, 1단계 구현 대상)

- 위치: `apps/web/src/app/me/profile`(또는 `me/settings`)에 "메신저 연동" 섹션.
- 구성: 연동 상태 배지 + "Discord로 연동" 버튼 + 해제 버튼 + 안내(회사 서버 가입 필요).
- 쿼리 훅 신설: `lib/query/messenger.ts` — `useMyMessengerAccounts`, `useUnlinkMessenger`(연동은 OAuth 리다이렉트라 mutation 대신 링크 이동).

---

## 5. Fallback (미연동·발송 실패)

발송 우선순위(이벤트당 1회, 중복 없음):

```
1) Discord 연동 O + DM 성공 → 끝
2) Discord 미연동  → in_app + email
3) Discord 연동 O 이나 DM 실패(403/404) → in_app + email 로 폴백
```

- 구현: 통합 디스패처가 수신자별로 "DM 가능 여부"를 먼저 판정 → 경로 선택.
- `NotificationLog`에 채널·성공/실패·폴백 여부 기록.

---

## 6. 단계별 구현 계획

### 1단계 — 직원 연동 OAuth + UI ✅ (이번 범위)
- BE: `/integrations/discord/oauth/start`·`/callback` 추가, state 검증, 토큰 교환, `MessengerAccount` upsert.
- FE: `me/profile` 메신저 연동 섹션 + `lib/query/messenger.ts`.
- 환경변수·Discord 포털 설정 문서화.
- 기존 수동 입력 API는 유지(관리자/디버그용) 또는 deprecate.

### 2단계 — 알림 라우팅 개인화
- 수신자 해석 정정(requested → 결재자), 이벤트별 매핑표(§3.2) 반영.
- Discord 발송을 **개인 DM**으로 확대(현 `MessengerApprovalListener` 일반화 → 모든 NOTIFIABLE 이벤트).
- 모니터링성(`attendance.late`) 본인 + 관리자 DM.
- fallback 디스패처(§5).

### 3단계 — 공용 채널 Webhook 폐지 / 정리
- `NotificationRule`의 `discord` 채널(Webhook) 사용 중단·마이그레이션.
- 관리자 알림 설정 화면을 "이벤트별 on/off + 수신자 규칙"으로 정리.

---

## 7. 마이그레이션 / 영향

- `MessengerAccount`: 기존 모델 사용. 연동 출처 구분 위해 `linkedVia`(oauth|manual) 컬럼 추가 검토(선택).
- `NotificationRule`: 3단계에서 discord Webhook 규칙 정리(채널→개인 라우팅으로 의미 변경). 호환성 고려.
- 데이터 손실 없음. 단 3단계에서 공용 채널 발송 중단은 운영 공지 필요.

---

## 8. 결정 (인터뷰 확정 2026-06-25)

1. **관리자 정의**: 소속 부서 팀장(`organization.approverId`)만.
2. **저가치 이벤트**: `attendance.clock_in` · `document.submitted` · `document.recalled` 는 기본 OFF.
3. **회사 서버 가입**: OAuth `guilds.join` scope로 연동 시 봇이 회사 Discord 서버에 자동 합류시킴.
4. **수동 입력 API**: 1단계에서는 유지(관리자/디버그용), 추후 deprecate 검토.
