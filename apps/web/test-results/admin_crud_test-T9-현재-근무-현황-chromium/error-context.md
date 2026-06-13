# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin_crud_test.spec.ts >> T9. 현재 근무 현황
- Location: e2e/admin_crud_test.spec.ts:483:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('main, [role="main"], .main-content')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('main, [role="main"], .main-content')

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
  395 |   }
  396 | 
  397 |   await screenshot(page, 'T6-03-filled');
  398 | 
  399 |   const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /추가|저장|Save/ }).last();
  400 |   await saveBtn.click();
  401 |   await page.waitForLoadState('networkidle');
  402 |   await screenshot(page, 'T6-04-after-save');
  403 | });
  404 | 
  405 | // ───────────────────────────────────────────────────────────────
  406 | // T7. 근무일정
  407 | // ───────────────────────────────────────────────────────────────
  408 | test('T7. 근무일정 - 추가', async ({ page }) => {
  409 |   await login(page);
  410 |   await page.goto('/admin/shifts');
  411 |   await page.waitForLoadState('networkidle');
  412 |   await screenshot(page, 'T7-01-shifts');
  413 | 
  414 |   const addBtn = page.locator('button').filter({ hasText: /근무일정 추가|추가|Add/ }).first();
  415 |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  416 |   await addBtn.click();
  417 |   await page.waitForLoadState('networkidle');
  418 |   await screenshot(page, 'T7-02-add-dialog');
  419 | 
  420 |   // 폼 확인
  421 |   const shiftDialog = page.locator('[role="dialog"]');
  422 |   await expect(shiftDialog).toBeVisible({ timeout: 5000 });
  423 |   await screenshot(page, 'T7-03-dialog-open');
  424 | 
  425 |   // 직원 Autocomplete 입력 - dialog 안에서 직원 필드 클릭
  426 |   // Autocomplete input은 role="combobox"
  427 |   const empInput = shiftDialog.locator('input[role="combobox"]').first();
  428 |   if (await empInput.isVisible({ timeout: 3000 })) {
  429 |     await empInput.click();
  430 |     await page.waitForTimeout(300);
  431 |     // 옵션 목록 나타나면 첫 번째 선택
  432 |     const firstOption = page.locator('[role="option"]').first();
  433 |     if (await firstOption.isVisible({ timeout: 3000 })) {
  434 |       await firstOption.click();
  435 |       await screenshot(page, 'T7-04-employee-selected');
  436 |     }
  437 |   }
  438 | 
  439 |   await screenshot(page, 'T7-05-after-interaction');
  440 | 
  441 |   // 닫기
  442 |   await shiftDialog.locator('button').filter({ hasText: '취소' }).click();
  443 | });
  444 | 
  445 | // ───────────────────────────────────────────────────────────────
  446 | // T8. 출퇴근 기록
  447 | // ───────────────────────────────────────────────────────────────
  448 | test('T8. 출퇴근 기록 - 필터 및 수정', async ({ page }) => {
  449 |   await login(page);
  450 |   await page.goto('/admin/attendances');
  451 |   await page.waitForLoadState('networkidle');
  452 |   await screenshot(page, 'T8-01-attendances');
  453 | 
  454 |   // 조회 버튼
  455 |   const searchBtn = page.locator('button').filter({ hasText: /조회|검색|Search|Query/ }).first();
  456 |   if (await searchBtn.isVisible({ timeout: 5000 })) {
  457 |     await searchBtn.click();
  458 |     await page.waitForLoadState('networkidle');
  459 |     await screenshot(page, 'T8-02-after-search');
  460 |   }
  461 | 
  462 |   // 행 클릭
  463 |   const firstRow = page.locator('tbody tr').first();
  464 |   if (await firstRow.isVisible({ timeout: 5000 })) {
  465 |     await firstRow.click();
  466 |     await page.waitForLoadState('networkidle');
  467 |     await screenshot(page, 'T8-03-edit-dialog');
  468 | 
  469 |     // 수정 dialog 확인
  470 |     const dialog = page.locator('[role="dialog"]').first();
  471 |     if (await dialog.isVisible({ timeout: 3000 })) {
  472 |       await expect(dialog).toBeVisible();
  473 |       await page.keyboard.press('Escape');
  474 |     }
  475 |   } else {
  476 |     await screenshot(page, 'T8-03-empty-state');
  477 |   }
  478 | });
  479 | 
  480 | // ───────────────────────────────────────────────────────────────
  481 | // T9. 현재 근무 현황
  482 | // ───────────────────────────────────────────────────────────────
  483 | test('T9. 현재 근무 현황', async ({ page }) => {
  484 |   await login(page);
  485 |   await page.goto('/admin/attendances/now');
  486 |   await page.waitForLoadState('networkidle');
  487 |   await screenshot(page, 'T9-01-attendance-now');
  488 | 
  489 |   // 요약 카드 3개 확인
  490 |   const cards = page.locator('[class*="card"], [data-testid*="card"], .stat-card').filter({ hasText: /명|명$|출근|퇴근|재직/ });
  491 |   const cardCount = await cards.count();
  492 |   await screenshot(page, 'T9-02-summary-cards');
  493 | 
  494 |   // 페이지가 로드되었는지 확인
> 495 |   await expect(page.locator('main, [role="main"], .main-content')).toBeVisible({ timeout: 10000 });
      |                                                                    ^ Error: expect(locator).toBeVisible() failed
  496 | });
  497 | 
  498 | // ───────────────────────────────────────────────────────────────
  499 | // T10. 휴가 유형
  500 | // ───────────────────────────────────────────────────────────────
  501 | test('T10. 휴가 유형 - CRUD', async ({ page }) => {
  502 |   await login(page);
  503 |   await page.goto('/admin/leave/types');
  504 |   await page.waitForLoadState('networkidle');
  505 |   await screenshot(page, 'T10-01-leave-types');
  506 | 
  507 |   // 그룹 추가
  508 |   const groupAddBtn = page.locator('button').filter({ hasText: /그룹 추가|그룹|Group/ }).first();
  509 |   if (await groupAddBtn.isVisible({ timeout: 5000 })) {
  510 |     await groupAddBtn.click();
  511 |     await page.waitForLoadState('networkidle');
  512 |     await screenshot(page, 'T10-02-group-add-dialog');
  513 | 
  514 |     const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  515 |     if (await nameInput.isVisible({ timeout: 3000 })) {
  516 |       await nameInput.fill('테스트그룹');
  517 |       const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
  518 |       await saveBtn.click();
  519 |       await page.waitForLoadState('networkidle');
  520 |       await screenshot(page, 'T10-03-after-group-save');
  521 |     }
  522 |   }
  523 | 
  524 |   // 유형 추가
  525 |   const typeAddBtn = page.locator('button').filter({ hasText: /유형 추가|추가|Add/ }).first();
  526 |   if (await typeAddBtn.isVisible({ timeout: 5000 })) {
  527 |     await typeAddBtn.click();
  528 |     await page.waitForLoadState('networkidle');
  529 |     await screenshot(page, 'T10-04-type-add-dialog');
  530 | 
  531 |     const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  532 |     if (await nameInput.isVisible({ timeout: 3000 })) {
  533 |       await nameInput.fill('테스트휴가');
  534 |       const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
  535 |       await saveBtn.click();
  536 |       await page.waitForLoadState('networkidle');
  537 |       await screenshot(page, 'T10-05-after-type-save');
  538 |     }
  539 |   }
  540 | 
  541 |   // 수정
  542 |   const editBtn = page.locator('button').filter({ hasText: /수정|Edit/ }).first();
  543 |   if (await editBtn.isVisible({ timeout: 3000 })) {
  544 |     await editBtn.click();
  545 |     await page.waitForLoadState('networkidle');
  546 |     await screenshot(page, 'T10-06-edit-dialog');
  547 |     await page.keyboard.press('Escape');
  548 |   }
  549 | 
  550 |   // 삭제
  551 |   const deleteBtn = page.locator('button').filter({ hasText: /삭제|Delete/ }).first();
  552 |   if (await deleteBtn.isVisible({ timeout: 3000 })) {
  553 |     await deleteBtn.click();
  554 |     await screenshot(page, 'T10-07-delete-confirm');
  555 |     const confirmBtn = page.locator('button').filter({ hasText: /확인|삭제|Confirm/ }).last();
  556 |     if (await confirmBtn.isVisible({ timeout: 2000 })) {
  557 |       await confirmBtn.click();
  558 |       await page.waitForLoadState('networkidle');
  559 |       await screenshot(page, 'T10-08-after-delete');
  560 |     }
  561 |   }
  562 | });
  563 | 
  564 | // ───────────────────────────────────────────────────────────────
  565 | // T11. 발생 규칙
  566 | // ───────────────────────────────────────────────────────────────
  567 | test('T11. 발생 규칙 - 추가', async ({ page }) => {
  568 |   await login(page);
  569 |   await page.goto('/admin/leave/accrual-rules');
  570 |   await page.waitForLoadState('networkidle');
  571 |   await screenshot(page, 'T11-01-accrual-rules');
  572 | 
  573 |   const addBtn = page.locator('button').filter({ hasText: /규칙 추가|추가|Add/ }).first();
  574 |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  575 |   await addBtn.click();
  576 |   await page.waitForLoadState('networkidle');
  577 |   await screenshot(page, 'T11-02-add-dialog');
  578 | 
  579 |   const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  580 |   if (await nameInput.isVisible({ timeout: 5000 })) {
  581 |     await nameInput.fill('테스트발생규칙');
  582 |     await screenshot(page, 'T11-03-filled');
  583 | 
  584 |     const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
  585 |     await saveBtn.click();
  586 |     await page.waitForLoadState('networkidle');
  587 |     await screenshot(page, 'T11-04-after-save');
  588 |   }
  589 | });
  590 | 
  591 | // ───────────────────────────────────────────────────────────────
  592 | // T12. 요청 관리
  593 | // ───────────────────────────────────────────────────────────────
  594 | test('T12. 요청 관리 - 탭 및 상세', async ({ page }) => {
  595 |   await login(page);
```