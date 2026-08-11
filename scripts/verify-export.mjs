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
  }));
  if (returnLabels.page !== "总收益率" || !returnLabels.marketing?.startsWith("总收益率 ") || returnLabels.strategy !== "累计收益" || returnLabels.hasFinal) throw new Error(`收益率标签文案异常：${JSON.stringify(returnLabels)}`);
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
  console.log(JSON.stringify({ returnLabels, marketing, poster }));
} finally {
  await browser.close();
}
