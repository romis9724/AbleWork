<!-- AbleWork PR 템플릿. GitLab MR 템플릿(.gitlab/merge_request_templates/Default.md)과 동일 내용. -->

## 요약

<!-- 무엇을, 왜. 한두 문장. -->

## 변경 유형

- [ ] feat / fix / refactor / docs / test / chore / perf / ci

## 변경 내용

<!-- 주요 변경점. 영향 받는 모듈/엔드포인트. -->

## 체크리스트

- [ ] `pnpm typecheck` 통과
- [ ] `pnpm lint` 통과
- [ ] `pnpm test` 통과
- [ ] `pnpm check:context-paths` 통과
- [ ] DB 스키마 변경 시 마이그레이션 포함
- [ ] 모든 DB 쿼리에 `companyId` 포함 (멀티테넌시)
- [ ] 관련 문서 갱신 (`docs/design/CHANGELOG.md` 등)

## 배포 영향

<!-- 마이그레이션/환경변수/롤백 주의사항. -->
