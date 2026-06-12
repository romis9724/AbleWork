import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.join(
  '/Users/user/Workspace/AbleWork/apps/web/e2e/screenshots/crud-test'
);

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: false,
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  // fill email
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="이메일"], input[placeholder*="email"]').first();
  await emailInput.fill('admin@ablework.io');
  const pwInput = page.locator('input[type="password"]').first();
  await pwInput.fill('admin1234!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/admin|dashboard/, { timeout: 15000 });
}

// ───────────────────────────────────────────────────────────────
// T1. 조직 관리
// ───────────────────────────────────────────────────────────────
test('T1. 조직 관리 - CRUD', async ({ page }) => {
  await login(page);
  await page.goto('/admin/organizations');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T1-01-organizations-list');

  // 추가 버튼
  const addBtn = page.locator('button').filter({ hasText: '조직 추가' }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await screenshot(page, 'T1-02-add-dialog');

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  const nameInput = dialog.locator('input').first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill('테스트조직');
  await screenshot(page, 'T1-03-filled-name');

  // 추가 버튼 클릭 → API POST /organizations
  const responsePromise = page.waitForResponse(
    resp => resp.url().includes('/organizations') && resp.request().method() === 'POST',
    { timeout: 10000 }
  );
  await dialog.locator('button').filter({ hasText: '추가' }).click();

  const resp = await responsePromise;
  const respBody = await resp.json().catch(() => ({}));
  await screenshot(page, 'T1-04-after-save-attempt');

  // BUG CHECK: API 400 에러 (parentId/approverId null 검증 실패)
  if (resp.status() === 400) {
    console.log('[T1 BUG] POST /organizations 400:', JSON.stringify(respBody));
    // 버그 확인 후 dialog 닫고 기존 조직으로 수정/삭제 테스트
    await dialog.locator('button').filter({ hasText: '취소' }).click();
    await page.waitForTimeout(500);

    // 기존 "개발팀" 조직으로 수정 테스트
    const existingOrgItem = page.locator('.MuiListItemButton-root').filter({ hasText: '개발팀' }).first();
    if (await existingOrgItem.isVisible({ timeout: 3000 })) {
      await existingOrgItem.hover();
      // 편집 버튼
      const editIconBtn = existingOrgItem.locator('button').first();
      if (await editIconBtn.isVisible({ timeout: 2000 })) {
        await editIconBtn.click();
        await screenshot(page, 'T1-05-edit-dialog-existing');
        const editDialog = page.locator('[role="dialog"]');
        const editInput = editDialog.locator('input').first();
        const currentValue = await editInput.inputValue();
        await editInput.fill('개발팀_수정');

        // 수정 응답 캡처
        const editRespPromise = page.waitForResponse(
          r => r.url().includes('/organizations') && r.request().method() === 'PATCH',
          { timeout: 10000 }
        );
        await editDialog.locator('button').filter({ hasText: '수정' }).click();
        const editResp = await editRespPromise;
        await screenshot(page, 'T1-06-after-update');
        expect(editResp.status()).toBe(200);

        // 원래 이름으로 복원
        await existingOrgItem.hover();
        const editIconBtn2 = page.locator('.MuiListItemButton-root').locator('button').first();
        if (await editIconBtn2.isVisible({ timeout: 2000 })) {
          await editIconBtn2.click();
          const editDialog2 = page.locator('[role="dialog"]');
          const editInput2 = editDialog2.locator('input').first();
          await editInput2.fill('개발팀');
          await editDialog2.locator('button').filter({ hasText: '수정' }).click();
          await page.waitForTimeout(500);
        }
      }

      // 삭제 테스트 (기존 조직)
      await existingOrgItem.hover();
      const deleteIconBtn = page.locator('.MuiListItemButton-root').locator('button').last();
      if (await deleteIconBtn.isVisible({ timeout: 2000 })) {
        await deleteIconBtn.click();
        await screenshot(page, 'T1-07-delete-confirm');
        const confirmDialog = page.locator('[role="dialog"]');
        if (await confirmDialog.isVisible({ timeout: 2000 })) {
          // 삭제 취소 (데이터 보존을 위해)
          await confirmDialog.locator('button').filter({ hasText: '취소' }).click();
          await screenshot(page, 'T1-08-delete-cancelled');
        }
      }
    }
    // T1은 API 버그로 인해 조직 추가가 실패함을 기록
    throw new Error(`[T1 FAIL] 조직 추가 API 버그: POST /organizations 400 - parentId/approverId null 검증 실패\n응답: ${JSON.stringify(respBody.error)}`);
  }

  // API 성공 시 정상 플로우
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await expect(page.getByText('테스트조직')).toBeVisible({ timeout: 10000 });
  await screenshot(page, 'T1-04b-org-in-list');

  // 수정
  const orgItem = page.locator('.MuiListItemButton-root').filter({ hasText: '테스트조직' }).first();
  await orgItem.hover();
  const editIconBtn = orgItem.locator('button').first();
  if (await editIconBtn.isVisible({ timeout: 2000 })) {
    await editIconBtn.click();
    const editDialog = page.locator('[role="dialog"]');
    const editInput = editDialog.locator('input').first();
    await editInput.fill('테스트조직_수정');
    await editDialog.locator('button').filter({ hasText: '수정' }).click();
    await page.waitForTimeout(500);
    await screenshot(page, 'T1-06-after-update');
  }

  // 삭제
  const updatedItem = page.locator('.MuiListItemButton-root').filter({ hasText: /테스트조직/ }).first();
  await updatedItem.hover();
  const deleteIconBtn = updatedItem.locator('button').last();
  if (await deleteIconBtn.isVisible({ timeout: 2000 })) {
    await deleteIconBtn.click();
    await screenshot(page, 'T1-07-confirm-dialog');
    const confirmDialog = page.locator('[role="dialog"]');
    if (await confirmDialog.isVisible({ timeout: 2000 })) {
      await confirmDialog.locator('button').filter({ hasText: /삭제|확인/ }).last().click();
      await page.waitForTimeout(500);
      await screenshot(page, 'T1-08-after-delete');
    }
  }
});

// ───────────────────────────────────────────────────────────────
// T2. 직원 관리
// ───────────────────────────────────────────────────────────────
test('T2. 직원 관리 - 목록 및 상세', async ({ page }) => {
  await login(page);
  await page.goto('/admin/employees');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T2-01-employees-list');

  // 직원 목록 테이블 확인
  await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
  await screenshot(page, 'T2-02-table-rendered');

  // 테이블 행 클릭 → 직원 상세로 이동
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 10000 });
  await firstRow.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await screenshot(page, 'T2-03-employee-detail');

  // URL 확인 - /admin/employees/:id 로 이동
  await expect(page).toHaveURL(/\/admin\/employees\/[^/]+$/, { timeout: 10000 });

  // 직원 정보 로딩 대기 (오류가 없으면 탭이 나타남)
  // 오류가 있으면 error alert 표시
  const errorAlert = page.locator('[role="alert"]').filter({ hasText: '직원 정보를 찾을 수 없습니다' });
  const tabsContainer = page.locator('[role="tab"]').first();

  // 탭이 보이거나 에러가 보일 때까지 대기
  await page.waitForTimeout(2000);

  const hasError = await errorAlert.isVisible({ timeout: 1000 }).catch(() => false);
  if (hasError) {
    await screenshot(page, 'T2-03-employee-detail-api-error');
    // BUG: seed 직원 ID (seed-emp-001)가 UUID 형식이 아니어서 API 검증 실패
    throw new Error('[T2 FAIL] 직원 상세 API 버그: GET /employees/seed-emp-001 → 400 "Validation failed (uuid is expected)"\n시드 데이터의 직원 ID가 UUID 형식이 아닌 문자열 ID를 사용하여 API 검증에 실패합니다.');
  }

  // 탭 3개 확인 (기본정보, 근로정보, 기기)
  await expect(page.locator('[role="tab"]')).toHaveCount(3, { timeout: 8000 });
  const tabLabels = ['기본정보', '근로정보', '기기'];
  for (const tabLabel of tabLabels) {
    const tabEl = page.locator('[role="tab"]').filter({ hasText: tabLabel });
    await expect(tabEl).toBeVisible({ timeout: 5000 });
    await tabEl.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, `T2-04-tab-${tabLabel}`);
  }
});

