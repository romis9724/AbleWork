# Full Screen Check — 아카이브 스냅샷 (2026-06-12)

이 디렉터리는 **2026-06-12 시점의 일회성 화면 점검 스크린샷**(`admin_NNN_*.png`·`employee_NNN_*.png`)과 리포트(`RESULTS_TABLE.md`·`FULLCHECK_*.{txt,json,csv}`)를 보관한다.

> **주의(Note):** 이 스냅샷은 **오래됐다**. 당시 "Missing (404)"로 기록된 화면(조직 관리·출퇴근 장소·근무 유형/템플릿/패턴·권한 관리·실시간 근태 등) 상당수는 **이후 구현 완료**됐다. 화면 구현 현황의 SSOT는 이 리포트가 아니라 [`docs/design/FEATURE_LIST.md`](../../../../../docs/design/FEATURE_LIST.md)다. 최신 검증은 `apps/web/e2e/`의 Playwright 스펙(`rbac-crud/`·`journey_role_*.spec.ts`)을 실행해 확인한다.

파일 명명 규칙만 유효: `admin_NNN_<feature>.png` / `employee_NNN_<feature>.png` (NNN = 순번).
