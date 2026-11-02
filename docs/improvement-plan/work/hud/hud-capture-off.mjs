// HUD-off backgrounds for the redesign mocks (same scenes as the dive captures).
import { advance, keys, launch, open, probe, save, shotHudOff, shot } from "./hud-lib.mjs";
const browser = await launch();
try {
  for (const kind of process.argv.slice(2)) {
    const { context, page } = await open(browser, kind);
    await keys(page, ["ArrowRight"]);
    await advance(page, 1500);
    await keys(page, ["ArrowDown"]);
    await advance(page, 9000);
    await keys(page, []);
    await advance(page, 600);
    await shot(page, `h-${kind}-dive2`);
    await shotHudOff(page, `h-${kind}-dive2-off`);
    await save(`probe-${kind}-dive2`, { probe: await probe(page) });
    await context.close();
  }
} finally {
  await browser.close();
}
