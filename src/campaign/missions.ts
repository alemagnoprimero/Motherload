import type { Campaign } from "./model";
import { W01, W01_MILESTONES, formatCredits } from "./config";

export interface MissionTask {
  id: string;
  label: string;
  status: "pending" | "carried" | "complete" | "ready";
}

/** The HUD reads earned proof and paid stages; it never advances progression. */
export function campaignMission(campaign: Campaign) {
  const state = campaign.state;
  const milestone = campaign.currentMilestone;
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
      ] as MissionTask[],
      next: state.progress.departed
        ? "Next destinations charted · chapter in development"
        : campaign.atDock
          ? "Lander → Launch"
          : "Return to the lander → Launch",
      reward: "Ice comet + Fractured moon charted",
    };

  const carriedOre = campaign.cargo.filter((item) =>
    item.tags.includes("ordinary"),
  ).length;
  const tasks: MissionTask[] = [];
  let next = "";
  if (milestone.id === 1) {
    tasks.push({
      id: "beacon",
      label: state.progress.beacon
        ? "Beacon surveyed"
        : `Survey beacon · ${(W01.beaconRow + 1) * 10} m`,
      status: state.progress.beacon ? "complete" : "pending",
    });
    const banked = Math.min(3, state.progress.bankedOre);
    tasks.push({
      id: "ore",
      label:
        (banked === 3 ? "Ore banked" : "Bank ore") +
        ` · ${banked}/3` +
        (banked < 3 && carriedOre ? ` · ${carriedOre} onboard` : ""),
      status: banked === 3 ? "complete" : carriedOre ? "carried" : "pending",
    });
    if (!state.progress.beacon)
      next = `Survey the beacon at ${(W01.beaconRow + 1) * 10} m`;
    else if (banked < 3)
      next = carriedOre
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
    const carried = tasks.find((task) => task.status === "carried");
    const missing = tasks.find((task) => task.status === "pending");
    if (carried) next = "Return to lander → Bank mission cargo";
    else if (missing) next = "Recover " + missing.label.toLowerCase();
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

  return {
    title: milestone.name,
    step: `0${milestone.id} / 0${W01_MILESTONES.length}`,
    tasks,
    next,
    reward:
      milestone.id === 1
        ? "Unlock: rank 1 hardware + anchoring feet"
        : milestone.id === 2
          ? "Unlock: cargo rack + star map"
          : "Unlock: Frontier certificate + departure",
  };
}
