/**
 * 将架构图 HTML 截图为 PNG 图片
 * 使用 Playwright 浏览器渲染 Mermaid 图表并截图
 */
import { chromium } from "playwright";
import { resolve } from "path";

async function main() {
  const htmlPath = resolve(import.meta.dirname, "../docs/architecture-diagram.html");
  const outputPath = resolve(import.meta.dirname, "../architecture-diagram.png");

  console.log(`[screenshot] 打开 ${htmlPath}`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 2400 } });

  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });

  // 等待 Mermaid 图表渲染完成
  await page.waitForTimeout(3000);

  // 获取页面实际高度
  const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  console.log(`[screenshot] 页面尺寸: ${bodyWidth}x${bodyHeight}`);

  await page.setViewportSize({ width: Math.max(bodyWidth, 1200), height: Math.max(bodyHeight, 800) });
  await page.screenshot({ path: outputPath, fullPage: true });

  console.log(`[screenshot] 截图已保存: ${outputPath}`);
  await browser.close();
}

main().catch(console.error);
