import type { Campaign } from "./model";
import {
  HARDWARE_PRICES,
  W01,
  W01_GEAR,
  W01_MILESTONES,
  W01_SURVEY_MILESTONE,
  formatCredits,
} from "./config";
import { W02, W02_GEAR } from "./frontier";
import { openingRoute, openingSeamPending, postChapterGoal } from "./poi";

export interface MissionTask {
  id: string;
  label: string;
  status: "pending" | "carried" | "complete" | "ready";
}

function optionalSalvage(campaign: Campaign) {
  const site = postChapterGoal(campaign);
  if (!site) return undefined;
  const gear = [...W01_GEAR, ...W02_GEAR].find((item) => item.id === site.tool);
  const equipped = [
    campaign.state.equipped.drill,
    campaign.state.equipped.mobility,
    campaign.state.equipped.processor,
    ...campaign.state.equipped.utilities,
  ];
  const ready = !site.tool || equipped.includes(site.tool);
  const owned = !site.tool || campaign.state.ownedGear.includes(site.tool);
  return {
    task: {
      id: site.id,
      label: site.carried
        ? `${site.name} · onboard`
        : `${site.name} · ${Math.floor(site.y + 1) * 10} m${ready ? "" : ` · needs ${gear?.name ?? "specialist tool"}`}`,
      status: site.carried ? "carried" : ready ? "ready" : "pending",
    } as MissionTask,
    next: site.carried
      ? "Return to lander → Bank the relic"
      : ready
        ? `${site.kind === "log" ? "Read" : "Recover"} ${site.name.toLowerCase()} · ${Math.floor(site.y + 1) * 10} m`
        : owned
          ? `Lander → Install ${gear?.name ?? "the cache tool"}`
          : `${site.tool?.startsWith("W02") && campaign.state.currentWorld === "W01" ? "Ice comet" : "Workshop"} → Obtain ${gear?.name ?? "the cache tool"}`,
    reward:
      site.kind === "log"
        ? "Field journal entry"
        : `Optional salvage · ${formatCredits(site.reward)} CR`,
  };
}

/** The HUD reads earned proof and paid stages; it never advances progression. */
export function campaignMission(campaign: Campaign) {
  if (campaign.state.currentWorld === "W02") return cometMission(campaign);
  const state = campaign.state;
  const milestone = campaign.currentMilestone;
  const salvage = optionalSalvage(campaign);
  if (!milestone)
    return {
      title: state.progress.departed
        ? "Frontier charted"
        : "Ready for departure",
      step: "03 / 03",
      tasks: [
        {
          id: "launch",
          label: state.progress.departed
            ? "Frontier certificate earned"
            : "Launch from the restored lander",
          status: state.progress.departed ? "complete" : "ready",
        },
        ...(salvage ? [salvage.task] : []),
      ] as MissionTask[],
      next: state.progress.departed
        ? (salvage?.next ?? "Ice comet ready · Moon chapter in development")
        : campaign.atDock
          ? "Lander → Launch"
          : "Return to the lander → Launch",
      reward:
        state.progress.departed && salvage
          ? salvage.reward
          : "Ice comet + Fractured moon charted",
    };

  const carriedOre = campaign.cargo.filter((item) =>
    item.tags.includes("ordinary"),
  ).length;
  const tasks: MissionTask[] = [];
  let next = "";
  if (milestone.id === 1) {
    const banked = Math.min(3, state.progress.bankedOre);
    tasks.push({
      id: "ore",
      label:
        (banked === 3 ? "Ore banked" : "Bank ore") +
        ` · ${banked}/3` +
        (banked < 3 && carriedOre ? ` · ${carriedOre} onboard` : ""),
      status: banked === 3 ? "complete" : carriedOre ? "carried" : "pending",
    });
    if (banked < 3)
      next = openingSeamPending(campaign)
        ? "Mine marked seam A · 70 m → Bank ore"
        : carriedOre
          ? "Return to lander → Bank ore"
          : `Mine ${3 - banked} ore packages and bank them`;
  } else {
    const labels: Record<string, { name: string; row: number }> = {
      "W01-VALVE": { name: "Pressure valve", row: W01.valveRow },
      "W01-ANTENNA": { name: "Antenna", row: W01.antennaRow },
      "W01-Q": { name: "Navigation core", row: W01.coreRow },
    };
    for (const id of milestone.requiredMissionIds) {
      const mission = campaign.world.missions.find((item) => item.id === id);
      const definition = labels[id]!;
      const status = mission?.status ?? "source";
      tasks.push({
        id,
        label:
          definition.name +
          (status === "banked"
            ? " · banked"
            : status === "carried"
              ? " · onboard, bank at lander"
              : ` · ${(definition.row + 1) * 10} m`),
        status:
          status === "banked"
            ? "complete"
            : status === "carried"
              ? "carried"
              : "pending",
      });
    }
    if (milestone.id === W01_SURVEY_MILESTONE)
      tasks.push({
        id: "W01-BEACON",
        label: state.progress.beacon
          ? "Wreck beacon · surveyed"
          : `Survey the wreck beacon · ${(W01.beaconRow + 1) * 10} m`,
        status: state.progress.beacon ? "complete" : "pending",
      });
    const carried = tasks.find((task) => task.status === "carried");
    const missing = tasks.find((task) => task.status === "pending");
    if (carried) next = "Return to lander → Bank mission cargo";
    else if (missing)
      next =
        missing.id === "W01-BEACON"
          ? missing.label
          : "Recover " + missing.label.toLowerCase();
  }

  const funded = state.credits >= milestone.fee;
  tasks.push({
    id: "construction",
    label: funded
      ? `Construction · ${formatCredits(milestone.fee)} CR ready`
      : `Construction · ${formatCredits(state.credits)}/${formatCredits(milestone.fee)} CR`,
    status: funded ? "ready" : "pending",
  });
  if (campaign.missionReady)
    next = funded
      ? campaign.atDock
        ? "Lander → Fund construction"
        : "Return to lander → Fund construction"
      : `Sell ore · earn ${formatCredits(milestone.fee - state.credits)} CR more`;

  const opening = openingRoute(campaign);
  if (opening) {
    tasks.unshift({
      id: "opening-upgrade",
      label: `Expedition tank · ${formatCredits(HARDWARE_PRICES.energy[1]!)} CR`,
      status: opening.phase === "upgrade" ? "ready" : "pending",
    });
    if (opening.phase !== "upgrade")
      tasks.unshift({
        id: "opening-seam-b",
        label: `Seam B · ${7 - opening.remaining}/7 collected`,
        status: opening.phase === "sell" ? "carried" : "pending",
      });
    next = opening.next;
  }

  return {
    title: opening?.title ?? milestone.name,
    step: `0${milestone.id} / 0${W01_MILESTONES.length}`,
    tasks,
    next,
    reward:
      milestone.id === 1
        ? "Unlock: rank 1 hardware + shaft brace"
        : milestone.id === 2
          ? "Unlock: cargo rack + star map"
          : "Unlock: Frontier certificate + departure",
  };
}

