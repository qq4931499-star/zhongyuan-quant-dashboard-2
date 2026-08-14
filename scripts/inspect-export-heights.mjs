import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".trade-table tbody tr").first().waitFor({ state: "visible", timeout: 20000 });
  await page.getByRole("button", { name: "策略汇总海报" }).click();
  await page.getByLabel("弹窗导出明细数量").fill("全部");
  const metrics = await page.evaluate(() => {
    const stage = document.getElementById("strategy-poster");
    const footer = stage?.querySelector("footer");
    const hero = stage?.querySelector(".poster-hero");
    const ledger = stage?.querySelector(".poster-ledger");
    const details = [stage, hero, ledger, footer].map(element => element instanceof HTMLElement ? ({
      tag: element.tagName,
      className: element.className,
      offsetTop: element.offsetTop,
      offsetHeight: element.offsetHeight,
      scrollHeight: element.scrollHeight,
      rect: element.getBoundingClientRect().toJSON(),
      css: { height: getComputedStyle(element).height, minHeight: getComputedStyle(element).minHeight, display: getComputedStyle(element).display, position: getComputedStyle(element).position },
    }) : null);
    return details;
  });
  console.log(JSON.stringify(metrics, null, 2));
} finally { await browser.close(); }
