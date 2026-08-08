import { chromium } from "playwright";

const scenarios = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const report = [];
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
    const finalReturn = page.locator(".page-grid > .trend-panel .final-return");
    await finalReturn.waitFor({ state: "visible", timeout: 20000 });
    const metrics = await finalReturn.evaluate((element) => {
      const panel = element.closest(".trend-panel");
      const label = element.querySelector("span");
      const value = element.querySelector("strong");
      if (!panel || !label || !value) throw new Error("最终累计收益率元素缺失");
      const panelRect = panel.getBoundingClientRect();
      const containerRect = element.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      const valueRightInset = panelRect.right - valueRect.right;
      const aligned = Math.abs(labelRect.right - valueRect.right) <= 1;
      const safe = aligned && value.scrollWidth <= value.clientWidth && valueRect.left >= panelRect.left && valueRightInset >= 16 && valueRect.bottom <= panelRect.bottom;
      return { safe, aligned, valueRightInset: Number(valueRightInset.toFixed(1)), valueWidth: Number(valueRect.width.toFixed(1)), scrollWidth: value.scrollWidth, containerWidth: Number(containerRect.width.toFixed(1)) };
    });
    if (!metrics.safe) throw new Error(`${scenario.name} 最终累计收益率对齐或边距异常：${JSON.stringify(metrics)}`);
    report.push({ scenario: scenario.name, ...metrics });
    await page.close();
  }
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
