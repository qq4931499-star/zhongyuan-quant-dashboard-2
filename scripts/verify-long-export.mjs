import { chromium } from "playwright";

const EXPORT_CAPTURE_BOTTOM_GUARD_PX = 72;

function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("下载文件不是 PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });

async function inspectStage(stageId) {
  return page.evaluate(({ id, guard }) => {
    const stage = document.getElementById(id);
    const footer = stage?.querySelector("footer");
    const tableRows = stage?.querySelectorAll("tbody tr").length ?? 0;
    if (!(stage instanceof HTMLElement) || !(footer instanceof HTMLElement)) throw new Error(`缺少 ${id} 导出画布或页脚`);
    const stageBounds = stage.getBoundingClientRect();
    const footerBottom = footer.getBoundingClientRect().bottom - stageBounds.top;
    return {
      rows: tableRows,
      contentHeight: Math.ceil(Math.max(stage.scrollHeight, stage.offsetHeight, footerBottom) + guard),
      footerBottom,
    };
  }, { id: stageId, guard: EXPORT_CAPTURE_BOTTOM_GUARD_PX });
}

async function downloadAll(target, stageId, buttonName) {
  await page.getByRole("button", { name: buttonName }).click();
  const quantity = page.getByLabel("弹窗导出明细数量");
  await quantity.fill("全部");
  const metrics = await inspectStage(stageId);
  const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "确认导出" }).click();
  const download = await downloadPromise;
  if (process.env.LONG_EXPORT_OUTPUT_DIR) await download.saveAs(`${process.env.LONG_EXPORT_OUTPUT_DIR}/${target}.png`);
  const bytes = await download.createReadStream().then(async stream => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  });
  const dimensions = pngSize(bytes);
  const cloneMetrics = await page.evaluate((id) => {
    const stage = document.getElementById(id);
    return {
      captureHeight: Number(stage?.dataset.exportCaptureHeight ?? 0),
      contentBottom: Number(stage?.dataset.exportCloneContentBottom ?? 0),
      footerBottom: Number(stage?.dataset.exportCloneFooterBottom ?? 0),
    };
  }, stageId);
  if (metrics.rows < 20) throw new Error(`${target}未覆盖长交易明细场景，当前仅 ${metrics.rows} 条`);
  if (dimensions.width !== 1080) throw new Error(`${target}导出宽度异常：${dimensions.width}`);
  if (dimensions.height < metrics.footerBottom || dimensions.height < metrics.contentHeight) throw new Error(`${target}导出高度不足：PNG ${dimensions.height}px，页脚底部 ${metrics.footerBottom}px，内容 ${metrics.contentHeight}px`);
  if (!cloneMetrics.captureHeight || !cloneMetrics.contentBottom || !cloneMetrics.footerBottom) throw new Error(`${target}未记录克隆画布边界`);
  if (cloneMetrics.contentBottom + EXPORT_CAPTURE_BOTTOM_GUARD_PX > dimensions.height || cloneMetrics.footerBottom + EXPORT_CAPTURE_BOTTOM_GUARD_PX > dimensions.height) throw new Error(`${target}克隆画布边界超出 PNG：${JSON.stringify({ cloneMetrics, png: dimensions })}`);
  return { target, ...metrics, cloneMetrics, png: dimensions, bytes: bytes.length, fileName: download.suggestedFilename() };
}

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".trade-table tbody tr").first().waitFor({ state: "visible", timeout: 20000 });
  const marketing = await downloadAll("营销图", "marketing-export", "导出营销图");
  const strategy = await downloadAll("策略汇总海报", "strategy-poster", "策略汇总海报");
  console.log(JSON.stringify({ verified: true, marketing, strategy }));
} finally {
  await browser.close();
}
