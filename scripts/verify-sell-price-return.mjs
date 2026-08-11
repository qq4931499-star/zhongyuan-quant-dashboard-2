import { chromium } from "playwright";
import { readFile, rm } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
let page;
let sellPriceInput;
let originalSellPrice = "";
let restoreRequired = false;
const formatTruncatedPercent = value => `${(Math.trunc(value * 100 * 100) / 100).toFixed(2)}%`;
const formatRoundedPercent = value => `${(value * 100).toFixed(2)}%`;

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });

  const rows = page.locator(".trade-table tbody tr");
  await rows.first().waitFor({ state: "visible", timeout: 20000 });
  const rowCount = await rows.count();
  const targetIndex = 0;
  if (rowCount === 0) throw new Error("未找到可验证的交易明细行");

  const targetRow = rows.nth(targetIndex);
  const symbol = await targetRow.locator(".symbol-input").inputValue();
  const buyPriceInput = page.locator(`input[aria-label="${symbol} 买入价"]`);
  sellPriceInput = page.locator(`input[aria-label="${symbol} 卖出价"]`);
  const returnTag = sellPriceInput.locator("xpath=ancestor::tr").locator(".return-tag");
  const buyPrice = Number(await buyPriceInput.inputValue());
  originalSellPrice = await sellPriceInput.inputValue();
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) throw new Error("买入价无效，无法验证收益率");

  const roundedBasePrice = Number((buyPrice * 1.1).toFixed(2));
  const candidatePrices = Array.from({ length: 20 }, (_, index) => Number((roundedBasePrice + (index - 10) * 0.01).toFixed(2)));
  const targetSellPrice = candidatePrices.find(price => {
    const returnRate = (price - buyPrice) / buyPrice;
    return Math.abs(price - Number(originalSellPrice)) >= 0.005 && formatTruncatedPercent(returnRate) !== formatRoundedPercent(returnRate);
  }) ?? roundedBasePrice;
  const expectedReturn = formatTruncatedPercent((targetSellPrice - buyPrice) / buyPrice);

  await sellPriceInput.fill(targetSellPrice.toFixed(2));
  restoreRequired = true;
  await sellPriceInput.blur();
  await page.waitForFunction(({ currentSymbol, expected }) => {
    const row = document.querySelector(`input[aria-label="${currentSymbol} 卖出价"]`)?.closest("tr");
    return row?.querySelector(".return-tag")?.textContent?.trim() === expected;
  }, { currentSymbol: symbol, expected: expectedReturn }, { timeout: 10000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  const persistedSellPriceInput = page.locator(`input[aria-label="${symbol} 卖出价"]`);
  await persistedSellPriceInput.waitFor({ state: "visible", timeout: 10000 });
  const persistedReturn = persistedSellPriceInput.locator("xpath=ancestor::tr").locator(".return-tag");
  if ((await persistedReturn.textContent())?.trim() !== expectedReturn) throw new Error(`重新加载后收益率未持久化：期望 ${expectedReturn}`);

  await persistedSellPriceInput.locator("xpath=ancestor::tr").locator(".report-select-input").check();
  await page.waitForFunction(({ currentSymbol, expected }) => {
    const card = Array.from(document.querySelectorAll("#buy-report .buy-report-card")).find(item => item.querySelector("h2 small")?.textContent?.includes(currentSymbol));
    return card?.querySelector(".buy-report-profit")?.textContent?.trim() === expected;
  }, { currentSymbol: symbol, expected: expectedReturn }, { timeout: 10000 });
  const exportReturns = await page.evaluate(currentSymbol => {
    const findTableReturn = (sectionId) => {
      const row = Array.from(document.querySelectorAll(`${sectionId} tbody tr`)).find(item => item.textContent?.includes(currentSymbol));
      return row?.querySelector("td:last-child")?.textContent?.trim() ?? "";
    };
    const reportCard = Array.from(document.querySelectorAll("#buy-report .buy-report-card")).find(item => item.querySelector("h2 small")?.textContent?.includes(currentSymbol));
    return {
      marketing: findTableReturn("#marketing-export"),
      strategy: findTableReturn("#strategy-poster"),
      buyReport: reportCard?.querySelector(".buy-report-profit")?.textContent?.trim() ?? "",
    };
  }, symbol);
  if (Object.values(exportReturns).some(value => value !== expectedReturn)) throw new Error(`交易表与导出画布收益率不一致：${JSON.stringify({ expectedReturn, exportReturns })}`);

  await page.getByRole("button", { name: "导出营销图" }).click();
  const exportDialog = page.locator(".export-options-dialog");
  await exportDialog.waitFor({ state: "visible", timeout: 10000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    exportDialog.getByRole("button", { name: "确认导出" }).click(),
  ]);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("未获得营销图下载文件");
  const png = await readFile(downloadPath);
  if (png.toString("ascii", 1, 4) !== "PNG" || png.readUInt32BE(16) !== 1080) throw new Error("更新卖出价后的营销图 PNG 无效");
  await rm(downloadPath, { force: true });

  console.log(JSON.stringify({ symbol, targetSellPrice, expectedReturn, persisted: true, exportReturns, marketingPng: true }));
} finally {
  if (restoreRequired && page && sellPriceInput) {
    try {
      const symbol = await sellPriceInput.getAttribute("aria-label").then(label => label?.replace(" 卖出价", ""));
      if (symbol) {
        const currentInput = page.locator(`input[aria-label="${symbol} 卖出价"]`);
        await currentInput.fill(originalSellPrice);
        await currentInput.blur();
        const buyPrice = Number(await page.locator(`input[aria-label="${symbol} 买入价"]`).inputValue());
        const expectedRestoredReturn = originalSellPrice.trim() && Number.isFinite(buyPrice) && buyPrice > 0
          ? formatTruncatedPercent((Number(originalSellPrice) - buyPrice) / buyPrice)
          : "-----";
        await page.waitForFunction(({ currentSymbol, expected }) => {
          const row = document.querySelector(`input[aria-label="${currentSymbol} 卖出价"]`)?.closest("tr");
          return row?.querySelector(".return-tag")?.textContent?.trim() === expected;
        }, { currentSymbol: symbol, expected: expectedRestoredReturn }, { timeout: 10000 });
      }
    } catch (restoreError) {
      console.error("卖出价测试数据恢复失败", restoreError);
    }
  }
  await browser.close();
}
