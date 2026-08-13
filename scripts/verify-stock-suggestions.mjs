import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

async function findCodeRow(code) {
  const rows = page.locator(".trade-table tbody tr");
  const rowIndex = await rows.evaluateAll((elements, targetCode) => elements.findIndex(row => {
    const input = row.querySelector('input[aria-label$="股票代码"]');
    return input instanceof HTMLInputElement && input.value === targetCode;
  }), code);
  return rowIndex >= 0 ? rows.nth(rowIndex) : null;
}

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".trade-table tbody tr").first().waitFor({ state: "visible", timeout: 20000 });

  const row = await findCodeRow("600376");
  if (!row) throw new Error("未找到用于候选下拉验证的 600376 交易");
  const codeInput = row.locator('input[aria-label$="股票代码"]');
  const nameInput = row.locator('input[aria-label$="股票名称"]');
  const priceInput = row.locator('input[aria-label$="买入价"]');
  const buyTimeInput = row.locator('input[aria-label$="买入时间"]');
  const protectedFields = { price: await priceInput.inputValue(), buyTime: await buyTimeInput.inputValue() };

  await codeInput.fill("skgf");
  const listbox = page.getByRole("listbox", { name: "股票搜索候选" });
  await listbox.waitFor({ state: "visible", timeout: 15000 });
  const pinyinCandidate = listbox.getByRole("option", { name: /600376.*首开股份.*skgf/ });
  await pinyinCandidate.waitFor({ state: "visible", timeout: 15000 });
  await codeInput.evaluate(element => element.scrollIntoView({ behavior: "instant", block: "center" }));
  if (process.env.STOCK_SUGGESTION_SCREENSHOT) await page.screenshot({ path: process.env.STOCK_SUGGESTION_SCREENSHOT, fullPage: false });
  await codeInput.press("Escape");
  await listbox.waitFor({ state: "hidden", timeout: 5000 });
  await codeInput.press("ArrowDown");
  await listbox.waitFor({ state: "visible", timeout: 5000 });
  await pinyinCandidate.click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('input[aria-label$="股票名称"]')).some(input => input instanceof HTMLInputElement && input.value === "首开股份"), undefined, { timeout: 15000 });
  if (await codeInput.inputValue() !== "600376" || await nameInput.inputValue() !== "首开股份") throw new Error("拼音缩写候选点选未双向填充代码与名称");
  if (await priceInput.inputValue() !== protectedFields.price || await buyTimeInput.inputValue() !== protectedFields.buyTime) throw new Error("候选点选不应修改买入价格或买入时间");

  await page.getByRole("button", { name: "新增交易" }).click();
  const modal = page.locator(".trade-modal");
  const modalCode = modal.getByRole("textbox", { name: "新增交易 股票代码" });
  const modalName = modal.getByRole("textbox", { name: "新增交易 股票名称" });
  await modalCode.fill("600376");
  await page.getByRole("listbox", { name: "股票搜索候选" }).waitFor({ state: "visible", timeout: 15000 });
  await modalCode.press("ArrowDown");
  await modalCode.press("Enter");
  await page.waitForFunction(() => document.querySelector('input[aria-label="新增交易 股票名称"]')?.value === "首开股份", undefined, { timeout: 15000 });
  if (await modalCode.inputValue() !== "600376" || await modalName.inputValue() !== "首开股份") throw new Error("新增交易键盘候选确认未填充代码与名称");

  await modalName.fill("首开");
  await page.getByRole("listbox", { name: "股票搜索候选" }).waitFor({ state: "visible", timeout: 15000 });
  const nameCandidate = page.getByRole("option", { name: /600376.*首开股份.*skgf/ });
  await nameCandidate.click();
  if (await modalCode.inputValue() !== "600376" || await modalName.inputValue() !== "首开股份") throw new Error("股票名称模糊候选点选未双向填充");
  await modal.getByRole("button", { name: "×" }).click();

  console.log(JSON.stringify({ verified: true, pinyinSearch: "skgf", nameSearch: "首开", keyboardSelection: true, protectedFields }));
} finally {
  await browser.close();
}
