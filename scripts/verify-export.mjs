import { chromium } from "playwright";
import { copyFile, readFile, rm } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await page.locator(".metric-card").first().waitFor({ state: "visible", timeout: 20000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "导出营销图" }).click(),
  ]);
  const filePath = await download.path();
  if (!filePath) throw new Error("未获得下载文件路径");
  const bytes = await readFile(filePath);
  if (bytes.length < 10_000) throw new Error(`PNG 文件过小：${bytes.length} bytes`);
  if (bytes.toString("ascii", 1, 4) !== "PNG") throw new Error("下载文件不是 PNG");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 1080 || height !== 1620) throw new Error(`PNG 尺寸异常：${width}×${height}`);
  console.log(JSON.stringify({ fileName: download.suggestedFilename(), byteLength: bytes.length, width, height }));
  if (process.env.EXPORT_VERIFY_OUTPUT) await copyFile(filePath, process.env.EXPORT_VERIFY_OUTPUT);
  await rm(filePath, { force: true });
} finally {
  await browser.close();
}
