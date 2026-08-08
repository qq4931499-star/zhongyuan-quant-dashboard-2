import { chromium } from "playwright";

const scenarios = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];
const longValues = [
  { text: "¥1,234,567.89", className: "metric-value-very-long" },
  { text: "123.4567%", className: "metric-value-long" },
];
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const results = [];
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: scenario.viewport });
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
    const cards = page.locator(".metrics-section .metric-card");
    await cards.nth(3).waitFor({ state: "visible", timeout: 20000 });
    const count = await cards.count();
    if (count < longValues.length) throw new Error(`指标卡数量不足：${count}`);
    const result = [];
    for (const [index, sample] of longValues.entries()) {
      const card = cards.nth(index);
      const value = card.locator("strong");
      await value.evaluate((element, replacement) => {
        element.textContent = replacement.text;
        element.className = replacement.className;
      }, sample);
      const dimensions = await card.evaluate((cardElement) => {
        const element = cardElement.querySelector("strong");
        if (!element) throw new Error("指标数值缺失");
        const valueRect = element.getBoundingClientRect();
        const cardRect = cardElement.getBoundingClientRect();
        return { safe: element.scrollWidth <= element.clientWidth && valueRect.left >= cardRect.left && valueRect.right <= cardRect.right && valueRect.top >= cardRect.top && valueRect.bottom <= cardRect.bottom, valueWidth: element.clientWidth, scrollWidth: element.scrollWidth, cardHeight: cardElement.clientHeight };
      });
      result.push({ index, ...dimensions });
    }
    if (result.some(item => !item.safe)) throw new Error(`${scenario.name} 长数字指标卡发生溢出：${JSON.stringify(result)}`);
    results.push({ scenario: scenario.name, cards: result });
    await page.close();
  }
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