// ───────────────────────────────────────────────────────────────
// T3. 직무 관리
// ───────────────────────────────────────────────────────────────
test('T3. 직무 관리 - CRUD', async ({ page }) => {
  await login(page);
  await page.goto('/admin/positions');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T3-01-positions-list');

  // 추가
  const addBtn = page.locator('button').filter({ hasText: /직무 추가|추가|Add/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T3-02-add-dialog');

  const nameInput = page.locator('input[name="name"], input[placeholder*="이름"], input[placeholder*="직무"]').first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill('테스트직무');
  await screenshot(page, 'T3-03-filled');

  // 저장
  const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /추가|저장|Save|Add/ }).last();
  await saveBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T3-04-after-save');

  await expect(page.locator('text=테스트직무').first()).toBeVisible({ timeout: 10000 });

  // 직무 카드 찾기 (첫 번째 테스트직무 카드)
  // 카드에 편집(연필) 아이콘과 삭제(휴지통) 아이콘이 있음
  // 포지션 카드들 중 첫 번째 것 가져오기
  const positionCard = page.locator('.MuiCard-root, [class*="card"], .MuiPaper-root').filter({ hasText: '테스트직무' }).first();

  // 수정 버튼 (연필 아이콘)
  const editIconBtn = positionCard.locator('button').nth(0);
  if (await editIconBtn.isVisible({ timeout: 3000 })) {
    await editIconBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T3-05-edit-dialog');

    const editDialog = page.locator('[role="dialog"]');
    if (await editDialog.isVisible({ timeout: 3000 })) {
      const editInput = editDialog.locator('input').first();
      await editInput.fill('테스트직무_수정');
      await editDialog.locator('button').filter({ hasText: /수정|저장/ }).click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'T3-06-after-update');
    }
  }

  // 삭제 버튼 (휴지통 아이콘) - 수정 후 카드를 다시 찾음
  const cardToDelete = page.locator('.MuiCard-root, [class*="card"], .MuiPaper-root').filter({ hasText: /테스트직무/ }).first();
  const deleteIconBtn = cardToDelete.locator('button').nth(1);
  if (await deleteIconBtn.isVisible({ timeout: 3000 })) {
    await deleteIconBtn.click();
    await screenshot(page, 'T3-07-confirm');
    const confirmDialog = page.locator('[role="dialog"]');
    if (await confirmDialog.isVisible({ timeout: 3000 })) {
      await confirmDialog.locator('button').filter({ hasText: /삭제|확인/ }).last().click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'T3-08-after-delete');
    }
  }
});

