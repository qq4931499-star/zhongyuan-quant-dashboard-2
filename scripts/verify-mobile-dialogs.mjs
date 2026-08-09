import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".metric-card").first().waitFor({ state: "visible", timeout: 20000 });

  const assertDialog = async (dialog, expectedShortcutCount) => {
    const result = await dialog.evaluate((element, shortcutCount) => {
      const close = element.querySelector('[data-slot="dialog-close"]');
      const footer = element.querySelector('[data-slot="dialog-footer"]');
      const buttons = Array.from(element.querySelectorAll('[data-slot="dialog-footer"] button'));
      const shortcuts = element.querySelectorAll('.report-date-shortcuts button, .export-count-shortcuts button');
      if (!close || !footer || buttons.length !== 2) throw new Error("弹窗操作控件缺失");
      const rect = element.getBoundingClientRect();
      const closeRect = close.getBoundingClientRect();
      const buttonRects = buttons.map(button => button.getBoundingClientRect());
      const safe = rect.left >= 10 && rect.right <= window.innerWidth - 10 && rect.top >= 10 && rect.bottom <= window.innerHeight - 10 && closeRect.right <= rect.right - 8 && closeRect.top >= rect.top + 8 && buttonRects.every(button => button.height >= 44 && button.width >= 100) && shortcuts.length >= shortcutCount;
      return { safe, width: Math.round(rect.width), closeWidth: Math.round(closeRect.width), buttonSizes: buttonRects.map(button => [Math.round(button.width), Math.round(button.height)]), shortcutCount: shortcuts.length };
    }, expectedShortcutCount);
    if (!result.safe) throw new Error(`390px 弹窗布局异常：${JSON.stringify(result)}`);
    return result;
  };

  await page.getByRole("button", { name: "策略汇总海报" }).click();
  const exportDialog = page.locator(".export-options-dialog");
  await exportDialog.waitFor({ state: "visible", timeout: 10000 });
  const exportLayout = await assertDialog(exportDialog, 3);
  await exportDialog.getByRole("button", { name: "取消" }).click();
  await exportDialog.waitFor({ state: "hidden", timeout: 5000 });

  await page.getByRole("button", { name: "买票战报" }).click();
  const reportDialog = page.locator(".report-dialog").filter({ hasText: "导出买票战报" });
  await reportDialog.waitFor({ state: "visible", timeout: 10000 });
  const reportLayout = await assertDialog(reportDialog, 2);
  await reportDialog.locator('[data-slot="dialog-close"]').click();
  await reportDialog.waitFor({ state: "hidden", timeout: 5000 });

  console.log(JSON.stringify({ exportLayout, reportLayout }));
} finally {
  await browser.close();
}
