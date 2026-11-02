import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW01Content } from "../world-variant-content.ts";
it("dbg", () => {
  const out: string[] = [];
  for (let s = 1; s <= 200; s++) {
    const world = createW01Content(s);
    const w = world.width;
    const locs = new Map<string, number>();
    for (const p of world.packages) locs.set(`${p.x},${p.y}`, (locs.get(`${p.x},${p.y}`) ?? 0) + 1);
    const dups = [...locs.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const inAir = world.packages.filter((p) => world.tiles[Math.floor(p.y) * w + Math.floor(p.x)] === 0).map((p) => p.id);
    const routeAir = [...Array(60).keys()].filter((r) => world.tiles[r * w + 20] === 0);
    const missionAir = world.missions.filter((m) => world.tiles[Math.floor(m.y) * w + Math.floor(m.x)] === 0).map((m) => m.id);
    const counts = [1, 2, 3, 4].map((n) => world.packages.filter((p) => p.itemId === `W01-O${n}`).length).join();
    if (dups.length || inAir.length || routeAir.length || missionAir.length || counts !== "240,120,36,4")
      out.push(JSON.stringify({ s, dups, inAir, routeAir, missionAir, counts }));
  }
  writeFileSync(__dirname + "/dbg.json", out.join("\n"));
});
