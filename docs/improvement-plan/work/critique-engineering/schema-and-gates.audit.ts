// Read-only engineering probes for the improvement-plan critique.
// Nothing here writes to the repository; results go to a scratch JSON file.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import {
  createCampaign,
  decodeCampaign,
  Campaign,
} from "/home/user/Motherload/src/campaign/model.ts";
import {
  W01_MILESTONES,
  W01_GEAR,
  W01_ORES,
  HARDWARE_LEVELS,
} from "/home/user/Motherload/src/campaign/config.ts";
import { W02_GEAR, W02_ORES } from "/home/user/Motherload/src/campaign/frontier.ts";
import {
  auditCampaignDesign,
  readCampaignDesign,
} from "/home/user/Motherload/scripts/check-campaign-data.mjs";

const OUT =
  "/home/user/Motherload/docs/improvement-plan/work/critique-engineering/schema-and-gates.json";

const attempt = (fn: () => unknown) => {
  try {
    fn();
    return "accepted";
  } catch (error) {
    return "rejected: " + (error instanceof Error ? error.message : String(error));
  }
};

it("probes save decoding, stored package fields and the build-time data gate", async () => {
  const results: Record<string, unknown> = {};
  const base = createCampaign(73021);
  const raw = JSON.stringify(base);

  // A2-style additive field (towsUsed) on progress.
  const additive = JSON.parse(raw);
  additive.progress.towsUsed = ["W01"];
  results.additiveProgressField = attempt(() => decodeCampaign(JSON.stringify(additive)));
  results.additiveFieldSurvivesDecode =
    (decodeCampaign(JSON.stringify(additive)).progress as unknown as { towsUsed?: string[] })
      .towsUsed ?? null;

  // Balance 0.2 at top level and on a package.
  const balance = JSON.parse(raw);
  balance.balanceVersion = "0.2";
  results.topLevelBalance02 = attempt(() => decodeCampaign(JSON.stringify(balance)));
  const pkg = JSON.parse(raw);
  pkg.worlds.W01.packages[0].balanceVersion = "0.2";
  results.packageBalance02 = attempt(() => decodeCampaign(JSON.stringify(pkg)));

  // Generator version 2.
  const generator = JSON.parse(raw);
  generator.generatorVersion = 2;
  results.generatorVersion2 = attempt(() => decodeCampaign(JSON.stringify(generator)));

  // A3 fused plate: tile 4 anywhere in W01.
  const plate = JSON.parse(raw);
  plate.worlds.W01.tiles[30 * 40 + 5] = 4;
  results.tile4 = attempt(() => decodeCampaign(JSON.stringify(plate)));

  // Missing nested field -> TypeError path inside decode.
  const missing = JSON.parse(raw);
  delete missing.progress.unlockedWorlds;
  results.missingNestedField = attempt(() => decodeCampaign(JSON.stringify(missing)));

  // Stored per-package fields: names, bulk and value travel with the save.
  const stored = base.worlds.W01!.packages.filter((p) => p.tags.includes("ordinary"));
  results.storedPackageFields = {
    sample: stored.slice(0, 2).map(({ itemId, name, value, bulk, mass, balanceVersion }) => ({
      itemId,
      name,
      value,
      bulk,
      mass,
      balanceVersion,
    })),
    distinctNames: [...new Set(stored.map((p) => p.name))],
  };
  // Simulate G1 by renaming the config in memory, then reload the old save.
  const originalName = W01_ORES[0]!.name;
  (W01_ORES[0] as { name: string }).name = "Renamed ore";
  const reloaded = new Campaign(decodeCampaign(raw));
  results.namesAfterInMemoryRename = [
    ...new Set(
      reloaded.world.packages
        .filter((p) => p.itemId === W01_ORES[0]!.id)
        .map((p) => p.name),
    ),
  ];
  (W01_ORES[0] as { name: string }).name = originalName;

  results.startEnergy = base.vehicle.energy;
  results.energyRank0 = HARDWARE_LEVELS.energy[0];

  // Build gate: does check-campaign-data accept the plan's balance-0.2 values?
  const design = await readCampaignDesign();
  results.gateBaseline = attempt(() => auditCampaignDesign(structuredClone(design)));

  const fees = W01_MILESTONES.map((m) => m.fee);
  const gearPrices = W01_GEAR.map((g) => g.price);
  const w02Prices = W02_GEAR.map((g) => g.price);
  const w02Bulk = W02_ORES.map((o) => o.bulk);
  // (a) A3 fees changed in runtime config only.
  (W01_MILESTONES[1] as { fee: number }).fee = 9000;
  (W01_MILESTONES[2] as { fee: number }).fee = 16000;
  results.gateA3ConfigOnly = attempt(() => auditCampaignDesign(structuredClone(design)));
  // (b) A3 fees changed in config and in the pinned JSON (fees + project + budget).
  const edited = structuredClone(design);
  const w01 = edited.balance.worlds[0];
  w01.milestone_fees = [200, 900, 1600];
  const delta = 2700 - w01.project;
  w01.project = 2700;
  w01.budget.project = 2700;
  w01.budget.budget += delta;
  results.gateA3ConfigAndJson = attempt(() => auditCampaignDesign(edited));
  (W01_MILESTONES[1] as { fee: number }).fee = fees[1]!;
  (W01_MILESTONES[2] as { fee: number }).fee = fees[2]!;

  // A4: feet 400 -> 250 CR; W02 condenser 2,200 -> 1,600 CR.
  (W01_GEAR[1] as { price: number }).price = 2500;
  results.gateA4FeetPrice = attempt(() => auditCampaignDesign(structuredClone(design)));
  (W01_GEAR[1] as { price: number }).price = gearPrices[1]!;
  (W02_GEAR[1] as { price: number }).price = 16000;
  results.gateA4CondenserPrice = attempt(() => auditCampaignDesign(structuredClone(design)));
  (W02_GEAR[1] as { price: number }).price = w02Prices[1]!;

  // A5: W02 commons bulk 2 -> 1.
  (W02_ORES[0] as { bulk: number }).bulk = 1;
  (W02_ORES[1] as { bulk: number }).bulk = 1;
  results.gateA5Bulk = attempt(() => auditCampaignDesign(structuredClone(design)));
  (W02_ORES[0] as { bulk: number }).bulk = w02Bulk[0]!;
  (W02_ORES[1] as { bulk: number }).bulk = w02Bulk[1]!;

  results.gateRestored = attempt(() => auditCampaignDesign(structuredClone(design)));
  writeFileSync(OUT, JSON.stringify(results, null, 2));
});
