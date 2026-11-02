export const CONTRACTS = [
  {
    id: "W01-C1",
    worldId: "W01",
    title: "Reclaim the scrap",
    description: "Sell 12 ordinary packages after accepting this contract.",
    target: 12,
    reward: 1200,
    metric: "sold",
  },
  {
    id: "W01-C2",
    worldId: "W01",
    title: "Survey the lower shelf",
    description: "Reach 450 m and return to the lander.",
    target: 450,
    reward: 2500,
    metric: "depth",
  },
  {
    id: "W02-C1",
    worldId: "W02",
    title: "Cold-chain delivery",
    description:
      "Sell 6 intact volatile packages after accepting this contract.",
    target: 6,
    reward: 3000,
    metric: "intact",
  },
  {
    id: "W02-C2",
    worldId: "W02",
    title: "Black-ice survey",
    description: "Reach 800 m and return to the lander.",
    target: 800,
    reward: 5000,
    metric: "depth",
  },
] as const;
