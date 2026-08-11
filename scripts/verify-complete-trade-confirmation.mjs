import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
let page;
let symbol = "";
let originalSellPrice = "";
let originalSellTime = "";
let restoreRequired = false;
const formatTruncatedPercent = value => `${(Math.trunc(value * 100 * 100) / 100).toFixed(2)}%`;

const nextMinute = value => {
  const minute = Number(value.slice(-2));
  const replacement = minute >= 58 ? 16 : minute + 1;
  return `${value.slice(0, -2)}${String(replacement).padStart(2, "0")}`;
};

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const rows = page.locator(".trade-table tbody tr");
  await rows.first().waitFor({ state: "visible", timeout: 20000 });
  const targetIndex = await rows.evaluateAll(tableRows => tableRows.findIndex(row => {
    const price = row.querySelector('input[aria-label$=" 卖出价"]');
    const time = row.querySelector('input[aria-label$=" 卖出时间"]');
    return price?.value === "" && Boolean(time?.value);
  }));
  if (targetIndex < 0) throw new Error("未找到“卖出时间已填写、卖出价待补填”的交易记录");

  const targetRow = rows.nth(targetIndex);
  symbol = await targetRow.locator(".symbol-input").inputValue();
  const buyPriceInput = () => page.locator(`input[aria-label="${symbol} 买入价"]`);
  const sellPriceInput = () => page.locator(`input[aria-label="${symbol} 卖出价"]`);
  const buyTimeInput = () => page.locator(`input[aria-label="${symbol} 买入时间"]`);
  const sellTimeInput = () => page.locator(`input[aria-label="${symbol} 卖出时间"]`);
  const returnTag = () => sellPriceInput().locator("xpath=ancestor::tr").locator(".return-tag");
  const confirmButton = () => sellTimeInput().locator("xpath=ancestor::tr").locator(".time-confirm-button");
  const buyPrice = Number(await buyPriceInput().inputValue());
  const buyTime = await buyTimeInput().inputValue();
  originalSellPrice = await sellPriceInput().inputValue();
  originalSellTime = await sellTimeInput().inputValue();
  if (!Number.isFinite(buyPrice) || buyPrice <= 0 || !buyTime) throw new Error("待测交易缺少有效买入信息");
  const wasInitiallyRealized = Boolean(originalSellPrice && originalSellTime);
  const initialRealizedTrades = Number((await page.locator(".metrics-section .metric-card").filter({ hasText: "总交易次数" }).locator("strong").textContent())?.replace(/\D/g, ""));
  const initialTrendPoints = await page.locator(".page-grid > .trend-panel .trend-data-label").count();

  const candidateSellPrice = Number((buyPrice * 1.1).toFixed(2));
  const newSellPrice = Math.abs(candidateSellPrice - Number(originalSellPrice)) < 0.005 ? Number((buyPrice * 1.11).toFixed(2)) : candidateSellPrice;
  const newSellTime = nextMinute(buyTime);
  const expectedReturn = formatTruncatedPercent((newSellPrice - buyPrice) / buyPrice);

  await sellPriceInput().fill(newSellPrice.toFixed(2));
  restoreRequired = true;
  await sellPriceInput().blur();
  await returnTag().filter({ hasText: expectedReturn }).waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(({ currentSymbol, expectedPrice, expectedTime }) => {
    const price = document.querySelector(`input[aria-label="${currentSymbol} 卖出价"]`);
    const time = document.querySelector(`input[aria-label="${currentSymbol} 卖出时间"]`);
    return price?.value === expectedPrice && time?.value === expectedTime;
  }, { currentSymbol: symbol, expectedPrice: newSellPrice.toFixed(2), expectedTime: originalSellTime }, { timeout: 10000 });
  await sellTimeInput().fill(newSellTime);
  await confirmButton().waitFor({ state: "visible", timeout: 5000 });
  await confirmButton().click();
  await page.locator("[data-sonner-toast]").filter({ hasText: "时间已确认" }).waitFor({ state: "visible", timeout: 10000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sellTimeInput().waitFor({ state: "visible", timeout: 10000 });

  const persisted = {
    sellPrice: await sellPriceInput().inputValue(),
    sellTime: await sellTimeInput().inputValue(),
    returnRate: (await returnTag().textContent())?.trim(),
  };
  if (persisted.sellPrice !== newSellPrice.toFixed(2) || persisted.sellTime !== newSellTime || persisted.returnRate !== expectedReturn) {
    throw new Error(`完整交易确认后字段或收益率未持久化：${JSON.stringify({ expected: { sellPrice: newSellPrice.toFixed(2), sellTime: newSellTime, returnRate: expectedReturn }, persisted })}`);
  }
  const realizedTrades = Number((await page.locator(".metrics-section .metric-card").filter({ hasText: "总交易次数" }).locator("strong").textContent())?.replace(/\D/g, ""));
  const trendPoints = await page.locator(".page-grid > .trend-panel .trend-data-label").count();
  const expectedRealizedTrades = initialRealizedTrades + (wasInitiallyRealized ? 0 : 1);
  const expectedTrendPoints = initialTrendPoints + (wasInitiallyRealized ? 0 : 1);
  if (realizedTrades !== expectedRealizedTrades || trendPoints !== expectedTrendPoints) {
    throw new Error(`完整交易未即时纳入月度统计或累计趋势：${JSON.stringify({ initialRealizedTrades, realizedTrades, expectedRealizedTrades, initialTrendPoints, trendPoints, expectedTrendPoints })}`);
  }
  const exportCounts = await page.evaluate(() => {
    const marketingCard = Array.from(document.querySelectorAll("#marketing-export .metric-card")).find(card => card.querySelector(".metric-card-top span")?.textContent?.trim() === "总交易次数");
    const posterCard = Array.from(document.querySelectorAll("#strategy-poster .poster-metric")).find(card => card.querySelector("span")?.textContent?.trim() === "交易股票数量");
    return {
      marketing: Number(marketingCard?.querySelector("strong")?.textContent?.replace(/\D/g, "")),
      strategy: Number(posterCard?.querySelector("strong")?.textContent?.replace(/\D/g, "")),
    };
  });
  if (exportCounts.marketing !== realizedTrades || exportCounts.strategy !== realizedTrades) throw new Error(`完整交易确认后导出汇总不一致：${JSON.stringify({ realizedTrades, exportCounts })}`);
  console.log(JSON.stringify({ symbol, newSellPrice, newSellTime, expectedReturn, realizedTrades, trendPoints, exportCounts, persisted: true }));
} finally {
  if (restoreRequired && page && symbol) {
    try {
      const sellPriceInput = () => page.locator(`input[aria-label="${symbol} 卖出价"]`);
      const sellTimeInput = () => page.locator(`input[aria-label="${symbol} 卖出时间"]`);
      const confirmButton = () => sellTimeInput().locator("xpath=ancestor::tr").locator(".time-confirm-button");
      await sellTimeInput().fill(originalSellTime);
      await confirmButton().waitFor({ state: "visible", timeout: 5000 });
      await confirmButton().click();
      await page.locator("[data-sonner-toast]").filter({ hasText: "时间已确认" }).waitFor({ state: "visible", timeout: 10000 });
      await sellPriceInput().fill(originalSellPrice);
      await sellPriceInput().blur();
      await page.waitForTimeout(400);
    } catch (restoreError) {
      console.error("完整交易确认测试数据恢复失败", restoreError);
    }
  }
  await browser.close();
}
