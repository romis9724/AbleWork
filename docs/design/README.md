# AbleWork ERP — 설계 문서 인덱스

> 중소규모 기업(50~300인)을 위한 통합 HR/전자결재 ERP 시스템

## 문서 목록

| 문서 | 설명 |
|---|---|
| [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) | 시스템 전체 설계 (아키텍처, 모듈, API, 연동 흐름) |
| [ERD.md](./ERD.md) | 데이터베이스 엔티티 관계 다이어그램 |
| [FEATURE_LIST.md](./FEATURE_LIST.md) | 전체 기능 목록 및 Phase별 우선순위 |
| [ENGINEERING_DESIGN.md](./ENGINEERING_DESIGN.md) | 엔지니어링 구현 설계 (기술 스택, 모노레포, 레이어 패턴, 배포) |
| [CHANGELOG.md](./CHANGELOG.md) | **변경 이력 SSOT** — 기능·설계·데이터·운영 변경 추적(신규 설치·롤백 기준) |
| [DATA_MIGRATION.md](./DATA_MIGRATION.md) | kakaowork+Shiftee → AbleWork 데이터 이전 절차·규칙 |
| [AWS_OPERATIONS.md](./AWS_OPERATIONS.md) | AWS 운영 런북 (배포·SSM 디버깅·CI 러너 복구·리소스 ID) |
| [../../CLAUDE.md](../../CLAUDE.md) | Claude Code 가이드 (NEVER 목록, 비즈니스 룰, 구현 순서, /goal 기준) |
| [../../README.md](../../README.md) | 프로젝트 소개 및 로컬 개발 환경 설정 |

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|---|---|---|
| v1.0 | 2026-06-11 | 초안 작성 |
| v1.1 | 2026-06-11 | 교차 검증 후 보완 — ERD 6개 테이블 추가, 누락 기능 반영, 우선순위 조정 |
| v1.2 | 2026-06-11 | 급여 정산 범위 외 처리 — 선택 안 된 모듈 제거, Phase 3을 Future Scope로 변경 |
| v2.0 | 2026-06-11 | 완전 재검증 — 7개 에이전트 병렬 검토 후 전면 보완. ERD 테이블 54개(+9개 신규), 기능 목록 대폭 확장, API 누락 엔드포인트 추가, 연동 흐름 3개 추가 |
| v2.1 | 2026-06-11 | 3차 재검증 — 회사설정 14개 파일 전수 검토. ERD 컬럼 15개 추가, company_settings 키 20개 추가, FEATURE_LIST 기능 12개 추가, 리포트/메시지 섹션 신설, 섹션 번호 재정비 |
| v2.2 | 2026-06-11 | 설계 최적화 — Enterprise 전용 기능 제거, 범위 외 항목 명시, FEATURE_LIST ID 체계 정규화, 중복 기능 통합, standardization_rules 옵션값 명확화 |
| v3.0 | 2026-06-12 | 엔지니어링 설계 추가 — ENGINEERING_DESIGN.md 신규 작성 (기술 스택 확정, 모노레포, NestJS 레이어 패턴, Prisma ORM, 인증/권한, 이벤트 버스, 테스트 전략, Docker 배포) |
| v3.1 | 2026-06-12 | 5라운드 점검 완료 — ENGINEERING_DESIGN.md v1.2.0 (누락 모듈 5개 추가, AppModule 전역 설정, PrismaModule, $transaction 전략, ThemeRegistry, jose 미들웨어, 이벤트 확장, Cron 목록), CLAUDE.md + README.md 신규 작성 |
| v4.0 | 2026-06-29 | 운영 반영 일괄 — 출근 장소 모달·출퇴근 장소↔조직 N:N·출퇴근기록 권한별 탭·me 네비 개편·HR 부서승인자 총괄관리자 포함·홈 개편·휴가 유형 2단계·kakaowork+Shiftee 데이터 마이그레이션. 상세는 **[CHANGELOG.md](./CHANGELOG.md)** SSOT. 마이그레이션 2건(Attendance.positionId, timeclock_area N:N) |

## 시스템 구성 요약

```
┌─────────────────────────────────────┐
│           AbleWork ERP              │
├──────────┬──────────┬───────────────┤
│ 인사/조직  │  근태관리  │   전자결재     │
│ HR-02~03 │ HR-04~08 │  AP-01~06     │
├──────────┴──────────┴───────────────┤
│     Discord 알림 연동 (HR-09)        │
└─────────────────────────────────────┘
```

> 급여 정산(PAY)은 요구사항에서 제외됨 — `docs/design/SYSTEM_DESIGN.md` 1.4 참조

## 핵심 설계 결정

### 1. HR 요청 ↔ 전자결재 (이원화 + 자동 연동)
휴가 신청, 출퇴근 정정, 근무일정 변경 등 HR 요청은 전자결재 기안으로 자동 연동(Document 생성·결재선 구성)된다.
> **부서 승인자 체계는 이원화(2026-06-29)**: HR 요청(휴가/요청 메뉴)의 부서 승인자는 요청자 소속 부서의 **조직관리자(ORG_ADMIN) 우선, 없으면 총괄관리자(GENERAL_ADMIN)**(없으면 상위 부서)다. 전자결재의 부서 결재권자(`organization.approverId`)와는 **별개 체계**. 상세 [CHANGELOG.md](./CHANGELOG.md) §6, SYSTEM_DESIGN 참조.

### 2. 단일 권한 체계
HR 접근 레벨(최고관리자/총괄/조직/직원)과 전자결재 관리자 역할(서비스관리자/양식담당자/문서담당자)을 단일 사용자 계정으로 통합 관리한다.

### 3. Discord 알림 이벤트 버스
알림은 도메인 이벤트를 이벤트 버스로 발행하고 알림 서비스가 구독하는 방식으로 설계한다. 알림 실패 시 최대 3회 재시도, 모든 발송 이력을 `notification_logs`에 기록한다.

## Phase 별 구현 순서

```
Phase 1 (W1~W10)  → 인사/조직 + 근태 + Discord 알림
Phase 2 (W11~W17) → 전자결재 (HR 요청 연동 포함)
```

