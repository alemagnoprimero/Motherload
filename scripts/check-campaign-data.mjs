import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  BALANCE_VERSION,
  HARDWARE_KEYS,
  HARDWARE_LEVELS,
  HARDWARE_PRICES,
  WORLD_CATALOG,
  W01_GEAR,
  W01_MILESTONES,
  W01_ORES,
} from "../src/campaign/config.ts";
import {
  W02,
  W02_GEAR,
  W02_MILESTONES,
  W02_ORES,
} from "../src/campaign/frontier.ts";
import { knownBalanceVersion } from "../src/campaign/versions.ts";

const source = (name) => new URL(`../design/v0.1/${name}`, import.meta.url);
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, message);

export async function readCampaignDesign(version = BALANCE_VERSION) {
  assert.ok(knownBalanceVersion(version), "unknown balance version");
  const balance = JSON.parse(
    await readFile(source("motherload-balance-v01.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(source("motherload-asset-manifest.json"), "utf8"),
  );
  for (const next of ["0.2", "0.3"]) {
    if (Number(next) > Number(version)) break;
    const overlay = JSON.parse(
      await readFile(
        new URL(`../design/v${next}/balance-overlay.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(overlay.extends, balance.version);
    assert.equal(overlay.version, next);
    for (const [key, ranks] of Object.entries(overlay.hardware_prices ?? {})) {
      const column = HARDWARE_KEYS.indexOf(key);
      assert.ok(column >= 0, "known hardware override");
      for (const [rank, price] of Object.entries(ranks))
        balance.core[Number(rank)][7][column] = price;
    }
    for (const [id, change] of Object.entries(overlay.worlds ?? {})) {
      const world = balance.worlds.find((entry) => entry.id === id);
      assert.ok(world, "known world override");
      if (change.milestone_fees) world.milestone_fees = change.milestone_fees;
      if (change.bulk) world.bulk = change.bulk;
      for (const [index, ore] of world.ores.entries()) {
        if (change.ore_names) ore.name = change.ore_names[index];
        if (change.ore_values) ore.value = change.ore_values[index];
        if (change.ore_bulk) ore.bulk = change.ore_bulk[index];
      }
      for (const [gearId, override] of Object.entries(change.gear ?? {})) {
        const gear = world.gear.find((entry) => entry.id === gearId);
        assert.ok(gear, "known gear override");
        Object.assign(gear, override);
      }
      if (change.jackpot_name) world.jackpot_item.name = change.jackpot_name;
      world.generator_version =
        change.generator_version ?? world.generator_version ?? 1;
    }
    balance.rules = { ...balance.rules, ...overlay.rules };
    balance.version = next;
  }
  if (version !== "0.1") {
    for (const world of balance.worlds) {
      world.ore_names = world.ores.map((ore) => ore.name);
      world.ore_values = world.ores.map((ore) => ore.value);
      world.ore_mean = world.ores.reduce(
        (total, ore) => total + (ore.value * ore.weight) / 100,
        0,
      );
      world.prices = world.gear.map((gear) => gear.price);
      world.project = world.milestone_fees.reduce(
        (total, fee) => total + fee,
        0,
      );
      const previousRank = Math.max(
        0,
        ...world.parents.map(
          (id) => balance.worlds.find((entry) => entry.id === id).core_cap,
        ),
      );
      const newCore = balance.core
        .slice(previousRank + 1, world.core_cap + 1)
        .reduce(
          (sum, row) => sum + row[7].reduce((total, price) => total + price, 0),
          0,
        );
      const localGear = world.prices.reduce((total, price) => total + price, 0);
      const budget = newCore + localGear + world.project;
      world.budget = {
        ...world.budget,
        new_core: newCore,
        local_gear: localGear,
        project: world.project,
        budget,
        minimum_ordinary_value: budget * 3,
        target_net_per_minute: budget / world.minutes,
        required_deposits_per_minute:
          budget / world.minutes / (world.ore_mean * 0.95),
      };
    }
    for (const route of balance.routes) {
      route.rows = route.worlds.map((id) => ({
        ...balance.worlds.find((world) => world.id === id).budget,
      }));
      route.budget = route.rows.reduce((total, row) => total + row.budget, 0);
    }
  }
  return { balance, manifest };
}

/** Validate the source and curated numeric/runtime records without executing prose. */
export function auditCampaignDesign({ balance, manifest }) {
  assert.equal(balance.version, BALANCE_VERSION);
  assert.equal(balance.worlds.length, 15);
  assert.equal(balance.routes.length, 32);
  assert.equal(balance.core.length, 10);
  assert.equal(manifest.length, 251);
  const manifestIds = new Set(manifest.map((asset) => asset.id));
  assert.equal(manifestIds.size, manifest.length, "asset IDs must be unique");
  const worldIds = new Set(balance.worlds.map((world) => world.id));
  assert.equal(
    worldIds.size,
    balance.worlds.length,
    "world IDs must be unique",
  );
  const recordIds = [];
  for (const [rank, row] of balance.core.entries()) {
    assert.equal(row[0], rank);
    assert.equal(row[7].length, 5);
    for (const [column, key] of HARDWARE_KEYS.entries()) {
      assert.equal(HARDWARE_LEVELS[key][rank], row[column + 2]);
      assert.equal(HARDWARE_PRICES[key][rank], row[7][column] * 10);
      if (rank) {
        assert.ok(row[column + 2] > balance.core[rank - 1][column + 2]);
        assert.ok(row[7][column] > 0);
        assert.ok(manifestIds.has(`CORE-${rank}-${key.toUpperCase()}`));
      }
    }
  }

  for (const world of balance.worlds) {
    recordIds.push(world.id);
    const runtime = WORLD_CATALOG.find((entry) => entry.id === world.id);
    assert.ok(runtime, `${world.id} has runtime metadata`);
    assert.equal(runtime.implemented, ["W01", "W02"].includes(world.id));
    assert.equal(runtime.width, world.size[0]);
    assert.equal(runtime.rows, world.size[1]);
    assert.equal(runtime.layers, world.size[2]);
    assert.equal(runtime.depth, world.depth);
    assert.deepEqual(runtime.parents, world.parents);
    assert.equal(
      runtime.topology,
      Number(world.id.slice(1)) <= 6 ? "wrap" : "bounded",
    );
    assert.ok(world.parents.every((id) => worldIds.has(id)));
    assert.equal(world.gear.length, 3);
    assert.equal(world.milestones.length, 3);
    assert.equal(
      world.milestone_fees.reduce((sum, fee) => sum + fee, 0),
      world.project,
    );
    assert.deepEqual(
      world.gear.map((gear) => gear.price),
      world.prices,
    );
    assert.equal(world.ores.length, 4);
    assert.deepEqual(
      world.ores.map((ore) => ore.weight),
      [60, 30, 9, 1],
    );
    assert.ok(
      world.palette.length === 5 &&
        world.palette.every((colour) => /^[0-9A-F]{6}$/i.test(colour)),
    );
    for (const [index, gear] of world.gear.entries()) {
      assert.equal(gear.id, `${world.id}-R${index + 1}`);
      assert.ok(
        gear.requires === null ||
          world.gear.some((entry) => entry.id === gear.requires),
        "gear prerequisite exists",
      );
      recordIds.push(gear.id);
    }
    for (const ore of world.ores) {
      assert.ok(ore.value > 0 && ore.bulk > 0 && ore.mass > 0);
      assert.ok(ore.tags.includes("ordinary"));
      recordIds.push(ore.id);
    }
    recordIds.push(world.jackpot_item.id, world.quest_item.id);
    near(
      world.ores.reduce((sum, ore) => sum + (ore.value * ore.weight) / 100, 0),
      world.ore_mean,
      `${world.id} weighted mean`,
    );
    const budget = world.budget;
    assert.equal(
      budget.local_gear,
      world.gear.reduce((sum, gear) => sum + gear.price, 0),
    );
    assert.equal(budget.project, world.project);
    assert.equal(
      budget.budget,
      budget.new_core + budget.local_gear + budget.project,
    );
    assert.equal(budget.minimum_ordinary_value, budget.budget * 3);
    near(
      budget.target_net_per_minute,
      budget.budget / world.minutes,
      `${world.id} target income`,
    );
    near(
      budget.required_deposits_per_minute,
      budget.budget / world.minutes / (world.ore_mean * 0.95),
      `${world.id} package target`,
    );
    assert.equal(runtime.referenceBudget, budget.budget * 10);
    assert.equal(runtime.ordinaryFloor, budget.minimum_ordinary_value * 10);
  }
  assert.equal(
    new Set(recordIds).size,
    recordIds.length,
    "balance IDs must be unique",
  );
  assert.ok(
    recordIds.every((id) => manifestIds.has(id)),
    "every balance ID needs an asset brief",
  );

  const stages = Array.from({ length: 10 }, (_, step) =>
    balance.worlds.filter((world) => world.step === step),
  );
  const enumerate = (step, prefix = []) =>
    step === stages.length
      ? [prefix]
      : stages[step].flatMap((world) => {
          assert.ok(
            !world.parents.length ||
              world.parents.some((id) => prefix.includes(id)),
            `${world.id} gate must be reachable`,
          );
          return enumerate(step + 1, [...prefix, world.id]);
        });
  const expectedRoutes = new Set(enumerate(0).map((route) => route.join(",")));
  assert.equal(expectedRoutes.size, 32);
  const seen = new Set();
  for (const route of balance.routes) {
    const key = route.worlds.join(",");
    assert.ok(
      expectedRoutes.has(key) && !seen.has(key),
      `${route.id} unique valid route`,
    );
    seen.add(key);
    let highestRank = 0,
      spend = 0,
      minutes = 0;
    for (const [index, id] of route.worlds.entries()) {
      const world = balance.worlds.find((entry) => entry.id === id);
      const hardwareCost = balance.core
        .slice(highestRank + 1, world.core_cap + 1)
        .reduce(
          (sum, row) => sum + row[7].reduce((total, price) => total + price, 0),
          0,
        );
      assert.equal(world.budget.new_core, hardwareCost);
      assert.deepEqual(route.rows[index], world.budget);
      highestRank = Math.max(highestRank, world.core_cap);
      spend += world.budget.budget;
      minutes += world.minutes;
    }
    assert.equal(route.minutes, minutes);
    assert.equal(route.budget, spend);
    assert.equal(minutes, 960);
  }
  assert.equal(seen.size, expectedRoutes.size);
  const w01 = balance.worlds[0];
  assert.deepEqual(
    W01_ORES.map(({ id, name, value, bulk, mass, weight }) => ({
      id,
      name,
      value,
      bulk,
      mass,
      weight,
    })),
    w01.ores.map(({ id, name, value, bulk, mass, weight }) => ({
      id,
      name,
      value: value * 10,
      bulk,
      mass,
      weight,
    })),
  );
  assert.deepEqual(
    W01_GEAR.map((gear) => gear.price),
    w01.prices.map((price) => price * 10),
  );
  assert.deepEqual(
    W01_MILESTONES.map((milestone) => milestone.fee),
    w01.milestone_fees.map((fee) => fee * 10),
  );
  const w02 = balance.worlds.find((world) => world.id === "W02");
  assert.deepEqual([W02.width, W02.rows, 1], w02.size);
  assert.equal(W02.depth, w02.depth);
  assert.equal(W02.budget, w02.budget.budget * 10);
  assert.equal(W02.minOrdinary, w02.budget.minimum_ordinary_value * 10);
  assert.deepEqual(
    W02_ORES.map(({ id, value, bulk, mass, weight, tags }) => ({
      id,
      value,
      bulk,
      mass,
      weight,
      tags,
    })),
    w02.ores.map(({ id, value, bulk, mass, weight, tags }) => ({
      id,
      value: value * 10,
      bulk,
      mass,
      weight,
      tags,
    })),
  );
  assert.deepEqual(
    W02_GEAR.map(({ id, price, slot, requires }) => ({
      id,
      price,
      slot,
      requires,
    })),
    w02.gear.map(({ id, price, slot, requires }) => ({
      id,
      price: price * 10,
      slot,
      requires,
    })),
  );
  assert.deepEqual(
    W02_MILESTONES.map((milestone) => milestone.fee),
    w02.milestone_fees.map((fee) => fee * 10),
  );
  return {
    worlds: worldIds.size,
    routes: seen.size,
    assets: manifestIds.size,
    cells: balance.worlds.reduce(
      (sum, world) => sum + world.size.reduce((a, b) => a * b, 1),
      0,
    ),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const result = auditCampaignDesign(await readCampaignDesign());
  console.log(
    `Campaign source verified: ${result.worlds} worlds, ${result.routes} routes, ${result.assets} asset briefs, ${result.cells.toLocaleString("en-US")} cells. W01 and W02 are implemented.`,
  );
}