// ───────────────────────────────────────────────────────────────
// T4. 출퇴근 장소
// ───────────────────────────────────────────────────────────────
test('T4. 출퇴근 장소 - 추가', async ({ page }) => {
  await login(page);
  await page.goto('/admin/timeclock-areas');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T4-01-timeclock-areas');

  const addBtn = page.locator('button').filter({ hasText: /장소 추가|추가|Add/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T4-02-add-dialog');

  // 이름
  const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill('본사입구');

  // 위도/경도
  const latInput = page.locator('input[name="latitude"], input[placeholder*="위도"]').first();
  if (await latInput.isVisible({ timeout: 2000 })) {
    await latInput.fill('37.5665');
  }
  const lngInput = page.locator('input[name="longitude"], input[placeholder*="경도"]').first();
  if (await lngInput.isVisible({ timeout: 2000 })) {
    await lngInput.fill('126.9780');
  }

  await screenshot(page, 'T4-03-filled');

  const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
  await saveBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T4-04-after-save');
});

// ───────────────────────────────────────────────────────────────
// T5. 근무일정 유형
// ───────────────────────────────────────────────────────────────
test('T5. 근무일정 유형 - CRUD', async ({ page }) => {
  await login(page);
  await page.goto('/admin/shifts/types');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T5-01-shift-types');

  const addBtn = page.locator('button').filter({ hasText: /유형 추가|추가|Add/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T5-02-add-dialog');

  const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill('테스트근무');

  // 분류 선택 REGULAR - MUI TextField select 방식: div[role="button"] 클릭 후 MenuItem 선택
  const categoryField = page.locator('[role="dialog"]').locator('div[role="button"]').first();
  if (await categoryField.isVisible({ timeout: 2000 })) {
    await categoryField.click();
    // MenuItem 클릭 (일반=REGULAR)
    const regularOption = page.locator('ul[role="listbox"] li, [role="option"]').filter({ hasText: '일반' }).first();
    if (await regularOption.isVisible({ timeout: 3000 })) {
      await regularOption.click();
    } else {
      // Escape로 닫기
      await page.keyboard.press('Escape');
    }
  }

  await screenshot(page, 'T5-03-filled');

  // dialog 내 추가 버튼 클릭
  const addDialog = page.locator('[role="dialog"]');
  const saveBtn = addDialog.locator('button').filter({ hasText: /추가|저장/ }).last();
  await saveBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T5-04-after-save');

  // 수정
  const editBtn = page.locator('button').filter({ hasText: /수정|Edit/ }).first();
  if (await editBtn.isVisible({ timeout: 3000 })) {
    await editBtn.click();
    await page.waitForLoadState('networkidle');
    const editInput = page.locator('input[name="name"]').first();
    await editInput.fill('테스트근무_수정');
    const updateBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|Save/ }).last();
    await updateBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T5-05-after-update');
  }
});

// ───────────────────────────────────────────────────────────────
// T6. 근무일정 템플릿
// ───────────────────────────────────────────────────────────────
test('T6. 근무일정 템플릿 - 추가', async ({ page }) => {
  await login(page);
  await page.goto('/admin/shifts/templates');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T6-01-shift-templates');

  const addBtn = page.locator('button').filter({ hasText: /템플릿 추가|추가|Add/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T6-02-add-dialog');

  const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill('9-18시');

  const startInput = page.locator('input[name="startTime"], input[placeholder*="시작"], input[type="time"]').first();
  if (await startInput.isVisible({ timeout: 2000 })) {
    await startInput.fill('09:00');
  }
  const endInput = page.locator('input[name="endTime"], input[placeholder*="종료"], input[type="time"]').nth(1);
  if (await endInput.isVisible({ timeout: 2000 })) {
    await endInput.fill('18:00');
  }

  await screenshot(page, 'T6-03-filled');

  const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /추가|저장|Save/ }).last();
  await saveBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T6-04-after-save');
});

// ───────────────────────────────────────────────────────────────
// T7. 근무일정
// ───────────────────────────────────────────────────────────────
test('T7. 근무일정 - 추가', async ({ page }) => {
  await login(page);
  await page.goto('/admin/shifts');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T7-01-shifts');

  const addBtn = page.locator('button').filter({ hasText: /근무일정 추가|추가|Add/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T7-02-add-dialog');

  // 폼 확인
  const shiftDialog = page.locator('[role="dialog"]');
  await expect(shiftDialog).toBeVisible({ timeout: 5000 });
  await screenshot(page, 'T7-03-dialog-open');

  // 직원 Autocomplete 입력 - dialog 안에서 직원 필드 클릭
  // Autocomplete input은 role="combobox"
  const empInput = shiftDialog.locator('input[role="combobox"]').first();
  if (await empInput.isVisible({ timeout: 3000 })) {
    await empInput.click();
    await page.waitForTimeout(300);
    // 옵션 목록 나타나면 첫 번째 선택
    const firstOption = page.locator('[role="option"]').first();
    if (await firstOption.isVisible({ timeout: 3000 })) {
      await firstOption.click();
      await screenshot(page, 'T7-04-employee-selected');
    }
  }

  await screenshot(page, 'T7-05-after-interaction');

  // 닫기
  await shiftDialog.locator('button').filter({ hasText: '취소' }).click();
});

// ───────────────────────────────────────────────────────────────
// T8. 출퇴근 기록
// ───────────────────────────────────────────────────────────────
test('T8. 출퇴근 기록 - 필터 및 수정', async ({ page }) => {
  await login(page);
  await page.goto('/admin/attendances');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T8-01-attendances');

  // 조회 버튼
  const searchBtn = page.locator('button').filter({ hasText: /조회|검색|Search|Query/ }).first();
  if (await searchBtn.isVisible({ timeout: 5000 })) {
    await searchBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T8-02-after-search');
  }

  // 행 클릭
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.isVisible({ timeout: 5000 })) {
    await firstRow.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T8-03-edit-dialog');

    // 수정 dialog 확인
    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.isVisible({ timeout: 3000 })) {
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
    }
  } else {
    await screenshot(page, 'T8-03-empty-state');
  }
});

// ───────────────────────────────────────────────────────────────
// T9. 현재 근무 현황
// ───────────────────────────────────────────────────────────────
test('T9. 현재 근무 현황', async ({ page }) => {
  await login(page);
  await page.goto('/admin/attendances/now');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T9-01-attendance-now');

  // 요약 카드 3개 확인
  const cards = page.locator('[class*="card"], [data-testid*="card"], .stat-card').filter({ hasText: /명|명$|출근|퇴근|재직/ });
  const cardCount = await cards.count();
  await screenshot(page, 'T9-02-summary-cards');

  // 페이지가 로드되었는지 확인
  await expect(page.locator('main, [role="main"], .main-content')).toBeVisible({ timeout: 10000 });
});

// ───────────────────────────────────────────────────────────────
// T10. 휴가 유형
// ───────────────────────────────────────────────────────────────
test('T10. 휴가 유형 - CRUD', async ({ page }) => {
  await login(page);
  await page.goto('/admin/leave/types');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T10-01-leave-types');

  // 그룹 추가
  const groupAddBtn = page.locator('button').filter({ hasText: /그룹 추가|그룹|Group/ }).first();
  if (await groupAddBtn.isVisible({ timeout: 5000 })) {
    await groupAddBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T10-02-group-add-dialog');

    const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
    if (await nameInput.isVisible({ timeout: 3000 })) {
      await nameInput.fill('테스트그룹');
      const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
      await saveBtn.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'T10-03-after-group-save');
    }
  }

  // 유형 추가
  const typeAddBtn = page.locator('button').filter({ hasText: /유형 추가|추가|Add/ }).first();
  if (await typeAddBtn.isVisible({ timeout: 5000 })) {
    await typeAddBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T10-04-type-add-dialog');

    const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
    if (await nameInput.isVisible({ timeout: 3000 })) {
      await nameInput.fill('테스트휴가');
      const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
      await saveBtn.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'T10-05-after-type-save');
    }
  }

  // 수정
  const editBtn = page.locator('button').filter({ hasText: /수정|Edit/ }).first();
  if (await editBtn.isVisible({ timeout: 3000 })) {
    await editBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T10-06-edit-dialog');
    await page.keyboard.press('Escape');
  }

  // 삭제
  const deleteBtn = page.locator('button').filter({ hasText: /삭제|Delete/ }).first();
  if (await deleteBtn.isVisible({ timeout: 3000 })) {
    await deleteBtn.click();
    await screenshot(page, 'T10-07-delete-confirm');
    const confirmBtn = page.locator('button').filter({ hasText: /확인|삭제|Confirm/ }).last();
    if (await confirmBtn.isVisible({ timeout: 2000 })) {
      await confirmBtn.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'T10-08-after-delete');
    }
  }
});

