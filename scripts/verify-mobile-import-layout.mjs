import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const heading = page.locator(".table-heading");
  await heading.waitFor({ state: "visible", timeout: 20000 });
  const metrics = await heading.evaluate((element) => {
    const title = element.querySelector("h2");
    const actions = element.querySelector(".table-actions");
    const buttons = Array.from(element.querySelectorAll(".table-actions button"));
    if (!title || !actions || buttons.length !== 2) throw new Error("交易明细操作区元素缺失");
    const titleRect = title.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const headingRect = element.getBoundingClientRect();
    const safe = title.scrollWidth <= title.clientWidth && titleRect.right + 8 <= actionsRect.left && buttons.every(button => button.getBoundingClientRect().width >= 70 && button.getBoundingClientRect().right <= headingRect.right);
    return { safe, titleWidth: Number(titleRect.width.toFixed(1)), actionsWidth: Number(actionsRect.width.toFixed(1)), titleScrollWidth: title.scrollWidth, titleClientWidth: title.clientWidth };
  });
  if (!metrics.safe) throw new Error(`390px 下交易明细标题与批量导入操作区布局异常：${JSON.stringify(metrics)}`);
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
}
