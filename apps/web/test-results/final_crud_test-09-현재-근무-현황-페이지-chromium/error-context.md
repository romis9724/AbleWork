# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: final_crud_test.spec.ts >> 09. 현재 근무 현황 페이지
- Location: e2e/final_crud_test.spec.ts:375:5

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
  282 | 
  283 |   const nameInput = dialog.locator('input').first();
  284 |   await nameInput.fill('최종테스트템플릿');
  285 | 
  286 |   const allInputs = await dialog.locator('input').all();
  287 |   for (const input of allInputs) {
  288 |     const type = await input.getAttribute('type').catch(() => '');
  289 |     const name = await input.getAttribute('name').catch(() => '');
  290 |     if (type === 'time' || name?.toLowerCase().includes('start')) {
  291 |       const val = await input.inputValue().catch(() => '');
  292 |       if (!val) await input.fill('09:00');
  293 |     }
  294 |     if (type === 'time' && name?.toLowerCase().includes('end')) {
  295 |       const val = await input.inputValue().catch(() => '');
  296 |       if (!val) await input.fill('18:00');
  297 |     }
  298 |   }
  299 |   await ss(page, '06-shift-templates-dialog');
  300 | 
  301 |   const respPromise = page.waitForResponse(
  302 |     r => (r.url().includes('/template') || r.url().includes('/shift')) && r.request().method() === 'POST',
  303 |     { timeout: 15000 }
  304 |   );
  305 | 
  306 |   await dialog.locator('button').filter({ hasText: /추가|저장/ }).last().click();
  307 | 
  308 |   try {
  309 |     const resp = await respPromise;
  310 |     const status = resp.status();
  311 |     const body = await resp.json().catch(() => ({}));
  312 |     console.log(`[06] POST templates → ${status} ${JSON.stringify(body)}`);
  313 |     await ss(page, '06-shift-templates-after-save');
  314 |     expect(status, `[06 FAIL] 근무템플릿 추가: HTTP ${status}`).toBeLessThan(300);
  315 |   } catch (e: unknown) {
  316 |     if (e instanceof Error && e.message.startsWith('[06 FAIL')) throw e;
  317 |     await page.waitForLoadState('networkidle');
  318 |     await ss(page, '06-shift-templates-no-intercept');
  319 |     console.log('[06] API 응답 미캡처');
  320 |   }
  321 | 
  322 |   console.log('[06] PASS');
  323 | });
  324 | 
  325 | // ─── 7. /admin/shifts — 근무일정 추가 다이얼로그 ─────────────────────────────
  326 | test('07. 근무일정 추가 다이얼로그 확인', async ({ page }) => {
  327 |   await loginAdmin(page);
  328 |   await page.goto('/admin/shifts');
  329 |   await page.waitForLoadState('networkidle');
  330 |   await ss(page, '07-shifts-list');
  331 | 
  332 |   const addBtn = page.locator('button').filter({ hasText: /근무일정 추가/ }).first();
  333 |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  334 |   await addBtn.click();
  335 | 
  336 |   const dialog = page.locator('[role="dialog"]');
  337 |   await expect(dialog).toBeVisible({ timeout: 5000 });
  338 |   await ss(page, '07-shifts-dialog');
  339 | 
  340 |   // Verify dialog opened with some form fields
  341 |   const dialogInputCount = await dialog.locator('input, [role="combobox"]').count();
  342 |   expect(dialogInputCount, '[07 FAIL] 근무일정 추가 다이얼로그에 입력 필드 없음').toBeGreaterThan(0);
  343 | 
  344 |   const cancelBtn = dialog.locator('button').filter({ hasText: /취소/ });
  345 |   if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  346 |     await cancelBtn.click();
  347 |   } else {
  348 |     await page.keyboard.press('Escape');
  349 |   }
  350 |   await ss(page, '07-shifts-dialog-closed');
  351 |   console.log('[07] PASS');
  352 | });
  353 | 
  354 | // ─── 8. /admin/attendances — 기간 필터 조회 ──────────────────────────────────
  355 | test('08. 출퇴근 기록 기간 필터 조회', async ({ page }) => {
  356 |   await loginAdmin(page);
  357 |   await page.goto('/admin/attendances');
  358 |   await page.waitForLoadState('networkidle');
  359 |   await ss(page, '08-attendances-list');
  360 | 
  361 |   const main = page.locator('main, [role="main"]');
  362 |   await expect(main).toBeVisible({ timeout: 10000 });
  363 | 
  364 |   // Click search button if available
  365 |   const searchBtn = page.locator('button').filter({ hasText: /조회|검색/ }).first();
  366 |   if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  367 |     await searchBtn.click();
  368 |     await page.waitForLoadState('networkidle');
  369 |   }
  370 |   await ss(page, '08-attendances-after-filter');
  371 |   console.log('[08] PASS');
  372 | });
  373 | 
  374 | // ─── 9. /admin/attendances/now — 현황 ────────────────────────────────────────
  375 | test('09. 현재 근무 현황 페이지', async ({ page }) => {
  376 |   await loginAdmin(page);
  377 |   await page.goto('/admin/attendances/now');
  378 |   await page.waitForLoadState('networkidle');
  379 |   await ss(page, '09-attendances-now');
  380 | 
  381 |   const main = page.locator('main, [role="main"]');
> 382 |   await expect(main).toBeVisible({ timeout: 10000 });
      |                      ^ Error: expect(locator).toBeVisible() failed
  383 |   console.log('[09] PASS');
  384 | });
  385 | 
  386 | // ─── 10. /admin/leave/types — 그룹/유형 추가 ─────────────────────────────────
  387 | test('10. 휴가 유형 그룹+유형 추가', async ({ page }) => {
  388 |   await loginAdmin(page);
  389 |   await page.goto('/admin/leave/types');
  390 |   await page.waitForLoadState('networkidle');
  391 |   await ss(page, '10-leave-types-list');
  392 | 
  393 |   // Try group add first
  394 |   const groupBtn = page.locator('button').filter({ hasText: /그룹 추가/ }).first();
  395 |   if (await groupBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  396 |     await groupBtn.click();
  397 |     const dlg = page.locator('[role="dialog"]');
  398 |     await expect(dlg).toBeVisible({ timeout: 5000 });
  399 |     await dlg.locator('input').first().fill('최종테스트그룹');
  400 |     await ss(page, '10-leave-group-dialog');
  401 |     await dlg.locator('button').filter({ hasText: /추가|저장/ }).last().click();
  402 |     await page.waitForLoadState('networkidle');
  403 |     await ss(page, '10-leave-group-added');
  404 |   }
  405 | 
  406 |   // Type add
  407 |   const typeBtn = page.locator('button').filter({ hasText: /유형 추가/ }).first();
  408 |   if (await typeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  409 |     await typeBtn.click();
  410 |     const dlg = page.locator('[role="dialog"]');
  411 |     await expect(dlg).toBeVisible({ timeout: 5000 });
  412 |     await dlg.locator('input').first().fill('최종테스트휴가');
  413 |     await ss(page, '10-leave-type-dialog');
  414 |     await dlg.locator('button').filter({ hasText: /추가|저장/ }).last().click();
  415 |     await page.waitForLoadState('networkidle');
  416 |     await ss(page, '10-leave-type-added');
  417 |   }
  418 | 
  419 |   await ss(page, '10-leave-types-final');
  420 |   console.log('[10] PASS');
  421 | });
  422 | 
  423 | // ─── 11. /admin/leave/accrual-rules — 규칙 추가 ──────────────────────────────
  424 | test('11. 발생 규칙 추가', async ({ page }) => {
  425 |   await loginAdmin(page);
  426 |   await page.goto('/admin/leave/accrual-rules');
  427 |   await page.waitForLoadState('networkidle');
  428 |   await ss(page, '11-accrual-rules-list');
  429 | 
  430 |   const main = page.locator('main, [role="main"]');
  431 |   await expect(main).toBeVisible({ timeout: 10000 });
  432 | 
  433 |   const addBtn = page.locator('button').filter({ hasText: /규칙 추가/ }).first();
  434 |   if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  435 |     await addBtn.click();
  436 |     const dlg = page.locator('[role="dialog"]');
  437 |     await expect(dlg).toBeVisible({ timeout: 5000 });
  438 |     const nameInput = dlg.locator('input').first();
  439 |     if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  440 |       await nameInput.fill('최종테스트발생규칙');
  441 |     }
  442 |     await ss(page, '11-accrual-rules-dialog');
  443 |     const cancelBtn = dlg.locator('button').filter({ hasText: /취소/ });
  444 |     if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  445 |       await cancelBtn.click();
  446 |     } else {
  447 |       await page.keyboard.press('Escape');
  448 |     }
  449 |   }
  450 | 
  451 |   await ss(page, '11-accrual-rules-final');
  452 |   console.log('[11] PASS');
  453 | });
  454 | 
  455 | // ─── 12. /admin/requests — 승인 탭 ───────────────────────────────────────────
  456 | test('12. 요청 관리 승인 탭 확인', async ({ page }) => {
  457 |   await loginAdmin(page);
  458 |   await page.goto('/admin/requests');
  459 |   await page.waitForLoadState('networkidle');
  460 |   await ss(page, '12-requests-list');
  461 | 
  462 |   const main = page.locator('main, [role="main"]');
  463 |   await expect(main).toBeVisible({ timeout: 10000 });
  464 | 
  465 |   // Approval tab click
  466 |   const approvalTab = page.locator('[role="tab"]').filter({ hasText: /승인|대기|요청/ }).first();
  467 |   if (await approvalTab.isVisible({ timeout: 5000 }).catch(() => false)) {
  468 |     await approvalTab.click();
  469 |     await page.waitForLoadState('networkidle');
  470 |     await ss(page, '12-requests-approval-tab');
  471 |   }
  472 | 
  473 |   await ss(page, '12-requests-final');
  474 |   console.log('[12] PASS');
  475 | });
  476 | 
  477 | // ─── 13. /admin/requests/rules — 규칙 추가 ───────────────────────────────────
  478 | test('13. 승인 규칙 추가', async ({ page }) => {
  479 |   await loginAdmin(page);
  480 |   await page.goto('/admin/requests/rules');
  481 |   await page.waitForLoadState('networkidle');
  482 |   await ss(page, '13-request-rules-list');
```