# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin_crud_test.spec.ts >> T1. 조직 관리 - CRUD
- Location: e2e/admin_crud_test.spec.ts:30:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('테스트조직')
Expected: visible
Error: strict mode violation: getByText('테스트조직') resolved to 8 elements:
    1) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">브라우저테스트조직_1781233393629</span> aka getByRole('button', { name: '브라우저테스트조직_1781233393629' })
    2) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">브라우저테스트조직_1781233478896</span> aka getByRole('button', { name: '브라우저테스트조직_1781233478896' })
    3) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">브라우저테스트조직_1781233520096</span> aka getByRole('button', { name: '브라우저테스트조직_1781233520096' })
    4) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">브라우저테스트조직_1781252455648</span> aka getByRole('button', { name: '브라우저테스트조직_1781252455648' })
    5) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">직접테스트조직</span> aka getByRole('button', { name: '직접테스트조직' })
    6) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">최종테스트조직</span> aka getByRole('button', { name: '최종테스트조직' })
    7) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">테스트조직</span> aka getByRole('button', { name: '테스트조직', exact: true }).first()
    8) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">테스트조직</span> aka getByRole('button', { name: '테스트조직', exact: true }).nth(1)

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('테스트조직')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - heading "AbleWork" [level=6] [ref=e7]
          - text: 관리자
        - button "로그아웃" [ref=e8] [cursor=pointer]:
          - img [ref=e9]
      - separator [ref=e11]
      - list [ref=e12]:
        - listitem [ref=e13]:
          - button "대시보드" [ref=e14] [cursor=pointer]:
            - img [ref=e16]
            - paragraph [ref=e19]: 대시보드
        - generic [ref=e20]:
          - listitem [ref=e21]:
            - button "인사/조직" [ref=e22] [cursor=pointer]:
              - img [ref=e24]
              - paragraph [ref=e27]: 인사/조직
              - img [ref=e28]
          - list [ref=e33]:
            - listitem [ref=e34]:
              - button "조직 관리" [ref=e35] [cursor=pointer]:
                - paragraph [ref=e37]: 조직 관리
            - listitem [ref=e38]:
              - button "직원 목록" [ref=e39] [cursor=pointer]:
                - paragraph [ref=e41]: 직원 목록
            - listitem [ref=e42]:
              - button "직무" [ref=e43] [cursor=pointer]:
                - paragraph [ref=e45]: 직무
            - listitem [ref=e46]:
              - button "출퇴근 장소" [ref=e47] [cursor=pointer]:
                - paragraph [ref=e49]: 출퇴근 장소
        - listitem [ref=e51]:
          - button "근무일정" [ref=e52] [cursor=pointer]:
            - img [ref=e54]
            - paragraph [ref=e57]: 근무일정
            - img [ref=e58]
        - listitem [ref=e61]:
          - button "출퇴근" [ref=e62] [cursor=pointer]:
            - img [ref=e64]
            - paragraph [ref=e68]: 출퇴근
            - img [ref=e69]
        - listitem [ref=e72]:
          - button "휴가" [ref=e73] [cursor=pointer]:
            - img [ref=e75]
            - paragraph [ref=e78]: 휴가
            - img [ref=e79]
        - listitem [ref=e82]:
          - button "요청" [ref=e83] [cursor=pointer]:
            - img [ref=e85]
            - paragraph [ref=e88]: 요청
            - img [ref=e89]
        - listitem [ref=e92]:
          - button "전자결재" [ref=e93] [cursor=pointer]:
            - img [ref=e95]
            - paragraph [ref=e98]: 전자결재
            - img [ref=e99]
        - listitem [ref=e102]:
          - button "리포트" [ref=e103] [cursor=pointer]:
            - img [ref=e105]
            - paragraph [ref=e108]: 리포트
            - img [ref=e109]
        - listitem [ref=e112]:
          - button "메시지" [ref=e113] [cursor=pointer]:
            - img [ref=e115]
            - paragraph [ref=e118]: 메시지
            - img [ref=e119]
        - listitem [ref=e122]:
          - button "설정" [ref=e123] [cursor=pointer]:
            - img [ref=e125]
            - paragraph [ref=e128]: 설정
            - img [ref=e129]
    - main [ref=e131]:
      - generic [ref=e132]:
        - heading "조직 관리" [level=5] [ref=e134]
        - button "조직 추가" [active] [ref=e136] [cursor=pointer]:
          - img [ref=e138]
          - text: 조직 추가
      - generic [ref=e140]:
        - generic [ref=e142]:
          - heading "조직 목록" [level=6] [ref=e143]
          - separator [ref=e144]
          - list [ref=e145]:
            - button "개발팀" [ref=e146] [cursor=pointer]:
              - generic [ref=e148]: 개발팀
              - button [ref=e149]:
                - img [ref=e150]
              - button [ref=e152]:
                - img [ref=e153]
            - button "브라우저테스트조직_1781233393629" [ref=e155] [cursor=pointer]:
              - generic [ref=e157]: 브라우저테스트조직_1781233393629
              - button [ref=e158]:
                - img [ref=e159]
              - button [ref=e161]:
                - img [ref=e162]
            - button "브라우저테스트조직_1781233478896" [ref=e164] [cursor=pointer]:
              - generic [ref=e166]: 브라우저테스트조직_1781233478896
              - button [ref=e167]:
                - img [ref=e168]
              - button [ref=e170]:
                - img [ref=e171]
            - button "브라우저테스트조직_1781233520096" [ref=e173] [cursor=pointer]:
              - generic [ref=e175]: 브라우저테스트조직_1781233520096
              - button [ref=e176]:
                - img [ref=e177]
              - button [ref=e179]:
                - img [ref=e180]
            - button "브라우저테스트조직_1781252455648" [ref=e182] [cursor=pointer]:
              - generic [ref=e184]: 브라우저테스트조직_1781252455648
              - button [ref=e185]:
                - img [ref=e186]
              - button [ref=e188]:
                - img [ref=e189]
            - button "직접테스트조직" [ref=e191] [cursor=pointer]:
              - generic [ref=e193]: 직접테스트조직
              - button [ref=e194]:
                - img [ref=e195]
              - button [ref=e197]:
                - img [ref=e198]
            - button "최종테스트조직" [ref=e200] [cursor=pointer]:
              - generic [ref=e202]: 최종테스트조직
              - button [ref=e203]:
                - img [ref=e204]
              - button [ref=e206]:
                - img [ref=e207]
            - button "테스트조직" [ref=e209] [cursor=pointer]:
              - generic [ref=e211]: 테스트조직
              - button [ref=e212]:
                - img [ref=e213]
              - button [ref=e215]:
                - img [ref=e216]
            - button "테스트조직" [ref=e218] [cursor=pointer]:
              - generic [ref=e220]: 테스트조직
              - button [ref=e221]:
                - img [ref=e222]
              - button [ref=e224]:
                - img [ref=e225]
            - button "개발팀_수정" [ref=e227] [cursor=pointer]:
              - generic [ref=e229]: 개발팀_수정
              - button [ref=e230]:
                - img [ref=e231]
              - button [ref=e233]:
                - img [ref=e234]
        - paragraph [ref=e238]: 좌측 목록에서 조직을 선택하면 상세 정보를 확인할 수 있습니다.
      - alert [ref=e239]:
        - img [ref=e241]
        - generic [ref=e243]: 조직이 추가되었습니다.
        - button "Close" [ref=e245] [cursor=pointer]:
          - img [ref=e246]
  - generic [ref=e248]:
    - img [ref=e250]
    - button "Open Tanstack query devtools" [ref=e298] [cursor=pointer]:
      - img [ref=e299]
  - alert [ref=e347]
  - button "Open Next.js Dev Tools" [ref=e353] [cursor=pointer]:
    - img [ref=e354]
