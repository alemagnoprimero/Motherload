import { chromium, firefox, webkit } from "playwright-core";

export function launchBrowser() {
  const engine = process.env.BROWSER || "chromium";
  if (engine === "firefox")
    return firefox.launch({
      // Headless Firefox on a machine without a GPU has no WebGL ("Exhausted
      // GL driver options"); with a window on a display (xvfb-run in CI) it
      // draws on llvmpipe. FIREFOX_HEADED=1 asks for the window.
      ...(process.env.FIREFOX_HEADED === "1" ? { headless: false } : {}),
      ...(process.env.FIREFOX_PATH
        ? { executablePath: process.env.FIREFOX_PATH }
        : {}),
    });
  // Playwright's WebKit: the engine and shader translator Safari uses, on
  // this machine's GL. It is not iOS Safari (docs/qa/t2/README.md).
  if (engine === "webkit") return webkit.launch();
  if (engine !== "chromium") throw new Error(`Unsupported BROWSER: ${engine}`);
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