// ───────────────────────────────────────────────────────────────
// T11. 발생 규칙
// ───────────────────────────────────────────────────────────────
test('T11. 발생 규칙 - 추가', async ({ page }) => {
  await login(page);
  await page.goto('/admin/leave/accrual-rules');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T11-01-accrual-rules');

  const addBtn = page.locator('button').filter({ hasText: /규칙 추가|추가|Add/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T11-02-add-dialog');

  const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  if (await nameInput.isVisible({ timeout: 5000 })) {
    await nameInput.fill('테스트발생규칙');
    await screenshot(page, 'T11-03-filled');

    const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T11-04-after-save');
  }
});

// ───────────────────────────────────────────────────────────────
// T12. 요청 관리
// ───────────────────────────────────────────────────────────────
test('T12. 요청 관리 - 탭 및 상세', async ({ page }) => {
  await login(page);
  await page.goto('/admin/requests');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T12-01-requests');

  // 탭 전환
  const tabs = ['전체', '승인필요', '완료'];
  for (const tab of tabs) {
    const tabEl = page.locator('[role="tab"], button').filter({ hasText: tab }).first();
    if (await tabEl.isVisible({ timeout: 3000 })) {
      await tabEl.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, `T12-02-tab-${tab}`);
    }
  }

  // 행 클릭
  const firstRow = page.locator('tbody tr').first();
  if (await firstRow.isVisible({ timeout: 3000 })) {
    await firstRow.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T12-03-detail-dialog');

    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.isVisible({ timeout: 3000 })) {
      await page.keyboard.press('Escape');
    }
  } else {
    await screenshot(page, 'T12-03-empty-state');
  }
});

