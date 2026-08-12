import { chromium } from "playwright";
import { copyFile, readFile, rm } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".metric-card").first().waitFor({ state: "visible", timeout: 20000 });
  const returnLabels = await page.evaluate(() => ({
    page: document.querySelector(".page-grid > .trend-panel .final-return span")?.textContent?.trim(),
    marketing: document.querySelector("#marketing-export .export-footer strong")?.textContent?.trim(),
    strategy: Array.from(document.querySelectorAll("#strategy-poster .poster-metric")).find(card => card.querySelector("span")?.textContent?.trim() === "累计收益")?.querySelector("span")?.textContent?.trim(),
    hasFinal: document.body.textContent?.includes("FINAL") ?? false,
    pageMetricDetails: document.querySelectorAll(".metrics-section .metric-card small").length,
    marketingMetricDetails: document.querySelectorAll("#marketing-export .metric-card small").length,
  }));
  if (returnLabels.page !== "总收益率" || !returnLabels.marketing?.startsWith("总收益率 ") || returnLabels.strategy !== "累计收益" || returnLabels.hasFinal || returnLabels.pageMetricDetails !== 0 || returnLabels.marketingMetricDetails !== 0) throw new Error(`收益率标签或指标卡说明文案异常：${JSON.stringify(returnLabels)}`);
  const verifyMetricCardLayout = async selector => page.locator(selector).evaluateAll(cards => {
    const measurements = cards.map(card => {
      const cardRect = card.getBoundingClientRect();
      const heading = card.querySelector(".metric-card-top");
      const value = card.querySelector("strong");
      if (!heading || !value) throw new Error("指标卡关键结构缺失");
      const headingRect = heading.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      const groupTop = headingRect.top - cardRect.top;
      const groupBottom = valueRect.bottom - cardRect.top;
      const groupCenterOffset = (groupTop + groupBottom) / 2 - cardRect.height / 2;
      const inside = valueRect.left >= cardRect.left + 16 && valueRect.right <= cardRect.right - 16 && valueRect.top > headingRect.bottom + 12 && valueRect.bottom <= cardRect.bottom - 16;
      const centered = Math.abs(groupCenterOffset) <= 8 && getComputedStyle(value).textAlign === "center" && getComputedStyle(heading).justifyContent === "center";
      return { left: Math.round(cardRect.left), right: Math.round(cardRect.right), width: Math.round(cardRect.width), height: Math.round(cardRect.height), valueTop: Math.round(valueRect.top - cardRect.top), valueBottom: Math.round(valueRect.bottom - cardRect.top), groupCenterOffset: Math.round(groupCenterOffset), inside, centered, hasDetail: Boolean(card.querySelector("small")) };
    });
    const reference = measurements[0];
    const gaps = measurements.slice(1).map((metric, index) => metric.left - measurements[index].right);
    const consistentGaps = gaps.length === 3 && gaps.every(gap => gap >= 12 && Math.abs(gap - gaps[0]) <= 1);
    const aligned = measurements.length === 4 && Boolean(reference) && consistentGaps && measurements.every(metric => metric.inside && metric.centered && !metric.hasDetail && Math.abs(metric.height - reference.height) <= 1 && Math.abs(metric.valueBottom - reference.valueBottom) <= 2);
    return { aligned, gaps, measurements };
  });
  const metricLayouts = {
    page: await verifyMetricCardLayout(".metrics-section .metric-card"),
    marketing: await verifyMetricCardLayout("#marketing-export .metric-card"),
  };
  if (!metricLayouts.page.aligned || !metricLayouts.marketing.aligned) throw new Error(`指标卡移除说明文字后布局不稳定：${JSON.stringify(metricLayouts)}`);
  const downloadAndVerify = async (buttonName, minHeight, maxHeight, outputPath) => {
    await page.getByRole("button", { name: buttonName }).click();
    const dialog = page.locator(".export-options-dialog");
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    const dialogLayout = await dialog.evaluate((element) => {
      const overlay = document.querySelector('[data-slot="dialog-overlay"]');
      const close = element.querySelector('[data-slot="dialog-close"]');
      const footer = element.querySelector('[data-slot="dialog-footer"]');
      const buttons = Array.from(element.querySelectorAll('[data-slot="dialog-footer"] button'));
      const selectedShortcut = element.querySelector('.export-count-shortcuts button.active');
      if (!close || !footer || buttons.length !== 2 || !selectedShortcut) throw new Error("导出设置弹窗关键操作控件缺失");
      const style = getComputedStyle(element);
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      const rect = element.getBoundingClientRect();
      const closeRect = close.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const buttonRects = buttons.map(button => button.getBoundingClientRect());
      const safe = rect.left >= 10 && rect.right <= window.innerWidth - 10 && rect.top >= 10 && rect.bottom <= window.innerHeight - 10 && closeRect.right <= rect.right - 10 && closeRect.top >= rect.top + 10 && footerRect.top > rect.top + rect.height * .5 && buttonRects.every(button => button.height >= 44);
      return { position: style.position, zIndex: style.zIndex, top: rect.top, overlayPosition: overlayStyle?.position, overlayZIndex: overlayStyle?.zIndex, safe, buttonHeights: buttonRects.map(button => Math.round(button.height)) };
    });
    if (dialogLayout.position !== "fixed" || dialogLayout.overlayPosition !== "fixed" || Number(dialogLayout.zIndex) < 1001 || Number(dialogLayout.overlayZIndex) < 1000 || !dialogLayout.safe) throw new Error(`导出设置弹窗布局或层级异常：${JSON.stringify(dialogLayout)}`);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      dialog.getByRole("button", { name: "确认导出" }).click(),
    ]);
    const filePath = await download.path();
    if (!filePath) throw new Error("未获得下载文件路径");
    const bytes = await readFile(filePath);
    if (bytes.length < 10_000) throw new Error(`PNG 文件过小：${bytes.length} bytes`);
    if (bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("下载文件不是 PNG");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width !== 1080 || height < minHeight || height > maxHeight) throw new Error(`PNG 尺寸异常：${width}×${height}`);
    if (outputPath) await copyFile(filePath, outputPath);
    await rm(filePath, { force: true });
    return { fileName: download.suggestedFilename(), byteLength: bytes.length, width, height };
  };
  const marketing = await downloadAndVerify("导出营销图", 900, 1450, process.env.EXPORT_VERIFY_OUTPUT);
  const poster = await downloadAndVerify("策略汇总海报", 900, 1500, process.env.POSTER_VERIFY_OUTPUT);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMetricLayout = await page.locator(".metrics-section .metric-card").evaluateAll(cards => {
    const measurements = cards.map(card => {
      const cardRect = card.getBoundingClientRect();
      const heading = card.querySelector(".metric-card-top");
      const value = card.querySelector("strong");
      if (!heading || !value) throw new Error("移动端指标卡关键结构缺失");
      const headingRect = heading.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      const groupCenterOffset = ((headingRect.top - cardRect.top) + (valueRect.bottom - cardRect.top)) / 2 - cardRect.height / 2;
      return { left: Math.round(cardRect.left), top: Math.round(cardRect.top), right: Math.round(cardRect.right), bottom: Math.round(cardRect.bottom), width: Math.round(cardRect.width), height: Math.round(cardRect.height), groupCenterOffset: Math.round(groupCenterOffset), safe: Math.abs(groupCenterOffset) <= 8 && valueRect.left >= cardRect.left + 8 && valueRect.right <= cardRect.right - 8 };
    });
    const firstRowGap = measurements[1].left - measurements[0].right;
    const secondRowGap = measurements[3].left - measurements[2].right;
    const rowGap = measurements[2].top - measurements[0].bottom;
    const valid = measurements.length === 4 && measurements.every(metric => metric.safe && Math.abs(metric.height - measurements[0].height) <= 1) && Math.abs(firstRowGap - secondRowGap) <= 1 && firstRowGap >= 10 && rowGap >= 10 && Math.abs(measurements[0].top - measurements[1].top) <= 1 && Math.abs(measurements[2].top - measurements[3].top) <= 1;
    return { valid, firstRowGap, secondRowGap, rowGap, measurements };
  });
  if (!mobileMetricLayout.valid) throw new Error(`移动端月度关键指标卡居中或间距异常：${JSON.stringify(mobileMetricLayout)}`);
  console.log(JSON.stringify({ returnLabels, metricLayouts, mobileMetricLayout, marketing, poster }));
} finally {
  await browser.close();
}
