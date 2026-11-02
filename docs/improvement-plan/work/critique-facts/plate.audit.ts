// A3 check: if rows 30-31 of today's W01 become a drill-gated plate, do generated
// caves offer a bypass (solid-only conversion), and what does the plate overwrite?
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { createW01 } from "/home/user/Motherload/src/campaign/world.ts";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/critique-facts/plate-results.json";

it("plate bypass and overwrite", () => {
  let bypass = 0;
  let airInPlateRows = 0;
  let shelfPocketHit = 0;
  const examples: number[] = [];
  const N = 200;
  for (let seed = 1; seed <= N; seed++) {
    const w = createW01(seed);
    const W = w.width;
    const air = (c: number, r: number) => w.tiles[r * W + ((c % W) + W) % W] === 0;
    // connected air regions inside rows 30-31 (wrap horizontally)
    const seen = new Set<number>();
    let found = false;
    let anyAir = false;
    for (const r0 of [30, 31])
      for (let c0 = 0; c0 < W; c0++) {
        if (!air(c0, r0)) continue;
        anyAir = true;
        const k0 = r0 * W + c0;
        if (seen.has(k0)) continue;
        const queue = [[c0, r0]];
        seen.add(k0);
        let hasRow30 = false,
          hasRow31 = false;
        while (queue.length) {
          const [c, r] = queue.pop()!;
          if (r === 30) hasRow30 = true;
          if (r === 31) hasRow31 = true;
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = (((c! + dc!) % W) + W) % W,
              nr = r! + dr!;
            if (nr < 30 || nr > 31 || !air(nc, nr)) continue;
            const k = nr * W + nc;
            if (seen.has(k)) continue;
            seen.add(k);
            queue.push([nc, nr]);
          }
        }
        // entering a row-30 air cell from row 29 above, exiting from a row-31 air cell into row 32
        if (hasRow30 && hasRow31) found = true;
      }
    if (anyAir) airInPlateRows++;
    if (found) {
      bypass++;
      if (examples.length < 8) examples.push(seed);
    }
    // shelf 2 pocket (row 30, cols 30-32) and floor (row 31, col 31)
    const shelf = w.shelves.find((s) => Math.floor(s.y) === 29);
    if (shelf && air(31, 30) && w.tiles[31 * W + 31] === 1) shelfPocketHit++;
  }
  writeFileSync(
    OUT,
    JSON.stringify({ seeds: N, seedsWithAirInRows30_31: airInPlateRows, seedsWithCaveBypass: bypass, examples, shelf2PocketInPlateRows: shelfPocketHit }, null, 1),
  );
}, 60000);
