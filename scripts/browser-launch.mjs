import { chromium, firefox } from "playwright-core";

export function launchBrowser() {
  const engine = process.env.BROWSER || "chromium";
  if (engine === "firefox")
    return firefox.launch({
      ...(process.env.FIREFOX_PATH
        ? { executablePath: process.env.FIREFOX_PATH }
        : {}),
    });
  if (engine !== "chromium") throw new Error(`Unsupported BROWSER: ${engine}`);
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}
