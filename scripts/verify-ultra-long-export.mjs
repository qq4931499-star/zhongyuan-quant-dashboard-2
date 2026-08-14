import { chromium } from "playwright";

const TARGET_ROWS = 500;
const EXPORT_CAPTURE_BOTTOM_GUARD_PX = 72;

function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("下载文件不是 PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });

async function addSyntheticRows(stageId) {
  return page.evaluate(({ id, targetRows, guard }) => {
    const stage = document.getElementById(id);
    const body = stage?.querySelector("tbody");
    const sourceRows = body ? Array.from(body.querySelectorAll("tr")) : [];
    if (!stage || !body || sourceRows.length === 0) throw new Error(`未找到 ${id} 的导出明细`);
    const fragment = document.createDocumentFragment();
    for (let index = sourceRows.length; index < targetRows; index += 1) {
      const clone = sourceRows[index % sourceRows.length].cloneNode(true);
      const firstCell = clone.querySelector("td");
      if (firstCell) firstCell.textContent = String(index + 1).padStart(2, "0");
      fragment.appendChild(clone);
    }
    body.appendChild(fragment);
    const footer = stage.querySelector("footer");
    const stageBounds = stage.getBoundingClientRect();
    const footerBottom = footer ? footer.getBoundingClientRect().bottom - stageBounds.top : 0;
    return { rows: body.querySelectorAll("tr").length, footerBottom, contentHeight: Math.ceil(Math.max(stage.scrollHeight, stage.offsetHeight, footerBottom) + guard) };
  }, { id: stageId, targetRows: TARGET_ROWS, guard: EXPORT_CAPTURE_BOTTOM_GUARD_PX });
}

async function exportStage(target, stageId, buttonName) {
  await page.getByRole("button", { name: buttonName }).click();
  await page.getByLabel("弹窗导出明细数量").fill("全部");
  const source = await addSyntheticRows(stageId);
  if (source.rows !== TARGET_ROWS) throw new Error(`${target}模拟长表格失败：${source.rows} 行`);
  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "确认导出" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const png = pngSize(Buffer.concat(chunks));
  const cloneMetrics = await page.evaluate((id) => {
    const stage = document.getElementById(id);
    return {
      captureHeight: Number(stage?.dataset.exportCaptureHeight ?? 0),
      contentBottom: Number(stage?.dataset.exportCloneContentBottom ?? 0),
      footerBottom: Number(stage?.dataset.exportCloneFooterBottom ?? 0),
    };
  }, stageId);
  if (png.width !== 1080 || png.height < source.contentHeight || png.height < source.footerBottom) {
    throw new Error(`${target}极长导出高度不足：PNG ${png.width}×${png.height}，内容 ${source.contentHeight}，页脚 ${source.footerBottom}`);
  }
  if (!cloneMetrics.captureHeight || !cloneMetrics.contentBottom || !cloneMetrics.footerBottom) throw new Error(`${target}极长导出未记录克隆边界`);
  if (cloneMetrics.contentBottom + EXPORT_CAPTURE_BOTTOM_GUARD_PX > png.height || cloneMetrics.footerBottom + EXPORT_CAPTURE_BOTTOM_GUARD_PX > png.height) throw new Error(`${target}极长克隆边界超出 PNG：${JSON.stringify({ cloneMetrics, png })}`);
  return { target, source, cloneMetrics, png };
}

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".trade-table tbody tr").first().waitFor({ state: "visible", timeout: 20000 });
  const marketing = await exportStage("营销图", "marketing-export", "导出营销图");
  const strategy = await exportStage("策略汇总海报", "strategy-poster", "策略汇总海报");
  console.log(JSON.stringify({ verified: true, targetRows: TARGET_ROWS, marketing, strategy }));
} finally {
  await browser.close();
}
