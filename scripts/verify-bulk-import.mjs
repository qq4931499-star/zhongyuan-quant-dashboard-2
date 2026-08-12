import { chromium } from "playwright";
import { utils, write } from "xlsx";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "批量导入" }).waitFor({ state: "visible", timeout: 20000 });
  const initialCount = await page.locator(".trade-table tbody tr").count();
  const [directTemplate] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator(".table-actions .template-button").click(),
  ]);
  if (!directTemplate.suggestedFilename().endsWith(".xlsx")) throw new Error("直接模板下载格式异常");
  await page.getByRole("button", { name: "批量导入" }).click();
  await page.locator(".import-dialog").waitFor({ state: "visible" });
  await page.locator(".import-helper button").waitFor({ state: "visible" });
  const [template] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator(".import-helper button").click(),
  ]);
  if (!template.suggestedFilename().endsWith(".xlsx")) throw new Error("模板下载格式异常");

  const firstRow = await page.locator(".trade-table tbody tr").first().locator("input").evaluateAll(inputs => inputs.map(input => input.value));
  const [, symbol, stockName, buyPrice, sellPrice, buyDate, sellDate] = firstRow;
  const csv = `股票代码,股票名称,买入价,卖出价,买入日期,卖出日期\n${symbol},${stockName},${buyPrice},${sellPrice},${buyDate},${sellDate}\n`;
  await page.locator(".import-dropzone input[type=file]").setInputFiles({ name: "duplicate-trade.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.waitForTimeout(500);
  const readyButton = page.getByRole("button", { name: /导入 1 条交易/ });
  if (await readyButton.count() === 0) throw new Error(`CSV 解析未完成：${await page.locator(".import-dialog").innerText()}`);
  await page.getByRole("button", { name: /导入 1 条交易/ }).click();
  await page.getByText("已导入 0 条交易").waitFor({ state: "visible", timeout: 15000 });
  await page.getByRole("button", { name: "批量导入" }).click();
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.json_to_sheet([{ "股票代码": symbol, "股票名称": stockName, "买入价": Number(buyPrice), "卖出价": sellPrice ? Number(sellPrice) : "", "买入日期": buyDate, "卖出日期": sellDate }]), "交易明细");
  await page.locator(".import-dropzone input[type=file]").setInputFiles({ name: "duplicate-trade.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: write(workbook, { type: "buffer", bookType: "xlsx" }) });
  await page.getByRole("button", { name: /导入 1 条交易/ }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /导入 1 条交易/ }).click();
  await page.locator(".import-dialog").waitFor({ state: "hidden", timeout: 15000 });
  const finalCount = await page.locator(".trade-table tbody tr").count();
  if (finalCount !== initialCount) throw new Error(`重复交易不应新增记录：导入前 ${initialCount}，导入后 ${finalCount}`);
  console.log(JSON.stringify({ directTemplate: directTemplate.suggestedFilename(), template: template.suggestedFilename(), importDialogOpened: true, initialCount, finalCount, csvDuplicateSkipped: true, xlsxDuplicateSkipped: true }));
} finally {
  await browser.close();
}
