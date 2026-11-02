/** Authoring helper shared by both worlds. No browser is needed at runtime. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

export async function rasterizeCampaignSources(
  source,
  output,
  manifest,
  scale = 1,
) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 512, height: 512 },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    for (const frame of [...manifest.frames, ...manifest.backgrounds]) {
      const drawing = await readFile(
        new URL(`${frame.name}.svg`, source),
        "utf8",
      );
      await page.setViewportSize({
        width: Math.round(frame.width * scale),
        height: Math.round(frame.height * scale),
      });
      await page.setContent(
        `<style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>${drawing}`,
      );
      await page.screenshot({
        path: fileURLToPath(new URL(`${frame.name}.png`, output)),
        omitBackground: true,
        animations: "disabled",
      });
    }
  } finally {
    await browser.close();
  }
}