```

# Test source

```ts
  25  | }
  26  | 
  27  | // ───────────────────────────────────────────────────────────────
  28  | // T1. 조직 관리
  29  | // ───────────────────────────────────────────────────────────────
  30  | test('T1. 조직 관리 - CRUD', async ({ page }) => {
  31  |   await login(page);
  32  |   await page.goto('/admin/organizations');
  33  |   await page.waitForLoadState('networkidle');
  34  |   await screenshot(page, 'T1-01-organizations-list');
  35  | 
  36  |   // 추가 버튼
  37  |   const addBtn = page.locator('button').filter({ hasText: '조직 추가' }).first();
  38  |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  39  |   await addBtn.click();
  40  |   await screenshot(page, 'T1-02-add-dialog');
  41  | 
  42  |   const dialog = page.locator('[role="dialog"]');
  43  |   await expect(dialog).toBeVisible({ timeout: 5000 });
  44  |   const nameInput = dialog.locator('input').first();
  45  |   await expect(nameInput).toBeVisible({ timeout: 5000 });
  46  |   await nameInput.fill('테스트조직');
  47  |   await screenshot(page, 'T1-03-filled-name');
  48  | 
  49  |   // 추가 버튼 클릭 → API POST /organizations
  50  |   const responsePromise = page.waitForResponse(
  51  |     resp => resp.url().includes('/organizations') && resp.request().method() === 'POST',
  52  |     { timeout: 10000 }
  53  |   );
  54  |   await dialog.locator('button').filter({ hasText: '추가' }).click();
  55  | 
  56  |   const resp = await responsePromise;
  57  |   const respBody = await resp.json().catch(() => ({}));
  58  |   await screenshot(page, 'T1-04-after-save-attempt');
  59  | 
  60  |   // BUG CHECK: API 400 에러 (parentId/approverId null 검증 실패)
  61  |   if (resp.status() === 400) {
  62  |     console.log('[T1 BUG] POST /organizations 400:', JSON.stringify(respBody));
  63  |     // 버그 확인 후 dialog 닫고 기존 조직으로 수정/삭제 테스트
  64  |     await dialog.locator('button').filter({ hasText: '취소' }).click();
  65  |     await page.waitForTimeout(500);
  66  | 
  67  |     // 기존 "개발팀" 조직으로 수정 테스트
  68  |     const existingOrgItem = page.locator('.MuiListItemButton-root').filter({ hasText: '개발팀' }).first();
  69  |     if (await existingOrgItem.isVisible({ timeout: 3000 })) {
  70  |       await existingOrgItem.hover();
  71  |       // 편집 버튼
  72  |       const editIconBtn = existingOrgItem.locator('button').first();
  73  |       if (await editIconBtn.isVisible({ timeout: 2000 })) {
  74  |         await editIconBtn.click();
  75  |         await screenshot(page, 'T1-05-edit-dialog-existing');
  76  |         const editDialog = page.locator('[role="dialog"]');
  77  |         const editInput = editDialog.locator('input').first();
  78  |         const currentValue = await editInput.inputValue();
  79  |         await editInput.fill('개발팀_수정');
  80  | 
  81  |         // 수정 응답 캡처
  82  |         const editRespPromise = page.waitForResponse(
  83  |           r => r.url().includes('/organizations') && r.request().method() === 'PATCH',
  84  |           { timeout: 10000 }
  85  |         );
  86  |         await editDialog.locator('button').filter({ hasText: '수정' }).click();
  87  |         const editResp = await editRespPromise;
  88  |         await screenshot(page, 'T1-06-after-update');
  89  |         expect(editResp.status()).toBe(200);
  90  | 
  91  |         // 원래 이름으로 복원
  92  |         await existingOrgItem.hover();
  93  |         const editIconBtn2 = page.locator('.MuiListItemButton-root').locator('button').first();
  94  |         if (await editIconBtn2.isVisible({ timeout: 2000 })) {
  95  |           await editIconBtn2.click();
  96  |           const editDialog2 = page.locator('[role="dialog"]');
  97  |           const editInput2 = editDialog2.locator('input').first();
  98  |           await editInput2.fill('개발팀');
  99  |           await editDialog2.locator('button').filter({ hasText: '수정' }).click();
  100 |           await page.waitForTimeout(500);
  101 |         }
  102 |       }
  103 | 
  104 |       // 삭제 테스트 (기존 조직)
  105 |       await existingOrgItem.hover();
  106 |       const deleteIconBtn = page.locator('.MuiListItemButton-root').locator('button').last();
  107 |       if (await deleteIconBtn.isVisible({ timeout: 2000 })) {
  108 |         await deleteIconBtn.click();
  109 |         await screenshot(page, 'T1-07-delete-confirm');
  110 |         const confirmDialog = page.locator('[role="dialog"]');
  111 |         if (await confirmDialog.isVisible({ timeout: 2000 })) {
  112 |           // 삭제 취소 (데이터 보존을 위해)
  113 |           await confirmDialog.locator('button').filter({ hasText: '취소' }).click();
  114 |           await screenshot(page, 'T1-08-delete-cancelled');
  115 |         }
  116 |       }
  117 |     }
  118 |     // T1은 API 버그로 인해 조직 추가가 실패함을 기록
  119 |     throw new Error(`[T1 FAIL] 조직 추가 API 버그: POST /organizations 400 - parentId/approverId null 검증 실패\n응답: ${JSON.stringify(respBody.error)}`);
  120 |   }
  121 | 
  122 |   // API 성공 시 정상 플로우
  123 |   await page.waitForLoadState('networkidle');
  124 |   await page.waitForTimeout(500);
> 125 |   await expect(page.getByText('테스트조직')).toBeVisible({ timeout: 10000 });
      |                                         ^ Error: expect(locator).toBeVisible() failed
  126 |   await screenshot(page, 'T1-04b-org-in-list');
  127 | 
  128 |   // 수정
  129 |   const orgItem = page.locator('.MuiListItemButton-root').filter({ hasText: '테스트조직' }).first();
  130 |   await orgItem.hover();
  131 |   const editIconBtn = orgItem.locator('button').first();
  132 |   if (await editIconBtn.isVisible({ timeout: 2000 })) {
  133 |     await editIconBtn.click();
  134 |     const editDialog = page.locator('[role="dialog"]');
  135 |     const editInput = editDialog.locator('input').first();
  136 |     await editInput.fill('테스트조직_수정');
  137 |     await editDialog.locator('button').filter({ hasText: '수정' }).click();
  138 |     await page.waitForTimeout(500);
  139 |     await screenshot(page, 'T1-06-after-update');
  140 |   }
  141 | 
  142 |   // 삭제
  143 |   const updatedItem = page.locator('.MuiListItemButton-root').filter({ hasText: /테스트조직/ }).first();
  144 |   await updatedItem.hover();
  145 |   const deleteIconBtn = updatedItem.locator('button').last();
  146 |   if (await deleteIconBtn.isVisible({ timeout: 2000 })) {
  147 |     await deleteIconBtn.click();
  148 |     await screenshot(page, 'T1-07-confirm-dialog');
  149 |     const confirmDialog = page.locator('[role="dialog"]');
  150 |     if (await confirmDialog.isVisible({ timeout: 2000 })) {
  151 |       await confirmDialog.locator('button').filter({ hasText: /삭제|확인/ }).last().click();
  152 |       await page.waitForTimeout(500);
  153 |       await screenshot(page, 'T1-08-after-delete');
  154 |     }
  155 |   }
  156 | });
  157 | 
  158 | // ───────────────────────────────────────────────────────────────
  159 | // T2. 직원 관리
  160 | // ───────────────────────────────────────────────────────────────
  161 | test('T2. 직원 관리 - 목록 및 상세', async ({ page }) => {
  162 |   await login(page);
  163 |   await page.goto('/admin/employees');
  164 |   await page.waitForLoadState('networkidle');
  165 |   await screenshot(page, 'T2-01-employees-list');
  166 | 
  167 |   // 직원 목록 테이블 확인
  168 |   await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
  169 |   await screenshot(page, 'T2-02-table-rendered');
  170 | 
  171 |   // 테이블 행 클릭 → 직원 상세로 이동
  172 |   const firstRow = page.locator('tbody tr').first();
  173 |   await expect(firstRow).toBeVisible({ timeout: 10000 });
  174 |   await firstRow.click();
  175 |   await page.waitForLoadState('networkidle');
  176 |   await page.waitForTimeout(1000);
  177 |   await screenshot(page, 'T2-03-employee-detail');
  178 | 
  179 |   // URL 확인 - /admin/employees/:id 로 이동
  180 |   await expect(page).toHaveURL(/\/admin\/employees\/[^/]+$/, { timeout: 10000 });
  181 | 
  182 |   // 직원 정보 로딩 대기 (오류가 없으면 탭이 나타남)
  183 |   // 오류가 있으면 error alert 표시
  184 |   const errorAlert = page.locator('[role="alert"]').filter({ hasText: '직원 정보를 찾을 수 없습니다' });
  185 |   const tabsContainer = page.locator('[role="tab"]').first();
  186 | 
  187 |   // 탭이 보이거나 에러가 보일 때까지 대기
  188 |   await page.waitForTimeout(2000);
  189 | 
  190 |   const hasError = await errorAlert.isVisible({ timeout: 1000 }).catch(() => false);
  191 |   if (hasError) {
  192 |     await screenshot(page, 'T2-03-employee-detail-api-error');
  193 |     // BUG: seed 직원 ID (seed-emp-001)가 UUID 형식이 아니어서 API 검증 실패
  194 |     throw new Error('[T2 FAIL] 직원 상세 API 버그: GET /employees/seed-emp-001 → 400 "Validation failed (uuid is expected)"\n시드 데이터의 직원 ID가 UUID 형식이 아닌 문자열 ID를 사용하여 API 검증에 실패합니다.');
  195 |   }
  196 | 
  197 |   // 탭 3개 확인 (기본정보, 근로정보, 기기)
  198 |   await expect(page.locator('[role="tab"]')).toHaveCount(3, { timeout: 8000 });
  199 |   const tabLabels = ['기본정보', '근로정보', '기기'];
  200 |   for (const tabLabel of tabLabels) {
  201 |     const tabEl = page.locator('[role="tab"]').filter({ hasText: tabLabel });
  202 |     await expect(tabEl).toBeVisible({ timeout: 5000 });
  203 |     await tabEl.click();
  204 |     await page.waitForLoadState('networkidle');
  205 |     await screenshot(page, `T2-04-tab-${tabLabel}`);
  206 |   }
  207 | });
  208 | 
  209 | // ───────────────────────────────────────────────────────────────
  210 | // T3. 직무 관리
  211 | // ───────────────────────────────────────────────────────────────
  212 | test('T3. 직무 관리 - CRUD', async ({ page }) => {
  213 |   await login(page);
  214 |   await page.goto('/admin/positions');
  215 |   await page.waitForLoadState('networkidle');
  216 |   await screenshot(page, 'T3-01-positions-list');
  217 | 
  218 |   // 추가
  219 |   const addBtn = page.locator('button').filter({ hasText: /직무 추가|추가|Add/ }).first();
  220 |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  221 |   await addBtn.click();
  222 |   await page.waitForLoadState('networkidle');
  223 |   await screenshot(page, 'T3-02-add-dialog');
  224 | 
  225 |   const nameInput = page.locator('input[name="name"], input[placeholder*="이름"], input[placeholder*="직무"]').first();
```