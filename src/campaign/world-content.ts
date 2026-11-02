/** Shared world kit: generation, presentation and discovery use the same bands. */
export interface WorldBand {
  id: string;
  name: string;
  start: number;
  end: number;
  rockChance: number;
  cave: "pocket" | "ledge" | "gallery" | "geode";
  hazard: "none" | "shelf" | "pressure" | "cold" | "vent";
  ambient: number;
  soil: string;
  stone: string;
  backWall: string;
}

export const WORLD_BANDS: Readonly<
  Record<"W01" | "W02", readonly WorldBand[]>
> = {
  W01: [
    {
      id: "W01-A",
      name: "Regolith",
      start: 0,
      end: 10,
      rockChance: 0.04,
      cave: "pocket",
      hazard: "none",
      ambient: 0.85,
      soil: "#737d83",
      stone: "#465660",
      backWall: "#273a46",
    },
    {
      id: "W01-B",
      name: "Broken plates",
      start: 11,
      end: 29,
      rockChance: 0.15,
      cave: "ledge",
      hazard: "shelf",
      ambient: 0.67,
      soil: "#527b8e",
      stone: "#415461",
      backWall: "#23333f",
    },
    {
      id: "W01-C",
      name: "Iron shelf",
      start: 30,
      end: 47,
      rockChance: 0.27,
      cave: "gallery",
      hazard: "shelf",
      ambient: 0.46,
      soil: "#826451",
      stone: "#4b5360",
      backWall: "#302a29",
    },
    {
      id: "W01-D",
      name: "Core rubble",
      start: 48,
      end: 59,
      rockChance: 0.38,
      cave: "geode",
      hazard: "pressure",
      ambient: 0.28,
      soil: "#685f86",
      stone: "#414f69",
      backWall: "#222334",
    },
  ],
  W02: [
    {
      id: "W02-A",
      name: "Snow crust",
      start: 0,
      end: 14,
      rockChance: 0.04,
      cave: "pocket",
      hazard: "none",
      ambient: 0.85,
      soil: "#a7d9e2",
      stone: "#5b8498",
      backWall: "#244b60",
    },
    {
      id: "W02-B",
      name: "Blue glacier",
      start: 15,
      end: 44,
      rockChance: 0.14,
      cave: "ledge",
      hazard: "cold",
      ambient: 0.65,
      soil: "#74b7c8",
      stone: "#426a9a",
      backWall: "#203e58",
    },
    {
      id: "W02-C",
      name: "Clathrate",
      start: 45,
      end: 74,
      rockChance: 0.25,
      cave: "gallery",
      hazard: "vent",
      ambient: 0.44,
      soil: "#65a89a",
      stone: "#497584",
      backWall: "#35464e",
    },
    {
      id: "W02-D",
      name: "Black ice",
      start: 75,
      end: 99,
      rockChance: 0.37,
      cave: "geode",
      hazard: "pressure",
      ambient: 0.28,
      soil: "#827aa3",
      stone: "#39425c",
      backWall: "#353b50",
    },
  ],
};

export function worldBand(worldId: string, row: number): WorldBand {
  const bands = WORLD_BANDS[worldId === "W02" ? "W02" : "W01"];
  return bands.find((band) => row <= band.end) ?? bands[bands.length - 1]!;
}

export const FIELD_LOG_TEXT: Readonly<
  Record<"W01" | "W02", readonly { title: string; text: string }[]>
> = {
  W01: [
    {
      title: "A second seam",
      text: "Survey note: the bright return marks a second shallow seam beside the entry shaft. One good haul repairs a machine. Two good hauls change what it can do.",
    },
    {
      title: "The missing survey",
      text: "The survey mast recorded a hollow knock before its signal failed. This rock has rooms inside it. Keep the shaft open and mark a way home before following an echo.",
    },
    {
      title: "A borrowed ceiling",
      text: "The crew braced the gallery with broken hull plates. Dust falling from a shelf is a warning, not decoration. Wait for the fall from a safe place.",
    },
    {
      title: "Pressure valve",
      text: "The lander's valve was carried down for emergency storage. Whoever left it here expected the lander to fly again. The serial number still matches your repair list.",
    },
    {
      title: "The fused layer",
      text: "Heat welded the old debris into two continuous layers. The stock cutter cannot bite it. A reinforced drill can open the way, slowly; there is no gap around the edge.",
    },
    {
      title: "Antenna workshop",
      text: "An improvised antenna points into solid rock. A note on its mount reads: the signal is below us, not above. Take the antenna back before searching deeper.",
    },
    {
      title: "The surveyor's compass",
      text: "A polished core keeps turning toward the oldest cavity. The first surveyor called it a compass, although it never pointed north. Its housing belongs in a collection, not a furnace.",
    },
    {
      title: "Warm lock",
      text: "The service locker has frozen shut around a thermal seal. An ice-world auger should release it without damaging the contents. Leave a marker and return with the right tool.",
    },
  ],
  W02: [
    {
      title: "Blue landing light",
      text: "The refuge beacon is powered by the same thermal seam as the ice below. Mine the ordinary crust first; a warmer drill is worth more than a rushed descent.",
    },
    {
      title: "A careful release",
      text: "The first volatile pockets leave extra time to learn their rhythm. Cut, watch for the bell, then release. Continuing to pressurize an open pocket ruptures its fragile contents.",
    },
    {
      title: "Cold breath",
      text: "Still mist gathers in a glacier pocket before it bites. The cold does not break a hull, but it steals acceleration. Do not count on a quick escape with a full hold.",
    },
    {
      title: "The sample rack",
      text: "Three intact cores are enough to prove that the deep ice can be processed. There are more samples than the project needs. A mistake need not end the expedition.",
    },
    {
      title: "Steam ledger",
      text: "A technician marked every gram recovered from the auger. The reserve can turn one empty-tank mistake into a return journey. It must be charged before that mistake.",
    },
    {
      title: "Black pressure",
      text: "Dark ice seals gas into thin seams. A fresh cut starts the hiss; move out before the pocket bursts. Better hull plating buys forgiveness, not permission to ignore it.",
    },
    {
      title: "The lantern seed",
      text: "The light inside this geode pulses even without heat. The old crew named it the lantern seed. Its cradle has survived every orbit the comet has made.",
    },
    {
      title: "A return ticket",
      text: "This instrument case opens only inside a preservation field. Its owner planned to return after the main launch. The claim remains yours even after the next destination is charted.",
    },
  ],
};
