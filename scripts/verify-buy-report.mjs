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
  await dialog.locator('input[type="date"]').fill(firstBuyDate);
  await page.locator("#buy-report .buy-report-card").first().waitFor({ state: "attached", timeout: 5000 });
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
  console.log(JSON.stringify({ fileName: download.suggestedFilename(), width, height, layouts }));
} finally {
  await browser.close();
}
