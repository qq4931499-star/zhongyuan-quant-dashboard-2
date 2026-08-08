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
    const cards = page.locator(".metrics-section .metric-card");
    await cards.nth(3).waitFor({ state: "visible", timeout: 20000 });
    const metrics = await cards.evaluateAll((nodes) => nodes.map((card, index) => {
      const label = card.querySelector(".metric-card-top");
      const value = card.querySelector("strong");
      const detail = card.querySelector("small");
      if (!label || !value || !detail) throw new Error(`第 ${index + 1} 张指标卡内容缺失`);
      const cardRect = card.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      const detailRect = detail.getBoundingClientRect();
      const contentFill = (detailRect.bottom - labelRect.top) / cardRect.height;
      const cardCenter = (cardRect.left + cardRect.right) / 2;
      const valueCenter = (valueRect.left + valueRect.right) / 2;
      const safeMargins = {
        top: labelRect.top - cardRect.top,
        bottom: cardRect.bottom - detailRect.bottom,
        left: valueRect.left - cardRect.left,
        right: cardRect.right - valueRect.right,
      };
      const safe = contentFill >= 0.68 && contentFill <= 0.9 && Math.abs(cardCenter - valueCenter) <= 1 && Object.values(safeMargins).every(margin => margin >= 8);
      return { index, safe, contentFill: Number(contentFill.toFixed(3)), safeMargins: Object.fromEntries(Object.entries(safeMargins).map(([key, value]) => [key, Number(value.toFixed(1))])) };
    }));
    if (metrics.some(metric => !metric.safe)) throw new Error(`${scenario.name} 指标卡内容占比或安全边距不符合要求：${JSON.stringify(metrics)}`);
    report.push({ scenario: scenario.name, metrics });
    await page.close();
  }
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
