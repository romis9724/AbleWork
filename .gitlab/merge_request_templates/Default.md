<!-- AbleWork MR 템플릿. 해당 없는 항목은 지운다. -->

## 요약

<!-- 무엇을, 왜. 한두 문장. -->

## 변경 유형

- [ ] feat (기능) / fix (버그) / refactor / docs / test / chore / perf / ci

## 변경 내용

<!-- 주요 변경점 목록. 영향 받는 모듈/엔드포인트. -->

## 체크리스트

- [ ] `pnpm typecheck` 통과
- [ ] `pnpm lint` 통과
- [ ] `pnpm test` 통과 (Service 커버리지 유지)
- [ ] `pnpm check:context-paths` 통과 (문서 경로 참조 유효)
- [ ] DB 스키마 변경 시 마이그레이션 파일 포함 (`prisma migrate dev`)
- [ ] 모든 DB 쿼리에 `companyId` 포함 (멀티테넌시)
- [ ] 관련 문서 갱신 — `docs/design/CHANGELOG.md`(SSOT), 필요 시 모듈 `CLAUDE.md`·`docs/adr/`

## 배포 영향

<!-- main 병합 시 GitLab CI 자동 배포. 마이그레이션/환경변수/롤백 주의사항이 있으면 기술. -->

## 관련

<!-- 이슈/문서 링크. -->

/assign me