// ───────────────────────────────────────────────────────────────
// T13. 승인 규칙
// ───────────────────────────────────────────────────────────────
test('T13. 승인 규칙 - 추가', async ({ page }) => {
  await login(page);
  await page.goto('/admin/requests/rules');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T13-01-approval-rules');

  const addBtn = page.locator('button').filter({ hasText: /규칙 추가|추가|Add/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T13-02-add-dialog');

  const nameInput = page.locator('input[name="name"], input[placeholder*="이름"]').first();
  if (await nameInput.isVisible({ timeout: 5000 })) {
    await nameInput.fill('테스트승인규칙');

    // 요청유형 선택
    const typeSelect = page.locator('select[name="requestType"], [role="combobox"]').first();
    if (await typeSelect.isVisible({ timeout: 2000 })) {
      await typeSelect.click();
      const leaveOption = page.locator('[role="option"], option').filter({ hasText: /LEAVE_CREATE|휴가/ }).first();
      if (await leaveOption.isVisible({ timeout: 2000 })) {
        await leaveOption.click();
      }
    }

    await screenshot(page, 'T13-03-filled');

    const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|추가|Save/ }).last();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T13-04-after-save');
  }
});

// ───────────────────────────────────────────────────────────────
// T14. 리포트
// ───────────────────────────────────────────────────────────────
test('T14. 리포트 - 조회', async ({ page }) => {
  await login(page);
  await page.goto('/admin/reports');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T14-01-reports');

  // 조회 버튼
  const searchBtn = page.locator('button').filter({ hasText: /조회|검색|Search/ }).first();
  if (await searchBtn.isVisible({ timeout: 5000 })) {
    await searchBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T14-02-after-search');
  }

  await expect(page.locator('main, [role="main"]')).toBeVisible({ timeout: 10000 });
  await screenshot(page, 'T14-03-final');
});

