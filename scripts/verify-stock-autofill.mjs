import { chromium } from "playwright";

const TEST_BUY_TIME = "2026-08-12T15:01";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const lookupResponses = [];
let temporaryRow = null;

page.on("response", async response => {
  if (response.url().includes("lookupStockIdentity")) lookupResponses.push({ status: response.status(), body: await response.text().catch(() => "") });
});

async function findTemporaryRow() {
  const rows = page.locator(".trade-table tbody tr");
  const rowIndex = await rows.evaluateAll(elements => elements.findIndex(row => {
    const buyTime = row.querySelector('input[aria-label$="买入时间"]');
    return buyTime instanceof HTMLInputElement && buyTime.value === "2026-08-12T15:01";
  }));
  return rowIndex >= 0 ? rows.nth(rowIndex) : null;
}

async function removeTemporaryTrade() {
  const row = await findTemporaryRow();
  if (!row) return;
  await row.locator(".delete-button").click();
  await page.waitForTimeout(300);
}

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".trade-table tbody tr").first().waitFor({ state: "visible", timeout: 20000 });

  await page.getByRole("button", { name: "新增交易" }).click();
  const modal = page.locator(".trade-modal");
  await modal.waitFor({ state: "visible", timeout: 10000 });
  const modalCode = modal.locator('input[name="symbol"]');
  const modalName = modal.locator('input[name="stockName"]');
  await modalCode.fill("600376");
  await modalCode.blur();
  await page.waitForFunction(() => document.querySelector('.trade-modal input[name="stockName"]')?.value === "首开股份", undefined, { timeout: 15000 }).catch(async () => {
    throw new Error(`新增交易弹窗未自动补全股票名称；接口响应：${JSON.stringify(lookupResponses)}`);
  });
  await modal.locator('input[name="buyPrice"]').fill("4.21");
  await modal.locator('input[name="buyDate"]').fill(TEST_BUY_TIME);
  await modal.getByRole("button", { name: "保存交易" }).click();
  await modal.waitFor({ state: "hidden", timeout: 15000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".trade-table tbody tr")).some(row => {
    const code = row.querySelector('input[aria-label$="股票代码"]');
    const buyTime = row.querySelector('input[aria-label$="买入时间"]');
    return code instanceof HTMLInputElement && buyTime instanceof HTMLInputElement && code.value === "600376" && buyTime.value === "2026-08-12T15:01";
  }), undefined, { timeout: 15000 });

  temporaryRow = await findTemporaryRow();
  if (!temporaryRow) throw new Error("自动补全测试交易未创建");
  const codeInput = temporaryRow.locator('input[aria-label$="股票代码"]');
  const nameInput = temporaryRow.locator('input[aria-label$="股票名称"]');
  const priceInput = temporaryRow.locator('input[aria-label$="买入价"]');
  const buyTimeInput = temporaryRow.locator('input[aria-label$="买入时间"]');
  const protectedFields = { price: await priceInput.inputValue(), buyTime: await buyTimeInput.inputValue() };

  await nameInput.fill("人工名称");
  await nameInput.blur();
  await page.waitForTimeout(300);
  await codeInput.fill("600376");
  await codeInput.blur();
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".trade-table tbody tr")).some(row => {
    const code = row.querySelector('input[aria-label$="股票代码"]');
    const name = row.querySelector('input[aria-label$="股票名称"]');
    const buyTime = row.querySelector('input[aria-label$="买入时间"]');
    return code instanceof HTMLInputElement && name instanceof HTMLInputElement && buyTime instanceof HTMLInputElement && code.value === "600376" && name.value === "首开股份" && buyTime.value === "2026-08-12T15:01";
  }), undefined, { timeout: 15000 });
  if (await nameInput.inputValue() !== "首开股份") throw new Error("输入股票代码后未自动补全股票名称");

  await codeInput.fill("123456");
  await codeInput.blur();
  await page.waitForTimeout(300);
  await nameInput.fill("首开股份");
  await nameInput.blur();
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".trade-table tbody tr")).some(row => {
    const code = row.querySelector('input[aria-label$="股票代码"]');
    const name = row.querySelector('input[aria-label$="股票名称"]');
    const buyTime = row.querySelector('input[aria-label$="买入时间"]');
    return code instanceof HTMLInputElement && name instanceof HTMLInputElement && buyTime instanceof HTMLInputElement && code.value === "600376" && name.value === "首开股份" && buyTime.value === "2026-08-12T15:01";
  }), undefined, { timeout: 15000 });
  if (await codeInput.inputValue() !== "600376") throw new Error("输入股票名称后未自动补全股票代码");
  if (await priceInput.inputValue() !== protectedFields.price || await buyTimeInput.inputValue() !== protectedFields.buyTime) throw new Error("自动补全不应修改买入价格或买入时间");

  await removeTemporaryTrade();
  temporaryRow = null;
  console.log(JSON.stringify({ verified: true, codeToName: "600376 → 首开股份", nameToCode: "首开股份 → 600376", protectedFields }));
} finally {
  if (temporaryRow) await removeTemporaryTrade().catch(() => undefined);
  await browser.close();
}