function cometMission(campaign: Campaign) {
  const milestone = campaign.currentMilestone;
  const salvage = optionalSalvage(campaign);
  if (!milestone)
    return {
      title: "Comet fuel stabilized",
      step: "03 / 03",
      tasks: [
        {
          id: "planetary",
          label: "Planetary certificate earned",
          status: "complete",
        },
        {
          id: "route",
          label: "Iron planet charted · chapter in development",
          status: "complete",
        },
        ...(salvage ? [salvage.task] : []),
      ] as MissionTask[],
      next:
        salvage?.next ??
        (campaign.atDock
          ? "Navigation → Return to Broken asteroid"
          : "Return to the comet lander to travel"),
      reward: salvage?.reward ?? "Claim and equipment preserved",
    };

  const tasks: MissionTask[] = [];
  let next = "";
  if (milestone.id === 1) {
    const banked = Math.min(5, campaign.bankedSamples);
    const carried = campaign.world.missions.filter(
      (item) => item.id.startsWith("W02-SAMPLE-") && item.status === "carried",
    ).length;
    tasks.push({
      id: "samples",
      label:
        `Helion samples · ${banked}/5 banked` +
        (carried ? ` · ${carried} onboard` : ""),
      status: banked >= 5 ? "complete" : carried ? "carried" : "pending",
    });
    const remaining = 5 - banked - carried;
    next =
      banked + carried >= 5
        ? "Return to lander → Bank Helion samples"
        : `Recover ${remaining} more Helion sample${remaining === 1 ? "" : "s"} at ${(W02.sampleRow + 1) * 10} m`;
  } else if (milestone.id === 2) {
    const banked = Math.min(3, campaign.bankedIntact);
    const carried = campaign.cargo.filter(
      (item) =>
        item.itemId === "W02-O3" &&
        item.tags.includes("cryosample") &&
        item.tags.includes("intact"),
    ).length;
    tasks.push({
      id: "intact",
      label:
        `Intact cryosilicate · ${banked}/3 banked` +
        (carried ? ` · ${carried} onboard` : ""),
      status: banked >= 3 ? "complete" : carried ? "carried" : "pending",
    });
    const needsBanking =
      banked + carried >= 3 || campaign.cargoBulk + 2 > campaign.capacity;
    const remaining = 3 - banked - carried;
    next = needsBanking
      ? carried
        ? "Return to lander → Bank intact cryosilicate"
        : "Return to lander → Bank cargo to make room"
      : `Preserve ${remaining} more crystal${remaining === 1 ? "" : "s"} at ${(W02.cryoRow + 1) * 10} m · release after the cut cue`;
  } else {
    const catalyst = campaign.world.missions.find(
      (item) => item.id === "W02-Q",
    );
    const status = catalyst?.status ?? "source";
    tasks.push({
      id: "W02-Q",
      label:
        "Cryogenic catalyst" +
        (status === "banked"
          ? " · banked"
          : status === "carried"
            ? " · onboard, bank at lander"
            : ` · ${((catalyst ? Math.floor(catalyst.y) : W02.coreRow) + 1) * 10} m`),
      status:
        status === "banked"
          ? "complete"
          : status === "carried"
            ? "carried"
            : "pending",
    });
    next =
      status === "carried"
        ? "Return to lander → Bank the catalyst"
        : "Recover the cryogenic catalyst at 1000 m";
  }

  const credits = campaign.state.credits;
  const funded = credits >= milestone.fee;
  tasks.push({
    id: "construction",
    label: funded
      ? `Construction · ${formatCredits(milestone.fee)} CR ready`
      : `Construction · ${formatCredits(credits)}/${formatCredits(milestone.fee)} CR`,
    status: funded ? "ready" : "pending",
  });
  if (campaign.missionReady)
    next = funded
      ? campaign.atDock
        ? "Lander → Fund construction"
        : "Return to lander → Fund construction"
      : `Sell ore · earn ${formatCredits(milestone.fee - credits)} CR more`;
  if (campaign.volatileWindow)
    next = "Release drilling now to preserve the crystal";

  return {
    title: milestone.name,
    step: `0${milestone.id} / 03`,
    tasks,
    next,
    reward:
      milestone.id === 1
        ? "Unlock: steam reserve + heated refuge"
        : milestone.id === 2
          ? "Unlock: preservation chamber"
          : "Unlock: Planetary certificate + Iron planet charted",
  };
}