// ───────────────────────────────────────────────────────────────
// T15. Discord 설정
// ───────────────────────────────────────────────────────────────
test('T15. Discord 설정 - Webhook 저장', async ({ page }) => {
  await login(page);
  await page.goto('/admin/settings/notifications');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T15-01-notifications');

  const webhookInput = page.locator('input[name*="webhook"], input[name*="discord"], input[placeholder*="webhook"], input[placeholder*="Discord"], input[type="url"], input[type="text"]').first();
  if (await webhookInput.isVisible({ timeout: 5000 })) {
    await webhookInput.fill('https://discord.com/api/webhooks/test/test');
    await screenshot(page, 'T15-02-filled');

    const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|Save/ }).first();
    if (await saveBtn.isVisible({ timeout: 3000 })) {
      await saveBtn.click();
      await page.waitForLoadState('networkidle');
      await screenshot(page, 'T15-03-after-save');
    }
  } else {
    await screenshot(page, 'T15-02-no-input');
  }
});

// ───────────────────────────────────────────────────────────────
// T16. 회사 설정
// ───────────────────────────────────────────────────────────────
test('T16. 회사 설정 - 탭 및 저장', async ({ page }) => {
  await login(page);
  await page.goto('/admin/settings/company');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T16-01-company-settings');

  // 탭들 클릭
  const tabs = page.locator('[role="tab"], .tab-button, nav button');
  const tabCount = await tabs.count();
  for (let i = 0; i < Math.min(tabCount, 4); i++) {
    await tabs.nth(i).click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, `T16-02-tab-${i}`);
  }

  // 저장 버튼
  const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|Save/ }).first();
  if (await saveBtn.isVisible({ timeout: 3000 })) {
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T16-03-after-save');
  }
});

// ───────────────────────────────────────────────────────────────
// T17. 권한 설정
// ───────────────────────────────────────────────────────────────
test('T17. 권한 설정 - 토글 및 저장', async ({ page }) => {
  await login(page);
  await page.goto('/admin/settings/permissions');
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'T17-01-permissions');

  // 첫 번째 체크박스 토글
  const checkbox = page.locator('input[type="checkbox"], [role="checkbox"], [role="switch"]').first();
  if (await checkbox.isVisible({ timeout: 5000 })) {
    await checkbox.click();
    await screenshot(page, 'T17-02-toggled');
  }

  // 저장
  const saveBtn = page.locator('button[type="submit"], button').filter({ hasText: /저장|Save/ }).first();
  if (await saveBtn.isVisible({ timeout: 3000 })) {
    await saveBtn.click();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'T17-03-after-save');
  }

  await screenshot(page, 'T17-04-final');
});
