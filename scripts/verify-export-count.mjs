import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  const countInput = page.getByLabel("导出明细数量");
  await countInput.fill("3");
  const threeCounts = await page.locator("#marketing-export tbody tr, #strategy-poster tbody tr").evaluateAll(nodes => nodes.reduce((acc, node) => {
    const parentId = node.closest("[data-export-stage]")?.id ?? "unknown";
    acc[parentId] = (acc[parentId] ?? 0) + 1;
    return acc;
  }, {}));
  if (threeCounts["marketing-export"] !== 3 || threeCounts["strategy-poster"] !== 3) throw new Error(`数量 3 未同步到两种导出：${JSON.stringify(threeCounts)}`);
  const total = await page.locator(".trade-table tbody tr").count();
  await countInput.fill("全部");
  const allCounts = await page.locator("#marketing-export tbody tr, #strategy-poster tbody tr").evaluateAll(nodes => nodes.reduce((acc, node) => {
    const parentId = node.closest("[data-export-stage]")?.id ?? "unknown";
    acc[parentId] = (acc[parentId] ?? 0) + 1;
    return acc;
  }, {}));
  if (allCounts["marketing-export"] !== total || allCounts["strategy-poster"] !== total) throw new Error(`“全部”未同步到两种导出：${JSON.stringify({ allCounts, total })}`);
  console.log(JSON.stringify({ threeCounts, allCounts, total }));
} finally {
  await browser.close();
}
