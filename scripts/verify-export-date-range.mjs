import { chromium } from "playwright";

function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("下载文件不是 PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });

async function inspectRange(expectedStart, expectedEnd, allowEmpty = false) {
  const result = await page.evaluate(() => {
    const getDates = id => Array.from(document.querySelectorAll(`#${id} tbody tr`)).map(row => row.dataset.buyDate ?? "");
    return {
      marketingDates: getDates("marketing-export"),
      strategyDates: getDates("strategy-poster"),
      marketingPeriod: document.querySelector("#marketing-export time")?.textContent?.trim() ?? "",
      strategyPeriod: document.querySelector("#strategy-poster .poster-period strong")?.textContent?.trim() ?? "",
      marketingTotal: document.querySelector("#marketing-export .export-table-title span:last-child")?.textContent?.trim() ?? "",
    };
  });
  const actualDates = [...result.marketingDates, ...result.strategyDates].map(date => date.slice(0, 10)).sort();
  const resolvedStart = expectedStart ?? actualDates[0];
  const resolvedEnd = expectedEnd ?? actualDates.at(-1);
  const inRange = date => date.slice(0, 10) >= resolvedStart && date.slice(0, 10) <= resolvedEnd;
  if (result.marketingDates.length === 0 || result.strategyDates.length === 0) {
    if (allowEmpty) return { ...result, resolvedStart: expectedStart, resolvedEnd: expectedEnd, empty: true };
    throw new Error(`日期范围 ${resolvedStart} 至 ${resolvedEnd} 未筛选到交易`);
  }
  if (!result.marketingDates.every(inRange) || !result.strategyDates.every(inRange)) throw new Error(`导出明细包含范围外交易：${JSON.stringify(result)}`);
  const displayStart = resolvedStart.replaceAll("-", ".");
  const displayEnd = resolvedEnd.replaceAll("-", ".");
  if (!result.marketingPeriod.includes(displayStart) || !result.marketingPeriod.includes(displayEnd) || !result.strategyPeriod.includes(displayStart) || !result.strategyPeriod.includes(displayEnd)) throw new Error(`导出统计区间未同步：${JSON.stringify(result)}`);
  if (!result.marketingTotal.includes(`${result.marketingDates.length} / ${result.marketingDates.length}`)) throw new Error(`营销图明细数量未同步：${JSON.stringify(result)}`);
  return { ...result, resolvedStart, resolvedEnd, empty: false };
}

async function readDownload(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { fileName: download.suggestedFilename(), ...pngSize(Buffer.concat(chunks)) };
}

async function chooseRange(range) {
  const dateShortcuts = page.locator(".export-date-shortcuts");
  if (range.key === "custom") {
    await dateShortcuts.getByRole("button", { name: "自定义" }).click();
    await page.getByLabel("导出起始日期").fill(range.startDate);
    await page.getByLabel("导出截止日期").fill(range.endDate);
  } else {
    await dateShortcuts.getByRole("button", { name: range.label }).click();
  }
  await page.getByLabel("弹窗导出明细数量").fill("全部");
  return inspectRange(range.startDate, range.endDate, range.allowEmpty);
}

async function exportForRange(buttonName, range) {
  await page.getByRole("button", { name: buttonName }).click();
  const rangeResult = await chooseRange(range);
  if (process.env.EXPORT_DATE_RANGE_SCREENSHOT && range.key === "custom" && buttonName === "策略汇总海报") await page.screenshot({ path: process.env.EXPORT_DATE_RANGE_SCREENSHOT, fullPage: false });
  if (rangeResult.empty) {
    await page.getByRole("button", { name: "确认导出" }).click();
    await page.waitForTimeout(150);
    if (!(await page.locator(".export-options-dialog").isVisible())) throw new Error(`${buttonName} 在无交易日期范围内不应开始下载`);
    await page.getByRole("button", { name: "取消" }).click();
    return { range: range.key, interval: `${range.startDate} 至 ${range.endDate}`, trades: 0, empty: true };
  }
  const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "确认导出" }).click();
  const png = await readDownload(await downloadPromise);
  if (png.width !== 1080 || png.height < 500) throw new Error(`${buttonName} ${range.label} PNG 尺寸异常：${JSON.stringify(png)}`);
  await page.waitForFunction(name => !Array.from(document.querySelectorAll("button")).some(button => button.textContent?.includes(name) && button.disabled), buttonName);
  return { range: range.key, interval: `${rangeResult.resolvedStart} 至 ${rangeResult.resolvedEnd}`, trades: rangeResult.marketingDates.length, png };
}

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".trade-table tbody tr").first().waitFor({ state: "visible", timeout: 20000 });
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const weekStart = new Date(`${today}T00:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const ranges = [
    { key: "today", label: "当日", startDate: today, endDate: today, allowEmpty: true },
    { key: "week", label: "本周", startDate: weekStart.toISOString().slice(0, 10), endDate: today },
    { key: "month", label: "本月", startDate: `${today.slice(0, 7)}-01`, endDate: today },
    { key: "all", label: "全部", startDate: null, endDate: null },
    { key: "custom", label: "自定义", startDate: "2026-08-03", endDate: "2026-08-07" },
  ];
  const results = [];
  for (const range of ranges) {
    results.push({ target: "营销图", ...(await exportForRange("导出营销图", range)) });
    results.push({ target: "策略汇总海报", ...(await exportForRange("策略汇总海报", range)) });
  }
  console.log(JSON.stringify({ verified: true, today, downloads: results }));
} finally {
  await browser.close();
}
