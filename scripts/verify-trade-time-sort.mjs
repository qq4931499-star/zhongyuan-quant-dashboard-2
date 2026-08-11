import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
let page;
let targetSymbol = "";
let originalBuyTime = "";
let originalSellTime = "";
let restoreRequired = false;

const revisedMinute = value => {
  const minute = Number(value.slice(-2));
  const nextMinute = minute >= 58 ? 17 : minute + 1;
  return `${value.slice(0, -2)}${String(nextMinute).padStart(2, "0")}`;
};

const assertDescendingBuyTimes = async currentPage => {
  const buyTimes = await currentPage.locator('.trade-table tbody input[aria-label$=" 买入时间"]').evaluateAll(inputs => inputs.map(input => input.value));
  if (buyTimes.some((value, index) => index > 0 && buyTimes[index - 1].localeCompare(value) < 0)) throw new Error(`交易明细未按买入时间由近到远排序：${JSON.stringify(buyTimes)}`);
  return buyTimes;
};

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const rows = page.locator(".trade-table tbody tr");
  await rows.first().waitFor({ state: "visible", timeout: 20000 });
  const initialBuyTimes = await assertDescendingBuyTimes(page);
  const targetIndex = await rows.evaluateAll(tableRows => tableRows.findIndex(row => {
    const buy = row.querySelector('input[aria-label$=" 买入时间"]');
    const sell = row.querySelector('input[aria-label$=" 卖出时间"]');
    return Boolean(buy?.value && sell?.value);
  }));
  if (targetIndex < 0) throw new Error("未找到同时具备买入和卖出时间的交易记录");

  const targetRow = rows.nth(targetIndex);
  targetSymbol = await targetRow.locator(".symbol-input").inputValue();
  const buyTimeInput = () => page.locator(`input[aria-label="${targetSymbol} 买入时间"]`);
  const sellTimeInput = () => page.locator(`input[aria-label="${targetSymbol} 卖出时间"]`);
  const confirmButton = () => buyTimeInput().locator("xpath=ancestor::tr").locator(".time-confirm-button");
  originalBuyTime = await buyTimeInput().inputValue();
  originalSellTime = await sellTimeInput().inputValue();
  const revisedBuyTime = revisedMinute(originalBuyTime);
  const revisedSellTime = revisedMinute(originalSellTime);

  await buyTimeInput().fill(revisedBuyTime);
  await sellTimeInput().fill(revisedSellTime);
  restoreRequired = true;
  await confirmButton().waitFor({ state: "visible", timeout: 5000 });
  await confirmButton().click();
  await page.locator("[data-sonner-toast]").filter({ hasText: "时间已确认" }).waitFor({ state: "visible", timeout: 10000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await buyTimeInput().waitFor({ state: "visible", timeout: 10000 });
  if (await buyTimeInput().inputValue() !== revisedBuyTime || await sellTimeInput().inputValue() !== revisedSellTime) {
    throw new Error(`确认后的分钟时间未持久化：${JSON.stringify({ revisedBuyTime, persistedBuyTime: await buyTimeInput().inputValue(), revisedSellTime, persistedSellTime: await sellTimeInput().inputValue() })}`);
  }
  const persistedBuyTimes = await assertDescendingBuyTimes(page);

  console.log(JSON.stringify({ initialBuyTimes, targetSymbol, revisedBuyTime, revisedSellTime, persistedBuyTimes, minutesPersisted: true }));
} finally {
  if (restoreRequired && page && targetSymbol) {
    try {
      const buyTimeInput = () => page.locator(`input[aria-label="${targetSymbol} 买入时间"]`);
      const sellTimeInput = () => page.locator(`input[aria-label="${targetSymbol} 卖出时间"]`);
      const confirmButton = () => buyTimeInput().locator("xpath=ancestor::tr").locator(".time-confirm-button");
      await buyTimeInput().fill(originalBuyTime);
      await sellTimeInput().fill(originalSellTime);
      await confirmButton().waitFor({ state: "visible", timeout: 5000 });
      await confirmButton().click();
      await page.locator("[data-sonner-toast]").filter({ hasText: "时间已确认" }).waitFor({ state: "visible", timeout: 10000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      if (await buyTimeInput().inputValue() !== originalBuyTime || await sellTimeInput().inputValue() !== originalSellTime) throw new Error("测试数据恢复后分钟时间不一致");
    } catch (restoreError) {
      console.error("交易时间测试数据恢复失败", restoreError);
    }
  }
  await browser.close();
}
