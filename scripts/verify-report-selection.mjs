import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const checkboxes = page.locator(".report-select-input");
  await checkboxes.nth(4).waitFor({ state: "visible", timeout: 20000 });

  const firstFourSymbols = await page.locator(".trade-table tbody tr").evaluateAll(rows => rows.slice(0, 4).map(row => row.querySelector(".symbol-input")?.value));
  for (let index = 0; index < 4; index += 1) await checkboxes.nth(index).check();
  await checkboxes.nth(4).click({ force: true });
  const checkedCount = await page.locator(".report-select-input:checked").count();
  const limitToast = await page.locator("[data-sonner-toast]").filter({ hasText: "最多选择 4 条" }).count();
  if (checkedCount !== 4 || limitToast === 0) throw new Error(`勾选上限未生效：checked=${checkedCount}, toast=${limitToast}`);

  await page.getByRole("button", { name: "今日策略战报" }).click();
  const dialog = page.locator(".report-dialog").filter({ hasText: "导出今日策略战报" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  if (!(await dialog.getByText("将优先使用交易明细中已勾选的 4 条记录").count())) throw new Error("战报弹窗未提示勾选优先规则");
  const reportSymbols = await page.locator("#buy-report .buy-report-card h2 small").evaluateAll(nodes => nodes.map(node => node.textContent?.replace("/", "").trim()));
  if (JSON.stringify(reportSymbols) !== JSON.stringify(firstFourSymbols)) throw new Error(`战报未使用勾选数据源：${JSON.stringify({ reportSymbols, firstFourSymbols })}`);
  await page.keyboard.press("Escape");

  const firstRow = page.locator(".trade-table tbody tr").first();
  const targetSymbol = await firstRow.locator(".symbol-input").inputValue();
  const targetTimeInput = () => page.locator(`input[aria-label="${targetSymbol} 买入时间"]`);
  const targetRow = () => targetTimeInput().locator("xpath=ancestor::tr");
  const firstTimeInput = targetTimeInput();
  const original = await firstTimeInput.inputValue();
  const revised = original.endsWith("00:00") ? `${original.slice(0, -2)}01` : `${original.slice(0, -2)}00`;
  const confirmButton = targetRow().locator(".time-confirm-button");
  let restored = false;
  const restoreOriginalTime = async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    const persistedTimeInput = targetTimeInput();
    await persistedTimeInput.waitFor({ state: "visible", timeout: 10000 });
    if (await persistedTimeInput.inputValue() === original) { restored = true; return; }
    await persistedTimeInput.fill(original);
    const restoreConfirm = targetRow().locator(".time-confirm-button");
    await restoreConfirm.waitFor({ state: "visible", timeout: 5000 });
    await restoreConfirm.click();
    await page.locator("[data-sonner-toast]").filter({ hasText: "时间已确认" }).waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(6000);
    await page.reload({ waitUntil: "domcontentloaded" });
    const restoredInput = targetTimeInput();
    await restoredInput.waitFor({ state: "visible", timeout: 10000 });
    if (await restoredInput.inputValue() !== original) throw new Error("验证结束后未能恢复原始买入时间");
    restored = true;
  };
  try {
    await firstTimeInput.fill(revised);
    await confirmButton.waitFor({ state: "visible", timeout: 5000 });
    await confirmButton.click();
    await page.locator("[data-sonner-toast]").filter({ hasText: "时间已确认" }).waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(6000);
    await page.reload({ waitUntil: "domcontentloaded" });
    const persistedTimeInput = targetTimeInput();
    await persistedTimeInput.waitFor({ state: "visible", timeout: 10000 });
    if (await persistedTimeInput.inputValue() !== revised) throw new Error("时间确认后刷新页面未持久化");
    await restoreOriginalTime();
  } finally {
    if (!restored) await restoreOriginalTime();
  }

  console.log(JSON.stringify({ checkedCount, reportSymbols, timeConfirmPersistence: true, restored }));
} finally {
  await browser.close();
}
