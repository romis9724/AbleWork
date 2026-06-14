# 전자결재 UI/UX 정합 갭 (카카오워크 PDF 대조)

> `refs/approval/pdf/` 7개 관리자 + 사용자 화면을 우리 FE와 1:1 대조한 검수(2026-06-14, 9-agent 워크플로) 결과.
> **원칙: UI/UX를 PDF 기준으로 최우선 정합** ([[feedback-approval-ui-pdf-first]]).

## 화면별 Verdict
| 화면 | Verdict | 비고 |
|---|---|---|
| 결재 현황 | **match** | LOW 정렬만(조회 버튼 중앙, 기본 행수 10) — 추가 구현 불필요 |
| 공통 관리 | partial | 전자결재 전용 페이지 부재(HR 설정 탭에 묻힘), 상위결재선변경/사용자표시 누락 |
| 기안 양식 관리 | partial | **좌측 양식함 트리 부재**, 3-step 위저드 대신 모달, **WYSIWYG 본문 에디터 부재** |
| 문서 담당 관리 | partial | 좌측 조직 트리 접기/펼치기 부재(평면 들여쓰기), 부서원 행+토글·검색 부재 |
| 공용 결재선 관리 | partial | **등록 팝업 조직도 트리 부재**(평탄 Autocomplete), 수신/참조/공람 카운트 컬럼·DnD 부재 |
| 서비스 사용 설정 | partial | 독립 메뉴 아님(설정 탭), 라디오 대신 스위치 |
| 기안 작성 | **거의 match** | ✅ 풀페이지 승격(메타표+섹션+WYSIWYG)·양식함 카드그리드 진입·본인결재금지·재기안 진입. 잔여: 결재선 조직트리 [결재선 설정] 팝업(C3), 공람/참조 사후추가(task#30) |
| 기안 결재 | partial | ✅ 상세 PAGE 승격(`DocumentDetailView`, 하단 결재 푸터). 잔여: 좌측 계층 네비 트리(B), 통합 [결재하기] 라디오 LAYER_POPUP(C1/C2) |

## 1. 최우선 — 트리 구조 (사용자 강조)
- **조직도 트리(접기/펼치기/체크박스)**: 공용 결재선 등록 팝업·기안 작성 결재선 설정·문서 담당 관리 좌측. 공유 위젯으로 정합.
- **양식함 트리(2-pane 마스터-디테일)**: 기안 양식 관리 좌측.
- **좌측 계층 네비 트리**: 기안 결재 박스(결재함>결재전/진행중/완료/반려, 수신함>수신전/완료, 부서문서함>부서협조/부서수신).

## 2. 최우선 — 웹에디터 (사용자 강조)
- **WYSIWYG 본문 에디터**(서식 툴바: 스타일/B·I·U·S/정렬/목록/링크/표삽입): 기안 작성 본문 + 양식 richtext 필드. 현재 평문 textarea.
- **저장/렌더 시 sanitize(DOMPurify) 필수** — content HTML 저장 시 XSS 방지.
- **구조화 표 강화**: table 필드 행 추가형 + 셀 타입(텍스트/숫자/날짜/선택), 상세 표 렌더.

## 3. 그 외 HIGH
- 공통 관리: 전자결재 전용 페이지 신설 + `enable_upper_line_edit`·`userDisplayFormat` 설정.
- 서비스 사용 설정: 독립 라우트/메뉴 + 라디오 컨트롤.
- 양식 관리: 3-step 위저드(미리보기/이전·다음) + 목록 컬럼(보존연한/공개범위/담당자).
- 문서 담당: 부서원 행+토글 + 검색 필터.
- 공용 결재선: 수신/참조/공람 카운트 컬럼.
- 기안 작성: 풀페이지 + 메타표 + 공람/참조/수신 지정.
- 기안 결재: 통합 결재 모달(라디오+의견 200자 필수) + 조회 필터.

## PR 묶음 (우선순위)
1. ✅ **PR-A 조직 트리 위젯** (PR#40) — 공유 `OrgTree`(접기/펼치기) → 문서 담당 관리 좌측 적용.
2. ✅ **PR-B 웹에디터** — `RichTextEditor`(의존성 없는 contentEditable+execCommand 툴바: 스타일/B·I·U·S/정렬/목록/링크/표) + `RichTextView`(DOMPurify sanitize). 기안 본문(DocumentComposeDialog)·양식 richtext 필드(DynamicFormFields) RTE, 상세(DocumentDetailDialog) sanitize 렌더 + table 필드 표 렌더. TipTap 대신 DOMPurify만 도입(React19 peer 회피). 레거시 평문은 looksLikeHtml로 pre-wrap 폴백.
3. **PR-C 2-패널 결재선 빌더** — ApprovalLineBuilder 트리화(공용 결재선·기안 작성 공유) + DnD.
4. **PR-D 전자결재 설정 페이지** — 공통 관리/서비스 사용 설정 독립화 + BE 설정 키.
5. **PR-E 기안 결재 좌측 네비 트리 + 통합 결재 모달 + 조회 필터.**
6. **PR-F 양식 관리 디테일**(위저드·컬럼·분류 다이얼로그·프리셋) / **PR-G 문서담당·공용결재선 목록/필터.**
7. **PR-H 기안 작성 풀페이지/메타/검증** / **PR-I LOW 카피·라벨 정합.**

## 컨테이너 정본 스펙 — PAGE vs LAYER_POPUP (2026-06-15, 9-agent 워크플로)

> 카카오워크 IA는 **2층 구조**. 신규/수정 PR은 이 분류를 따른다.
> PAGE=좌측 네비·헤더 유지 풀페이지(URL 독립) · LAYER_POPUP=dim 배경 위 카드형 모달 · INLINE_SECTION=페이지/팝업 본문 내 영역 · TAB=페이지 내 인페이지 탭.

### ⚠ 컨테이너 불일치 — 우리가 모달/탭인데 PDF는 PAGE (최우선)
| # | 화면 | PDF | 우리 | 조치 |
|---|---|---|---|---|
| A1 | 기안양식 등록 위저드 | PAGE(3-step 탭+이전/다음/저장 푸터) | ✅ 해소 → `DocumentFormWizard` + `/admin/approval/forms/new`. 3-step 탭(기본정보/입력필드/권한·옵션) + 하단 [이전][다음][저장] 푸터. 브라우저 E2E 검증 |
| A2 | 기안양식 수정 위저드 | PAGE | ✅ 해소 → `/admin/approval/forms/[id]/edit`(동일 위저드, 접근규칙 패널 포함). 목록 페이지는 행 [수정]→라우팅, NumberRuleDialog·분류관리 유지 |
| A3 | 기안 양식 선택(양식함) | PAGE(카드 그리드) | ✅ 해소 → 신규 작성 진입 시 양식함 카드 그리드(분류 필터) 표시 → 선택 시 작성 폼 전환 |
| A4 | 기안 작성/상신 | PAGE(풀페이지) | ✅ 해소 → `DocumentComposeForm`(풀페이지: 메타정보표+결재선 섹션+기안내용 WYSIWYG+sticky 푸터) + 라우트 `/me/documents/new`·`/[id]/edit`·`/admin/approval/inbox/new`·`/[id]/edit`. 본인 결재자 지정 금지 가드, 재기안(`?from=`)·이어쓰기·재상신 일원화. `DocumentComposeDialog` 제거 |
| A5 | 기안 상세 | PAGE(하단 목록/결재 푸터) | ✅ 해소 → `DocumentDetailView` + 라우트 `/me/documents/[id]`·`/admin/approval/inbox/[id]`·`/admin/approval/documents/[id]`·`/admin/approval/status/[id]`. 결재 액션 하단 sticky 푸터(승인/반려/전결/전단계반려/회수/결재취소), drafter 셸은 재상신·재기안 노출. 4개 호출부 네비게이션 전환, `DocumentDetailDialog` 제거 |
| B4 | 서비스 사용 설정 | PAGE(독립 메뉴) | ✅ 해소 → `/admin/approval/service-setting` 페이지(라디오) + 공통 관리 `/admin/approval/common` 페이지 분리, 회사설정 전자결재 탭 제거, 사이드바 PDF 순서 정합 |
| B1~B3 | 문서함(기안/결재/공람/참조/수신/대장) | PAGE(좌측 네비 트리 전환) | MUI Tabs 평면 | 좌측 네비 라우트 분리(또는 me 모바일 탭 유지 결정) |

### LAYER_POPUP으로 분리·신설 (PDF는 팝업인데 우리는 인라인/미구현)
- ✅ C1 결재하기 통합 모달 + C2 반송 모달(PR#46) — `ApprovalActionDialog`: 결재 상태 라디오(승인/반려/전결/전단계반려, step·양식 조건별 노출) + 결재 의견(200자 카운터, 반려/전단계반려/전결/반송 필수) + [취소][결재]. `DocumentDetailView` 푸터의 개별 결정 버튼을 단일 [결재] 버튼→팝업으로 통합, 반송은 별도 [반송]→의견 필수 팝업. 확인/수신은 직접 버튼 유지(비결정 ack), 회수/결재취소/재상신/재기안은 푸터 직접 버튼.
- ✅ C3 결재선 설정(조직 트리 선택) 팝업(PR#47) — `ApprovalLineDialog`: 좌측 조직 트리(부서 체크박스+직원 리프)+검색, 중앙 [결재][협조][수신][참조][공람] 추가 버튼(직원=개인 역할, 부서=협조→DEPT_COLLABORATOR/수신→DEPT_RECEIVER), 우측 결재선명 select+기안 고정행+단계 리스트(순서/삭제), [취소][적용]. DocumentComposeForm은 인라인 빌더→요약 카드+[결재선 설정] 버튼. 브라우저 E2E 검증 완료. · C4 공람 설정 · C5 상위 결재선 변경 · C6 공람자/C7 참조자 지정(상신 전) 잔여.
- ✅ C8 재기안(완료 문서 복제) — PR#44 PAGE 흐름(`?from=`).

### 일치(컨테이너 OK, 콘텐츠만 보강)
- 양식 목록·공용결재선 목록·문서담당·공통관리·결재현황 = PAGE ✓. 양식 분류 추가·공용결재선 등록/수정·삭제확인 = LAYER_POPUP ✓.

### 컨테이너 원칙 (향후 적용)
- **PAGE**: 모든 목록 / 모든 작성·편집·상세 / 양식 등록·수정 위저드(내부 TAB) / 양식 선택.
- **LAYER_POPUP**: 결재선·공람·참조·협조 대상 선택(조직 트리), 결재 처리(결재하기/반송), 기초 분류 CRUD, 공용결재선 검색, 대리결재자, 파괴적 액션 확인(ConfirmDialog).
- **INLINE_SECTION**: 검색 필터 바, 데이터 테이블+페이지네이션, 설정 토글 행, 첨부 영역.
- 제외: NumberRuleDialog(PDF 미수록 자체 기능), 상태 전이 다이어그램(설명 삽화).
- 권장 처리 순서: ✅ **A3/A4(양식함 진입·작성 PAGE)** → ✅ **A5(상세 PAGE)** → ✅ **C1/C2(결재·반송 팝업)** → ✅ **C3(결재선 설정 팝업)** → ✅ **A1/A2(양식 등록·수정 페이지)** → C4~C7(공람/참조 사후지정·상위결재선 변경, BE 필요) → B(문서함 IA).

## 보류 (NEVER/모델 사유)
- 공용 결재선 '결재권자' 동적 탭(조직 leader 모델 신규) — 단기 보류, DEPT_* 로 부분 대응.
- 카카오 모바일 챗봇 → Discord 의도적 대체.
- 공람/협조 사후추가 → 기존 task #30으로 위임.
- NEVER(급여정산/전자계약)와 직접 충돌 요소는 없음(지출결의·경조금 등 금액성 양식은 일반 결재 양식으로 구현 가능).
