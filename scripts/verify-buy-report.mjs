import { chromium } from "playwright";
import { copyFile, readFile, rm } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const firstBuyDate = (await page.locator('input[aria-label*="买入时间"]').first().inputValue()).slice(0, 10);
  const selectionIndices = [0, 2, 4];
  const selectedSymbols = await page.locator(".trade-table tbody tr").evaluateAll((rows, indices) => indices.map(index => rows[index]?.querySelector(".symbol-input")?.value).filter(Boolean), selectionIndices);
  for (const index of selectionIndices) await page.locator(".report-select-input").nth(index).check();
  await page.getByRole("button", { name: "今日策略战报" }).click();
  const dialog = page.locator(".report-dialog");
  await dialog.waitFor({ state: "visible", timeout: 20000 });
  if (!(await dialog.getByText(`将优先使用交易明细中已勾选的 ${selectionIndices.length} 条记录`).count())) throw new Error("今日策略战报未提示手动勾选优先规则");
  const dialogLayout = await dialog.evaluate((element) => {
    const close = element.querySelector('[data-slot="dialog-close"]');
    const footer = element.querySelector('[data-slot="dialog-footer"]');
    const buttons = Array.from(element.querySelectorAll('[data-slot="dialog-footer"] button'));
    if (!close || !footer || buttons.length !== 2) throw new Error("今日策略战报弹窗关键操作控件缺失");
    const rect = element.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    const buttonRects = buttons.map(button => button.getBoundingClientRect());
    const safe = rect.left >= 10 && rect.right <= window.innerWidth - 10 && rect.top >= 10 && rect.bottom <= window.innerHeight - 10 && closeRect.right <= rect.right - 10 && closeRect.top >= rect.top + 10 && buttonRects.every(button => button.height >= 44);
    return { safe, closeWidth: Math.round(closeRect.width), buttonHeights: buttonRects.map(button => Math.round(button.height)) };
  });
  if (!dialogLayout.safe) throw new Error(`今日策略战报弹窗布局异常：${JSON.stringify(dialogLayout)}`);
  const shortcutCount = await dialog.locator(".report-date-shortcuts button").count();
  if (shortcutCount < 2) throw new Error("今日策略战报缺少日期快捷选项");
  await dialog.locator('input[type="date"]').fill(firstBuyDate);
  await page.locator("#buy-report .buy-report-card").first().waitFor({ state: "attached", timeout: 5000 });
  const reportSymbols = await page.locator("#buy-report .buy-report-card h2 small").evaluateAll(nodes => nodes.map(node => node.textContent?.replace("/", "").trim()));
  if (JSON.stringify(reportSymbols) !== JSON.stringify(selectedSymbols)) throw new Error(`今日策略战报未按手动勾选记录生成：${JSON.stringify({ selectedSymbols, reportSymbols })}`);
  const reportContract = await page.locator("#buy-report").evaluate(report => ({
    title: report.querySelector(".buy-report-header h1")?.textContent?.trim(),
    cardBadges: report.querySelectorAll(".buy-report-badge").length,
    logicTitle: report.querySelector(".buy-report-logic > span")?.textContent?.trim() ?? "",
    buyTime: report.querySelector(".buy-report-card dl div:nth-child(2) dd")?.textContent?.trim(),
    hasFinal: report.textContent?.includes("FINAL") ?? false,
  }));
  if (reportContract.title !== "今日策略战报" || reportContract.cardBadges !== 0 || reportContract.logicTitle || reportContract.hasFinal || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(reportContract.buyTime ?? "")) throw new Error(`今日策略战报标题、卡片、分钟时间或 FINAL 文案异常：${JSON.stringify(reportContract)}`);
  const profitContract = await page.locator("#buy-report .buy-report-card").evaluateAll(cards => cards.map(card => {
    const rows = Array.from(card.querySelectorAll("dl div"));
    const profitRow = rows.find(row => row.querySelector("dt")?.textContent?.trim() === "收益率");
    const value = profitRow?.querySelector("dd")?.textContent?.trim() ?? "";
    const safe = rows.length === 5 && (value === "-----" || /^-?\d+(\.\d+)?%$/.test(value));
    return { safe, rowCount: rows.length, value };
  }));
  if (profitContract.some(item => !item.safe)) throw new Error(`今日策略战报收益率字段异常：${JSON.stringify(profitContract)}`);
  const cardTextLayout = await page.locator("#buy-report .buy-report-card").evaluateAll(cards => cards.map((card, index) => {
    const cardRect = card.getBoundingClientRect();
    const name = card.querySelector("h2");
    const code = card.querySelector("h2 small");
    const rows = Array.from(card.querySelectorAll("dl div"));
    if (!name || !code || rows.length !== 5) throw new Error(`第 ${index + 1} 张标的卡文字结构缺失`);
    const rects = [name, code, ...rows.flatMap(row => [row.querySelector("dt"), row.querySelector("dd")])].map(node => node?.getBoundingClientRect());
    const validRects = rects.filter(Boolean);
    const inside = validRects.length === 12 && validRects.every(rect => rect.left >= cardRect.left + 12 && rect.right <= cardRect.right - 12 && rect.top >= cardRect.top + 12 && rect.bottom <= cardRect.bottom - 12);
    const textNodes = [name, code, ...rows.flatMap(row => [row.querySelector("dt"), row.querySelector("dd")])];
    const overflowFields = textNodes.map((node, textIndex) => node && ({ textIndex, text: node.textContent?.trim(), width: Math.round(node.clientWidth), scrollWidth: Math.round(node.scrollWidth) })).filter(field => field && field.scrollWidth > field.width);
    const noOverflow = overflowFields.length === 0;
    const fieldGaps = rows.every(row => {
        const label = row.querySelector("dt");
        const value = row.querySelector("dd");
        return Boolean(label && value && label.getBoundingClientRect().right + 6 <= value.getBoundingClientRect().left);
      });
    const safe = inside && noOverflow && fieldGaps;
    return { index, safe, inside, noOverflow, fieldGaps, overflowFields, cardWidth: Math.round(cardRect.width), nameWidth: Math.round(name.getBoundingClientRect().width), codeWidth: Math.round(code.getBoundingClientRect().width) };
  }));
  if (cardTextLayout.some(card => !card.safe)) throw new Error(`今日策略战报放大文字存在换行、重叠或越界：${JSON.stringify(cardTextLayout)}`);
  const logicIcons = await page.locator("#buy-report .buy-report-logic article svg").count();
  if (logicIcons !== 4) throw new Error(`选股逻辑图标数量异常：${logicIcons}`);
  const iconLayout = await page.locator("#buy-report .buy-report-logic").evaluate((logic) => {
    const logicRect = logic.getBoundingClientRect();
    return Array.from(logic.querySelectorAll("article")).map((article, index) => {
      const iconFrame = article.querySelector(".buy-report-logic-icon");
      const icon = iconFrame?.querySelector("svg");
      if (!iconFrame || !icon) throw new Error(`第 ${index + 1} 个选股逻辑图标缺失`);
      const cardRect = article.getBoundingClientRect();
      const frameRect = iconFrame.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const safe = frameRect.width >= 92 && frameRect.height >= 92 && iconRect.width >= 68 && iconRect.height >= 68 && frameRect.left >= cardRect.left + 14 && frameRect.right <= cardRect.right - 14 && frameRect.top >= cardRect.top + 14 && frameRect.bottom <= cardRect.bottom - 14 && icon.getAttribute("viewBox") === "-2 -2 28 28" && cardRect.left >= logicRect.left && cardRect.right <= logicRect.right;
      return { index, safe, frameWidth: Math.round(frameRect.width), frameHeight: Math.round(frameRect.height), iconWidth: Math.round(iconRect.width), iconHeight: Math.round(iconRect.height), viewBox: icon.getAttribute("viewBox") };
    });
  });
  if (iconLayout.some(icon => !icon.safe)) throw new Error(`选股逻辑图标尺寸或裁切异常：${JSON.stringify(iconLayout)}`);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    dialog.getByRole("button", { name: "导出战报" }).click(),
  ]);
  const filePath = await download.path();
  if (!filePath) throw new Error("未获得今日策略战报下载文件");
  const bytes = await readFile(filePath);
  if (bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("今日策略战报不是 PNG 文件");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 1080 || height < 900) throw new Error(`今日策略战报尺寸异常：${width}×${height}`);
  if (process.env.BUY_REPORT_VERIFY_OUTPUT) await copyFile(filePath, process.env.BUY_REPORT_VERIFY_OUTPUT);
  await rm(filePath, { force: true });

  const layouts = await page.locator("#buy-report").evaluate((report) => {
    const grid = report.querySelector(".buy-report-grid");
    const card = grid?.querySelector(".buy-report-card");
    if (!grid || !card) throw new Error("今日策略战报标的卡片缺失");
    return [1, 2, 3, 4].map(count => {
      grid.className = `buy-report-grid buy-report-count-${count}`;
      while (grid.querySelectorAll(".buy-report-card").length < count) grid.appendChild(card.cloneNode(true));
      while (grid.querySelectorAll(".buy-report-card").length > count) grid.lastElementChild?.remove();
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      return { count, columns };
    });
  });
  const expected = [1, 2, 3, 2];
  if (layouts.some((layout, index) => layout.columns !== expected[index])) throw new Error(`今日策略战报标的布局异常：${JSON.stringify(layouts)}`);
  console.log(JSON.stringify({ fileName: download.suggestedFilename(), width, height, layouts, iconLayout, dialogLayout, reportContract, profitContract, cardTextLayout, selectedSymbols, reportSymbols }));
} finally {
  await browser.close();
}
