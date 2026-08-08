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
    const chart = page.locator(".page-grid > .trend-panel .recharts-wrapper");
    await chart.waitFor({ state: "visible", timeout: 20000 });
    const metrics = await chart.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const firstDot = element.querySelector("circle.recharts-dot");
      const labels = Array.from(element.querySelectorAll(".trend-data-label"));
      const xTicks = Array.from(element.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick-value"));
      const yTicks = Array.from(element.querySelectorAll(".recharts-yAxis .recharts-cartesian-axis-tick-value"));
      if (!firstDot || labels.length < 2 || xTicks.length < 2) throw new Error("趋势图数据点或轴标签缺失");
      const firstLabel = labels[0].getBoundingClientRect();
      const firstDate = xTicks[0].getBoundingClientRect();
      const firstDotRect = firstDot.getBoundingClientRect();
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const avoidsYAxis = yTicks.every(tick => !intersects(firstLabel, tick.getBoundingClientRect()));
      const safe = firstDotRect.left - rect.left >= 64 && firstDate.left - rect.left >= 50 && !intersects(firstLabel, firstDate) && avoidsYAxis;
      return { safe, firstDotInset: Number((firstDotRect.left - rect.left).toFixed(1)), firstDateInset: Number((firstDate.left - rect.left).toFixed(1)), labelDateOverlap: intersects(firstLabel, firstDate), avoidsYAxis };
    });
    if (!metrics.safe) throw new Error(`${scenario.name} 趋势图首个标签仍贴边或重叠：${JSON.stringify(metrics)}`);
    report.push({ scenario: scenario.name, ...metrics });
    await page.close();
  }
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
