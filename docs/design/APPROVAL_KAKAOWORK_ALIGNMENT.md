# 전자결재 카카오워크 정합화 작업 노트

> 목적: `refs/approval/pdf/` 카카오워크 전자결재 가이드(관리자/사용자)에 맞춰 UI/UX·프로세스를 정합화하고 설계서를 갱신한다.
> 원칙: **왠만하면 카카오워크와 동일하게.** 우리 데이터 모델/NEVER 목록과 충돌하는 부분만 인터뷰로 확정.

## 확정된 결정 (인터뷰)

### 결재 현황 (`/admin/approval/status`) — 2026-06-14
- **조회 범위**: 카카오워크와 동일 — **상신 / 진행중 / 반려만**. 승인완료·임시저장·회수는 제외(문서대장 영역).
- **삭제 방식**: 최대한 카카오워크와 동일 — **체크박스 다중선택 + [선택 삭제]**. 삭제 가능 대상은 상신/진행중/반려로 제한(HR요청 연동 문서 차단).
- **상신/진행중 구분**: 구분 표시 — 상신(결재 미처리 PENDING) / 진행중(일부 승인된 PENDING) 파생.
- 필터바: 상신일(기간) · 기안양식(드롭다운) · 결재상태(전체/상신/진행중/반려) · 검색어(제목) + [조회] 버튼. 총 N건 · 기준시각/새로고침 · 페이지 크기.

### 전체 메뉴 정합 인터뷰 — 2026-06-14 (방침: 왠만하면 카카오워크 동일)
- **파일 첨부/스토리지**: ✅ MinIO(S3호환) 도입 + `document_attachments` 모델 신설 → 기안 작성 드래그앤드롭 첨부.
- **전자결재 백업**: ✅ 전체 — 신청/내역 메뉴 + 양식별/전체 선택 + BullMQ 비동기 zip + 7일 만료 다운로드 + 완료 메일 + 보존연한(retentionYears).
- **양식 관리**: ✅ 풀세트 — 양식함(FormCategory 독립 엔티티) + 공개범위(공개/부서공개/비공개) + 보존연한/약어/메타 + 확장 템플릿(table·richtext 필드 + 빌트인 프리셋) + 3탭 위저드.
- **문서 담당 관리**: ✅ 다중 + 전용 메뉴 — 부서당 N명(`organization_doc_managers` 조인) + 전용 페이지(조직트리+멤버 토글+필터) + 부서 step 후보집합 처리. 조직 다이얼로그 단일 docManagerId 필드 제거.

### 기본값(카카오워크 동일)으로 별도 질문 없이 진행할 항목
- 서비스 사용 설정: 회사 단위 전자결재 on/off 토글 + OFF 시 전자결재 API 게이트.
- 기안 작성: 기안자 본인 결재자 지정 금지 가드, 양식함 카드그리드 진입, 리치텍스트 본문, 완료문서 '재기안'(복제→신규 DRAFT), 첨부.
- 기안 결재: 공람/협조 사후 추가([공람 설정]/[상위 결재선 변경]), 부서협조 접수→내부결재 2단계, 라벨 정합.
- 공용 결재선: 조회 필터·작성자(createdById FK)·작성일 컬럼·중복체크·최종결재자=협조자 금지 검증·소속부서 팀장 동적 결재자 토큰.
- 공통 관리 통합 페이지: company_settings `approval` 섹션 + 문서채번 약어(DocumentForm.abbreviation)·표준 프리셋, 정책토글(전단계반려/상위결재선변경/ZIP), 알림 2계층(Discord·email 마스터 + 이벤트별), 사용자 표시형식(Employee.nickname).
- 전자결재 홈 대시보드: 나의 결재현황 카운트 타일 + 결재 미리보기 3탭(상신/결재할/최근 결재의견) + 최근 사용 양식 + summary 엔드포인트.

### 실행 로드맵 (단계별 PR, 의존성 순)
1. ✅ **인프라**: MinIO `StorageModule`(`StorageService`, 버킷 자동생성·미가용 graceful) + `document_attachments` 모델/마이그레이션 + 첨부 API(업로드/목록/다운로드/삭제, 20MB·10개·zip 게이트) + FE `AttachmentPanel`(드래그앤드롭, 상세·기안 작성 다이얼로그 연동). 단위 14건 추가(663 pass). ERD 53테이블·SYSTEM_DESIGN §6.4 동기화.
2. ✅ **결재 현황** 재구성 — `box=status`(상신/진행중/반려만, `phase`·`currentApprover` 파생), 필터바(상신일·양식·결재상태·제목), 체크박스 다중선택 + `POST /documents/bulk-force-delete`(PENDING/REJECTED 한정·HR연동 제외·skipped 반환). 단위 테스트 9건 추가(649 pass). 설계서 §5.3.5/§6.4 동기화 완료.  ← 사용자 최초 요청
3. ✅ **서비스 사용 설정** — 회사 설정 `approval.enable_service`(기본 ON) + `ApprovalEnabledGuard`가 전자결재 5개 컨트롤러 게이트(`APPROVAL_SERVICE_DISABLED` 403, 재활성화 경로/HR요청 결재는 비게이트). FE 회사 설정 > 전자결재 탭 토글. 단위 3건(666 pass). ERD `approval.enable_service`·SYSTEM_DESIGN §6.4 동기화.
4. ✅ **양식 풀세트** — 25a(BE: form_categories·공개범위·메타·enforcement, PR#35) + 25b(FE: 3탭 위저드·양식함 분류 관리 다이얼로그·확장 필드타입 richtext/table 빌더+렌더러). 단위 673 pass.
5. ✅ **문서담당관리** — `organization_doc_managers`(다중, sortOrder) + `/organizations/:id/doc-managers` 관리 API + 전용 페이지(전자결재>문서담당 관리, 조직트리+Autocomplete) + 조직 다이얼로그 단일 필드 제거. resolveSteps=대표 담당자 우선, resolveActor=부서 담당자 누구나, dept-docs box=담당부서 포함. 마이그레이션(backfill docManagerId→조인). 단위 5건(678 pass).
6. **공용 결재선 관리** 정합(필터·작성자·중복체크·검증·동적결재자).
7. **공통 관리** 통합 페이지(채번 약어·정책토글·알림 2계층·표시형식).
8. **기안 작성** 정합(첨부 UI·본인결재금지·재기안·양식함 진입·리치텍스트).
9. **기안 결재** 정합(공람/협조 사후추가·부서협조 2단계·라벨).
10. **전자결재 홈 대시보드**.
11. **전자결재 백업**(DocumentBackup·retention·신청/내역·BullMQ zip·7일만료·메일).

> 각 단계 완료 시 설계서(SYSTEM_DESIGN/FEATURE_LIST/ERD) 동기화. 마이그레이션은 `migrate deploy`로 적용(가드 비차단).
