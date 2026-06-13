# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: crud_retest.spec.ts >> T9. 현재 근무 현황
- Location: e2e/crud_retest.spec.ts:623:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('main, [role="main"]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('main, [role="main"]')

```

```yaml
- button "Open Next.js Dev Tools":
  - img
- button "Open issues overlay": 1 Issue
- button "Collapse issues badge":
  - img
- navigation:
  - button "previous" [disabled]:
    - img "previous"
  - text: 1/1
  - button "next" [disabled]:
    - img "next"
- img
- link "Next.js 15.3.2 (outdated) Webpack":
  - /url: https://nextjs.org/docs/messages/version-staleness
  - img
  - text: Next.js 15.3.2 (outdated) Webpack
- img
- dialog "Runtime Error":
  - text: Runtime Error
  - button "Copy Stack Trace":
    - img
  - button "No related documentation found" [disabled]:
    - img
  - link "Learn more about enabling Node.js inspector for server code with Chrome DevTools":
    - /url: https://nextjs.org/docs/app/building-your-application/configuring/debugging#server-side-code
    - img
  - paragraph: "Error: Objects are not valid as a React child (found: object with keys {name}). If you meant to render a collection of children, use an array instead."
  - paragraph:
    - img
    - text: src/app/admin/attendances/now/page.tsx (195:21) @ eval
    - button "Open in editor":
      - img
  - text: "193 | </Box> 194 | {emp.organization && ( > 195 | <Typography variant=\"body2\" color=\"text.secondary\" mb={1}> | ^ 196 | {emp.organization} 197 | </Typography> 198 | )}"
  - paragraph: Call Stack 19
  - button "Show 16 ignore-listed frame(s)":
    - text: Show 16 ignore-listed frame(s)
    - img
  - text: eval
  - button:
    - img
  - text: src/app/admin/attendances/now/page.tsx (195:21) Array.map <anonymous> (0:0) NowAtWorkPage
  - button:
    - img
  - text: src/app/admin/attendances/now/page.tsx (166:21)
- contentinfo:
  - region "Error feedback":
    - paragraph:
      - link "Was this helpful?":
        - /url: https://nextjs.org/telemetry#error-feedback
    - button "Mark as helpful"
    - button "Mark as not helpful"
- 'heading "Application error: a client-side exception has occurred while loading localhost (see the browser console for more information)." [level=2]'
```

# Test source

```ts
  528 | 
  529 |   const responsePromise = page.waitForResponse(
  530 |     (resp) =>
  531 |       (resp.url().includes('/template') || resp.url().includes('/shift')) &&
  532 |       resp.request().method() === 'POST',
  533 |     { timeout: 15000 }
  534 |   );
  535 | 
  536 |   await dialog.locator('button').filter({ hasText: /추가|저장/ }).last().click();
  537 | 
  538 |   try {
  539 |     const resp = await responsePromise;
  540 |     console.log(`[T6] POST templates → HTTP ${resp.status()}`);
  541 |     await ss(page, 'T6-04-after-save');
  542 |     if (resp.status() !== 200 && resp.status() !== 201) {
  543 |       const body = await resp.json().catch(() => ({}));
  544 |       throw new Error(`[T6 FAIL] 근무일정 템플릿 추가 실패: HTTP ${resp.status()}\n${JSON.stringify(body)}`);
  545 |     }
  546 |   } catch (e: unknown) {
  547 |     if (e instanceof Error && e.message.startsWith('[T6')) throw e;
  548 |     await page.waitForLoadState('networkidle');
  549 |     await ss(page, 'T6-04-after-save-no-intercept');
  550 |   }
  551 | 
  552 |   console.log('[T6] PASS: 근무일정 템플릿 추가 완료');
  553 | });
  554 | 
  555 | // ─────────────────────────────────────────────────────────────────
  556 | // T7. 근무일정 추가
  557 | // ─────────────────────────────────────────────────────────────────
  558 | test('T7. 근무일정 - 추가 다이얼로그 확인', async ({ page }) => {
  559 |   await login(page);
  560 |   await page.goto('/admin/shifts');
  561 |   await page.waitForLoadState('networkidle');
  562 |   await ss(page, 'T7-01-shifts');
  563 | 
  564 |   const addBtn = page.locator('button').filter({ hasText: /근무일정 추가/ }).first();
  565 |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  566 |   await addBtn.click();
  567 | 
  568 |   const dialog = page.locator('[role="dialog"]');
  569 |   await expect(dialog).toBeVisible({ timeout: 5000 });
  570 |   await ss(page, 'T7-02-add-dialog');
  571 | 
  572 |   // 직원 Autocomplete 클릭
  573 |   const empInput = dialog.locator('input[role="combobox"]').first();
  574 |   if (await empInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  575 |     await empInput.click();
  576 |     await page.waitForTimeout(500);
  577 |     const firstOption = page.locator('[role="option"]').first();
  578 |     if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
  579 |       await firstOption.click();
  580 |       await ss(page, 'T7-03-employee-selected');
  581 |     }
  582 |   }
  583 | 
  584 |   await ss(page, 'T7-04-dialog-state');
  585 | 
  586 |   // 취소
  587 |   const cancelBtn = dialog.locator('button').filter({ hasText: /취소/ });
  588 |   const cancelVisible = await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false);
  589 |   if (cancelVisible) {
  590 |     await cancelBtn.click();
  591 |   } else {
  592 |     await page.keyboard.press('Escape');
  593 |   }
  594 | 
  595 |   await ss(page, 'T7-05-dialog-closed');
  596 |   console.log('[T7] PASS: 근무일정 추가 다이얼로그 확인');
  597 | });
  598 | 
  599 | // ─────────────────────────────────────────────────────────────────
  600 | // T8. 출퇴근 기록 필터 조회
  601 | // ─────────────────────────────────────────────────────────────────
  602 | test('T8. 출퇴근 기록 - 필터 조회', async ({ page }) => {
  603 |   await login(page);
  604 |   await page.goto('/admin/attendances');
  605 |   await page.waitForLoadState('networkidle');
  606 |   await ss(page, 'T8-01-attendances');
  607 | 
  608 |   const searchBtn = page.locator('button').filter({ hasText: /조회|검색/ }).first();
  609 |   if (await searchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  610 |     await searchBtn.click();
  611 |     await page.waitForLoadState('networkidle');
  612 |     await ss(page, 'T8-02-after-search');
  613 |   }
  614 | 
  615 |   await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
  616 |   await ss(page, 'T8-03-final');
  617 |   console.log('[T8] PASS: 출퇴근 기록 조회 확인');
  618 | });
  619 | 
  620 | // ─────────────────────────────────────────────────────────────────
  621 | // T9. 현재 근무 현황
  622 | // ─────────────────────────────────────────────────────────────────
  623 | test('T9. 현재 근무 현황', async ({ page }) => {
  624 |   await login(page);
  625 |   await page.goto('/admin/attendances/now');
  626 |   await page.waitForLoadState('networkidle');
  627 |   await ss(page, 'T9-01-attendance-now');
> 628 |   await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
      |                                                     ^ Error: expect(locator).toBeVisible() failed
  629 |   console.log('[T9] PASS: 현재 근무 현황 페이지 로드');
  630 | });
  631 | 
  632 | // ─────────────────────────────────────────────────────────────────
  633 | // T10. 휴가 유형 - 그룹/유형 추가
  634 | // ─────────────────────────────────────────────────────────────────
  635 | test('T10. 휴가 유형 - 그룹/유형 추가', async ({ page }) => {
  636 |   await login(page);
  637 |   await page.goto('/admin/leave/types');
  638 |   await page.waitForLoadState('networkidle');
  639 |   await ss(page, 'T10-01-leave-types');
  640 | 
  641 |   // 그룹 추가
  642 |   const groupAddBtn = page.locator('button').filter({ hasText: /그룹 추가/ }).first();
  643 |   if (await groupAddBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  644 |     await groupAddBtn.click();
  645 |     const dialog = page.locator('[role="dialog"]');
  646 |     await expect(dialog).toBeVisible({ timeout: 5000 });
  647 |     const nameInput = dialog.locator('input').first();
  648 |     await nameInput.fill('테스트그룹');
  649 |     await ss(page, 'T10-02-group-dialog-filled');
  650 |     await dialog.locator('button').filter({ hasText: /추가|저장/ }).last().click();
  651 |     await page.waitForLoadState('networkidle');
  652 |     await ss(page, 'T10-03-after-group-add');
  653 |   }
  654 | 
  655 |   // 유형 추가
  656 |   const typeAddBtn = page.locator('button').filter({ hasText: /유형 추가/ }).first();
  657 |   if (await typeAddBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  658 |     await typeAddBtn.click();
  659 |     const dialog = page.locator('[role="dialog"]');
  660 |     await expect(dialog).toBeVisible({ timeout: 5000 });
  661 |     const nameInput = dialog.locator('input').first();
  662 |     await nameInput.fill('테스트휴가');
  663 |     await ss(page, 'T10-04-type-dialog-filled');
  664 |     await dialog.locator('button').filter({ hasText: /추가|저장/ }).last().click();
  665 |     await page.waitForLoadState('networkidle');
  666 |     await ss(page, 'T10-05-after-type-add');
  667 |   }
  668 | 
  669 |   await ss(page, 'T10-06-final');
  670 |   console.log('[T10] PASS: 휴가 유형 그룹/유형 추가 확인');
  671 | });
  672 | 
  673 | // ─────────────────────────────────────────────────────────────────
  674 | // T11. 발생 규칙
  675 | // ─────────────────────────────────────────────────────────────────
  676 | test('T11. 발생 규칙 - 페이지 로드', async ({ page }) => {
  677 |   await login(page);
  678 |   await page.goto('/admin/leave/accrual-rules');
  679 |   await page.waitForLoadState('networkidle');
  680 |   await ss(page, 'T11-01-accrual-rules');
  681 |   await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
  682 |   console.log('[T11] PASS: 발생 규칙 페이지 로드');
  683 | });
  684 | 
  685 | // ─────────────────────────────────────────────────────────────────
  686 | // T12. 요청 관리
  687 | // ─────────────────────────────────────────────────────────────────
  688 | test('T12. 요청 관리 - 탭 확인', async ({ page }) => {
  689 |   await login(page);
  690 |   await page.goto('/admin/requests');
  691 |   await page.waitForLoadState('networkidle');
  692 |   await ss(page, 'T12-01-requests');
  693 |   await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
  694 |   console.log('[T12] PASS: 요청 관리 페이지 로드');
  695 | });
  696 | 
  697 | // ─────────────────────────────────────────────────────────────────
  698 | // T13. 승인 규칙 추가
  699 | // Note: "추가" 버튼은 name + requestType 모두 채워야 활성화됨
  700 | // ─────────────────────────────────────────────────────────────────
  701 | test('T13. 승인 규칙 - 추가', async ({ page }) => {
  702 |   await login(page);
  703 |   await page.goto('/admin/requests/rules');
  704 |   await page.waitForLoadState('networkidle');
  705 |   await ss(page, 'T13-01-approval-rules');
  706 | 
  707 |   // Header의 규칙 추가 버튼 (PageHeader actions)
  708 |   const addBtn = page.locator('button').filter({ hasText: /규칙 추가/ }).first();
  709 |   const addVisible = await addBtn.isVisible({ timeout: 5000 }).catch(() => false);
  710 | 
  711 |   if (addVisible) {
  712 |     await addBtn.click();
  713 |     const dialog = page.locator('[role="dialog"]');
  714 |     await expect(dialog).toBeVisible({ timeout: 5000 });
  715 |     await ss(page, 'T13-02-add-dialog');
  716 | 
  717 |     // 규칙명 입력
  718 |     const nameInput = dialog.locator('input').first();
  719 |     if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  720 |       await nameInput.fill('테스트승인규칙');
  721 | 
  722 |       // 요청 유형 선택 (MUI Select - div[role="combobox"] 또는 div.MuiSelect-select)
  723 |       // "추가" 버튼은 requestType이 채워져야 활성화됨
  724 |       const requestTypeSelect = dialog.locator('div[role="combobox"], .MuiSelect-select').nth(0);
  725 |       if (await requestTypeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
  726 |         await requestTypeSelect.click();
  727 |         await page.waitForTimeout(300);
  728 |         const leaveOpt = page.locator('[role="option"]').filter({ hasText: '휴가 신청' }).first();
```