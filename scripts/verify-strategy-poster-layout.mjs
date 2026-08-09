import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const poster = page.locator("#strategy-poster");
  await poster.waitFor({ state: "attached", timeout: 20000 });
  const metrics = await poster.evaluate((element) => {
    const posterRect = element.getBoundingClientRect();
    const required = [
      ["logo", ".poster-brand .brand-logo"], ["period", ".poster-period"], ["title", ".poster-heading h1"],
      ["metrics", ".poster-metrics"], ["table", ".poster-trade-table"], ["footer", ".poster-footer"],
    ].map(([name, selector]) => {
      const node = element.querySelector(selector);
      if (!node) throw new Error(`${name} 缺失`);
      return [name, node.getBoundingClientRect()];
    });
    const metricCards = Array.from(element.querySelectorAll(".poster-metric"));
    const title = element.querySelector(".poster-heading h1");
    const table = element.querySelector(".poster-trade-table");
    if (!title || !table || metricCards.length !== 5) throw new Error("海报关键内容数量异常");
    const rectFor = (name) => required.find(([label]) => label === name)?.[1];
    const logo = rectFor("logo"); const period = rectFor("period"); const titleRect = rectFor("title"); const cardsRect = rectFor("metrics"); const tableRect = rectFor("table"); const footer = rectFor("footer");
    const inside = (rect) => rect.left >= posterRect.left && rect.right <= posterRect.right && rect.top >= posterRect.top && rect.bottom <= posterRect.bottom;
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const cardRects = metricCards.map(card => card.getBoundingClientRect());
    const cardsSeparate = cardRects.every((card, index) => cardRects.slice(index + 1).every(other => !intersects(card, other)));
    const safe = [logo, period, titleRect, cardsRect, tableRect, footer, ...cardRects].every(inside)
      && !intersects(logo, period) && !intersects(titleRect, cardsRect) && !intersects(cardsRect, tableRect) && !intersects(tableRect, footer)
      && cardsSeparate && title.scrollWidth <= title.clientWidth && table.scrollWidth <= table.clientWidth;
    return { safe, posterWidth: Math.round(posterRect.width), posterHeight: Math.round(posterRect.height), metricCount: metricCards.length, titleWidth: Math.round(titleRect.width), tableWidth: Math.round(tableRect.width) };
  });
  if (!metrics.safe) throw new Error(`策略汇总海报存在错位、遮挡或越界：${JSON.stringify(metrics)}`);
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
}
