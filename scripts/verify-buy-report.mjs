import { chromium } from "playwright";
import { copyFile, readFile, rm } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const firstBuyDate = await page.locator('input[aria-label*="买入日期"]').first().inputValue();
  await page.getByRole("button", { name: "买票战报" }).click();
  const dialog = page.locator(".report-dialog");
  await dialog.waitFor({ state: "visible", timeout: 20000 });
  const dialogLayout = await dialog.evaluate((element) => {
    const close = element.querySelector('[data-slot="dialog-close"]');
    const footer = element.querySelector('[data-slot="dialog-footer"]');
    const buttons = Array.from(element.querySelectorAll('[data-slot="dialog-footer"] button'));
    if (!close || !footer || buttons.length !== 2) throw new Error("买票战报弹窗关键操作控件缺失");
    const rect = element.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    const buttonRects = buttons.map(button => button.getBoundingClientRect());
    const safe = rect.left >= 10 && rect.right <= window.innerWidth - 10 && rect.top >= 10 && rect.bottom <= window.innerHeight - 10 && closeRect.right <= rect.right - 10 && closeRect.top >= rect.top + 10 && buttonRects.every(button => button.height >= 44);
    return { safe, closeWidth: Math.round(closeRect.width), buttonHeights: buttonRects.map(button => Math.round(button.height)) };
  });
  if (!dialogLayout.safe) throw new Error(`买票战报弹窗布局异常：${JSON.stringify(dialogLayout)}`);
  const shortcutCount = await dialog.locator(".report-date-shortcuts button").count();
  if (shortcutCount < 2) throw new Error("买票战报缺少日期快捷选项");
  await dialog.locator('input[type="date"]').fill(firstBuyDate);
  await page.locator("#buy-report .buy-report-card").first().waitFor({ state: "attached", timeout: 5000 });
  const logicIcons = await page.locator("#buy-report .buy-report-logic article svg").count();
  if (logicIcons !== 4) throw new Error(`选股逻辑图标数量异常：${logicIcons}`);
  const iconLayout = await page.locator("#buy-report .buy-report-logic").evaluate((logic) => {
    const logicRect = logic.getBoundingClientRect();
    return Array.from(logic.querySelectorAll("article")).map((article, index) => {
      const icon = article.querySelector("svg");
      if (!icon) throw new Error(`第 ${index + 1} 个选股逻辑图标缺失`);
      const cardRect = article.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const safe = iconRect.width >= 60 && iconRect.height >= 60 && iconRect.left >= cardRect.left + 8 && iconRect.right <= cardRect.right - 8 && iconRect.top >= cardRect.top + 8 && iconRect.bottom <= cardRect.bottom - 8 && cardRect.left >= logicRect.left && cardRect.right <= logicRect.right;
      return { index, safe, iconWidth: Math.round(iconRect.width), iconHeight: Math.round(iconRect.height) };
    });
  });
  if (iconLayout.some(icon => !icon.safe)) throw new Error(`选股逻辑图标尺寸或裁切异常：${JSON.stringify(iconLayout)}`);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    dialog.getByRole("button", { name: "导出战报" }).click(),
  ]);
  const filePath = await download.path();
  if (!filePath) throw new Error("未获得买票战报下载文件");
  const bytes = await readFile(filePath);
  if (bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("买票战报不是 PNG 文件");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 1080 || height < 900) throw new Error(`买票战报尺寸异常：${width}×${height}`);
  if (process.env.BUY_REPORT_VERIFY_OUTPUT) await copyFile(filePath, process.env.BUY_REPORT_VERIFY_OUTPUT);
  await rm(filePath, { force: true });

  const layouts = await page.locator("#buy-report").evaluate((report) => {
    const grid = report.querySelector(".buy-report-grid");
    const card = grid?.querySelector(".buy-report-card");
    if (!grid || !card) throw new Error("买票战报标的卡片缺失");
    return [1, 2, 3, 4].map(count => {
      grid.className = `buy-report-grid buy-report-count-${count}`;
      while (grid.querySelectorAll(".buy-report-card").length < count) grid.appendChild(card.cloneNode(true));
      while (grid.querySelectorAll(".buy-report-card").length > count) grid.lastElementChild?.remove();
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      return { count, columns };
    });
  });
  const expected = [1, 2, 3, 2];
  if (layouts.some((layout, index) => layout.columns !== expected[index])) throw new Error(`买票战报标的布局异常：${JSON.stringify(layouts)}`);
  console.log(JSON.stringify({ fileName: download.suggestedFilename(), width, height, layouts, iconLayout, dialogLayout }));
} finally {
  await browser.close();
}
