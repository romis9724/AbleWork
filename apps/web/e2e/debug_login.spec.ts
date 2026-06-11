import { test, expect } from '@playwright/test';

test('debug login DOM', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');

  // Dump all input elements
  const inputs = await page.$$eval('input', (els) =>
    els.map((el) => ({
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      autocomplete: el.autocomplete,
      class: el.className.substring(0, 80),
    }))
  );
  console.log('INPUTS:', JSON.stringify(inputs, null, 2));

  // Dump all buttons
  const buttons = await page.$$eval('button', (els) =>
    els.map((el) => ({
      type: el.type,
      text: el.textContent?.trim().substring(0, 50),
      class: el.className.substring(0, 80),
    }))
  );
  console.log('BUTTONS:', JSON.stringify(buttons, null, 2));

  // Try to fill email input (MUI uses label-based inputs)
  const emailInput = page.locator('input[type="email"]');
  const emailCount = await emailInput.count();
  console.log('Email inputs count:', emailCount);

  // Try by label
  const emailLabel = page.getByLabel('이메일');
  const emailLabelCount = await emailLabel.count();
  console.log('Email by label count:', emailLabelCount);

  if (emailLabelCount > 0) {
    await emailLabel.fill('admin@ablework.io');
    const passwordLabel = page.getByLabel('비밀번호');
    await passwordLabel.fill('admin1234!');
    await page.screenshot({ path: 'e2e/screenshots/debug_filled.png', fullPage: true });

    const submitBtn = page.locator('button[type="submit"]');
    console.log('Submit buttons:', await submitBtn.count());
    await submitBtn.click();

    // Wait for navigation with longer timeout
    await page.waitForURL(/\/(admin|me)\//, { timeout: 10000 }).catch(() => {
      console.log('No redirect, current URL:', page.url());
    });
    await page.waitForLoadState('networkidle');
    console.log('FINAL URL:', page.url());
    await page.screenshot({ path: 'e2e/screenshots/debug_after_login.png', fullPage: true });
  }
});
