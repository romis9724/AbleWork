# 메신저 양방향 결재 — W3 실데모 가이드

> 메신저 봇 = AI 결재 허브 (1순위 MVP) PoC의 end-to-end 데모 절차·검증·트러블슈팅.
> 설계 SSOT: [`docs/design/MESSENGER_APPROVAL.md`](../design/MESSENGER_APPROVAL.md) · 구현: W1(PR#68)·W2(PR#71·#72)

## 1. 무엇을 검증하나

**휴가/기안 상신 → 결재자 Discord DM `[승인][반려]` → 클릭 → 결재 처리 → 문서 승인** 의 완전한 양방향 회로.

```
[신청자] 상신 ──▶ requests.service ──emit(*_REQUESTED)──▶ MessengerApprovalListener
                                                              │ documentId로 현재 결재자 조회
                                                              │ 결재자의 MessengerAccount(discord) 조회
                                                              ▼
                                              DiscordProvider.sendApprovalRequestToUser
                                                              │ POST /users/@me/channels (DM 채널 개설)
                                                              ▼
                                       [결재자 Discord DM]  ✅승인 / ❌반려  버튼
                                                              │ 클릭
                                                              ▼
                              POST /integrations/discord/interactions (W1, Ed25519 서명검증)
                                                              │ custom_id 파싱 → MessengerAccount 역해석(본인검증)
                                                              ▼
                                       requests.service.approve/reject ──▶ 문서 APPROVED/REJECTED
                                                              │ type 7 응답
                                                              ▼
                                            [DM 메시지] "✅ 승인 완료"로 갱신·버튼 제거
```

## 2. 사전 조건

| 항목 | 비고 |
|---|---|
| `DISCORD_BOT_TOKEN`·`PUBLIC_KEY`·`APPLICATION_ID` | 프로덕션 SSM SecureString (배포 시 컨테이너 주입) |
| Discord Interactions Endpoint URL 등록 | `https://work.abmwc.net/api/v1/integrations/discord/interactions` (W1, PING/PONG 검증됨) |
| **봇과 결재자가 공유 서버에 존재** | Discord 정책상 봇은 공유 길드가 있어야 DM 발송 가능 (없으면 `Cannot send messages to this user`) |
| 결재자의 Discord User ID 연동 | `POST /integrations/messenger/accounts` (본인 JWT) |

## 3. 실데모 절차 (프로덕션)

> 버튼 클릭 콜백은 공개 URL이 필요하므로 **프로덕션에서만** 전 구간이 동작한다(로컬은 Discord가 콜백 불가).

```bash
BASE=https://work.abmwc.net/api/v1

# 0) 결재자(예: 최고관리자) 로그인 → 토큰
PT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@ablework.io","password":"admin1234!"}' | jq -r '.data.accessToken')

# 1) 결재자 본인에 Discord 계정 연동 (externalUserId = 결재자의 Discord User ID)
curl -s -X POST "$BASE/integrations/messenger/accounts" -H "Authorization: Bearer $PT" \
  -H 'Content-Type: application/json' \
  -d '{"platform":"discord","externalUserId":"<DISCORD_USER_ID>"}'

# 2) 신청자(EMPLOYEE)로 로그인 → 상신
ET=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"employee@ablework.io","password":"employee1234!"}' | jq -r '.data.accessToken')
curl -s -X POST "$BASE/requests" -H "Authorization: Bearer $ET" -H 'Content-Type: application/json' \
  -d '{"type":"CUSTOM","payload":{"title":"[W3 데모] 메신저 결재 테스트","content":"Discord DM 승인 버튼 검증"}}'
# → 응답에 documentId가 있으면 결재 연동 완료. 리스너가 결재자 DM 발송을 트리거한다.

# 3) 결재자 Discord DM에서 [✅ 승인] 클릭  ← 사람이 수행

# 4) 결과 확인 — 문서가 APPROVED 인지
curl -s -H "Authorization: Bearer $PT" "$BASE/requests?scope=pending_approval&limit=10" | jq '.data.items[].status'
```

> 신청자는 EMPLOYEE여야 한다(결재자=신청자면 자기결재 방지로 `REQUEST_NO_APPROVER`). `CUSTOM`은 잔액·휴가종류 의존이 없어 데모에 가장 단순하다.

## 4. 검증 포인트

- [ ] 상신 응답에 `documentId` 존재 (전자결재 연동)
- [ ] 결재자 `pending_approval` 목록에 문서 표시
- [ ] 결재자 Discord에 `[승인][반려]` 버튼 DM 수신
- [ ] 버튼 클릭 → DM이 "✅ 승인 완료"로 갱신·버튼 제거
- [ ] 문서 상태 `APPROVED` 전이
- [ ] 미연동 결재자에게는 DM 미발송(조용히 skip)

## 5. 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| DM이 안 옴 | 봇과 결재자가 공유 서버 없음 | 봇을 결재자가 속한 서버에 초대(OAuth2 URL Generator, scope `bot`) |
| DM이 안 옴 | 결재자 미연동 | `GET /integrations/messenger/accounts/me`로 연동 확인 |
| 클릭 후 "연동된 계정이 없습니다" | 클릭자 Discord ID ≠ 연동 ID | 버튼을 누른 Discord 계정과 연동 계정 일치 필요(본인검증) |
| 클릭 후 "처리하지 못했습니다" | 이미 처리됨/권한/단계 불일치 | 문서 상태 확인(`REQUEST_ALREADY_APPROVED` 등) |
| 서명 검증 실패(401) | `PUBLIC_KEY` 불일치 | SSM의 `DISCORD_PUBLIC_KEY`와 포털 값 일치 확인 |

프로덕션 리스너 로그(발송 실패 원인)는 EC2 SSM으로 확인:
```bash
AWS_PROFILE=ablework AWS_REGION=ap-northeast-2 \
  aws ssm send-command --instance-ids <API_INSTANCE_ID> --document-name AWS-RunShellScript \
  --parameters 'commands=["docker logs --tail 100 $(docker ps -qf name=api) 2>&1 | grep -iE \"결재자|messenger\""]'
```

## 6. 자동 테스트 커버리지

| 레이어 | 파일 | 검증 |
|---|---|---|
| 발송(단위) | `messenger-approval.listener.spec.ts` | 결재자 조회·미연동 skip·병렬 중복제거·부분실패 격리 (6) |
| 발송(통합) | `messenger-approval.integration.spec.ts` | 실제 `emit(*_REQUESTED)` → 리스너 → Discord DM 호출 (2) |
| DM 채널 | `discord.provider.spec.ts` | DM 채널 개설 + 버튼 메시지 (1) |
| 수신(서명) | `discord-signature.spec.ts` | Ed25519 서명 검증 (W1) |
| 수신(콜백) | `discord-interaction.service.spec.ts` | 버튼→본인검증→결재 액션→메시지 갱신 (W1) |

## 7. 실데모 실행 기록

| 일자 | 환경 | 신청자 | 결재자 | 결과 |
|---|---|---|---|---|
| 2026-06-21 | 프로덕션 | 홍길동(employee) | 최고관리자(admin) | ✅ 상신 → 결재자 DM → `[승인]` 클릭 → 문서 `APPROVED` **전 구간 성공(1차)** |

### 메시지 본문 — 신청 내용 표시(1차 데모 피드백 반영)

초기 DM은 제목만 보여 결재자가 무엇을 승인하는지 알기 어려웠다. 이를 보완해 **신청자 + 신청 내용 항목**을 버튼 위 embed에 표시한다(`buildContentFields`):

- 신청자(기안자명), 문서번호(있으면)
- 신청 payload의 사람이 읽을 항목 — 한국어 라벨 매핑(`시작일/종료일/일수/사유/내용` 등), **ID성 필드·중첩값 제외**, 최대 6개
- (2순위) 이 위에 `[🤖 AI 요약]`을 얹어 자연어 정리 — `ApprovalMessagePayload.summary`
