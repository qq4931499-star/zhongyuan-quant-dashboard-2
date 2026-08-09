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
    const topbar = page.locator(".topbar");
    await topbar.waitFor({ state: "visible", timeout: 20000 });
    const metrics = await topbar.evaluate((element) => {
      const title = element.querySelector(".title-editor");
      const dateStack = element.querySelector(".date-stack");
      const buttons = Array.from(element.querySelectorAll(".export-actions button"));
      if (!title || !dateStack || buttons.length !== 2) throw new Error("顶栏关键元素缺失");
      const titleRect = title.getBoundingClientRect();
      const dateRect = dateStack.getBoundingClientRect();
      const firstButton = buttons[0].getBoundingClientRect();
      const secondButton = buttons[1].getBoundingClientRect();
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const verticalButtons = firstButton.bottom + 4 <= secondButton.top;
      const safe = !intersects(titleRect, dateRect) && !intersects(titleRect, firstButton) && !intersects(titleRect, secondButton) && dateRect.bottom + 4 <= firstButton.top && verticalButtons && buttons.every(button => button.scrollWidth <= button.clientWidth);
      return { safe, verticalButtons, titleWidth: Math.round(titleRect.width), dateWidth: Math.round(dateRect.width), buttonWidth: Math.round(firstButton.width) };
    });
    if (!metrics.safe) throw new Error(`${scenario.name} 顶栏存在标题重叠、操作重叠或按钮未纵向排列：${JSON.stringify(metrics)}`);
    report.push({ scenario: scenario.name, ...metrics });
    await page.close();
  }
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
