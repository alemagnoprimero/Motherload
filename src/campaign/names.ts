/** Display identity is current; saved economic values remain stamped on packages. */
export const ITEM_NAMES: Readonly<Record<string, string>> = {
  "W01-O1": "Slag iron",
  "W01-O2": "Rust copper",
  "W01-O3": "Shard silver",
  "W01-O4": "Core crown",
  "W01-J": "Surveyor's compass",
  "W01-J1": "Surveyor's compass",
  "W02-O1": "Frost iron",
  "W02-O2": "Blue nickel",
  "W02-O3": "Cryosilicate",
  "W02-O4": "Helion ice",
  "W02-J": "Lantern seed",
  "W02-J1": "Lantern seed",
};

export function itemName(itemId: string, fallback = "Unidentified sample") {
  return ITEM_NAMES[itemId] ?? fallback;
}

/** Rank names identify the installed improvement rather than repeating starter copy. */
export function hardwareName(key: string, rank: number) {
  const names: Record<string, readonly string[]> = {
    drill: ["Salvage drill", "Plate cutter", "Deep-core drill"],
    energy: ["Starter tank", "Expedition tank", "Long-range tank"],
    cargo: ["Starter hold", "Reinforced hold", "Freight hold"],
    hull: ["Salvage plating", "Pressure plating", "Thermal plating"],
    engine: ["Starter motor", "Haul motor", "Ascent motor"],
  };
  return names[key]?.[rank] ?? `${key} rank ${rank}`;
}
