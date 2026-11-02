/** Original W02 drawings. Run explicitly to refresh editable SVG sources. */
import { mkdir, writeFile } from "node:fs/promises";
import {
  stars,
  skyBody,
  ridges,
  bedrock,
  materialRim,
} from "../phase0-sources.mjs";

const directory = new URL("./", import.meta.url);
await mkdir(directory, { recursive: true });
const INK = "#102B3D",
  PALE = "#B8E6EB",
  TEAL = "#49D8C6",
  GOLD = "#F7C673";
const path = (d, fill, stroke = INK, width = 3, extra = "") =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const rect = (x, y, w, h, fill, rx = 0, stroke = INK, sw = 3) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const circle = (x, y, r, fill, stroke = INK, sw = 3) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const layer = (name, content) =>
  `<g id="${name}" data-layer="${name}">${content}</g>`;
const frames = [],
  backgrounds = [];
async function save(name, width, height, content, extra = {}) {
  const drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${name}</title><g stroke-linecap="round" stroke-linejoin="round">${content}</g></svg>\n`;
  await writeFile(new URL(`${name}.svg`, directory), drawing);
  const record = {
    name,
    width,
    height,
    logicalWidth: width / 2,
    logicalHeight: height / 2,
    ...extra,
  };
  (extra.background ? backgrounds : frames).push(record);
}

function ice(variant, edges = 0, rock = false) {
  const a = (variant * 11) % 24,
    b = (variant * 7) % 20;
  let content = layer(
    "frozen-substrate",
    rect(0, 0, 96, 96, rock ? "#396378" : "#559AAA", 0, "none", 0),
  );
  content += layer(
    "long-facets",
    path(
      `M0 ${52 + b} L${23 + a} 0 H${65 + a / 2} L${42 + a} 96 H0 Z`,
      rock ? "#648795" : "#8CCAD1",
      "none",
      0,
    ) +
      path(
        `M${23 + a} 0 H${65 + a / 2} L96 ${42 - b / 2} V96 H${42 + a} L${64 - a / 2} ${45 + b} Z`,
        rock ? "#2C5067" : "#3C8196",
        "none",
        0,
      ) +
      path(
        `M${23 + a} 0 L${11 + a} ${47 + b} L${42 + a} 96 M${65 + a / 2} 0 L${64 - a / 2} ${45 + b} L96 ${75 - b}`,
        "none",
        rock ? "#9BBCC2" : PALE,
        rock ? 2 : 2.5,
      ) +
      path(
        `M0 ${76 - b} Q${30 + a} ${57 - b} 96 ${60 - b}`,
        "none",
        rock ? "#23465B" : "#286779",
        3,
      ),
  );
  content += layer(
    "trapped-bubbles",
    circle(
      17 + a,
      22 + b,
      rock ? 2.5 : 5,
      "none",
      rock ? "#789CA8" : "#B8E6EB",
      1.5,
    ) + circle(73 - a / 2, 70 - b, 2, "#A2D5DA", "none", 0),
  );
  let border = "";
  if (edges & 1)
    border +=
      path("M0 3 H21 L29 8 H48 L57 3 H78 L85 6 H96", "none", PALE, 6) +
      path("M0 10 H22 L30 15 H49 L58 10 H79 L86 13 H96", "none", INK, 3);
  if (edges & 2)
    border +=
      path("M93 0 V23 L88 33 V52 L93 61 V80 L89 87 V96", "none", "#8CC8D1", 5) +
      path("M85 0 V23 L80 33 V52 L85 61 V80 L81 87 V96", "none", INK, 3);
  if (edges & 4)
    border +=
      path("M0 93 H22 L30 88 H50 L58 93 H78 L86 88 H96", "none", INK, 6) +
      path("M0 87 H22 L30 82 H50 L58 87 H78 L86 82 H96", "none", "#80B7C1", 2);
  if (edges & 8)
    border +=
      path("M3 0 V23 L8 31 V52 L3 60 V78 L8 86 V96", "none", PALE, 5) +
      path("M11 0 V22 L16 30 V53 L11 61 V79 L16 87 V96", "none", INK, 3);
  return content + layer("exposed-outline", border);
}
for (let i = 0; i < 8; i++) await save(`ice-${i}`, 96, 96, ice(i));
for (let i = 0; i < 16; i++)
  await save(`ice-edge-${i}`, 96, 96, i ? materialRim(i, "ice") : ice(0));
for (let i = 0; i < 4; i++)
  await save(`frozen-rock-${i}`, 96, 96, ice(i, 0, true));
for (let i = 0; i < 16; i++)
  await save(
    `frozen-rock-edge-${i}`,
    96,
    96,
    i ? materialRim(i, "frozen-rock") : ice(1, 0, true),
  );
for (let i = 1; i < 16; i++)
  await save(`bedrock-edge-${i}`, 96, 96, materialRim(i, "bedrock"));
await save("bedrock-0", 96, 96, bedrock(true));
await save("sky-body", 256, 256, skyBody(true));

function mineral(index) {
  if (index === 0)
    return layer(
      "chipped-iron-cluster",
      path(
        "M11 67 L22 45 L39 37 L52 48 L71 43 L87 64 L75 79 L32 82 Z",
        "#84ABB8",
      ) +
        path("M22 45 L39 37 L52 48 L42 63 L11 67 Z", "#D8EEF0") +
        path("M52 48 L71 43 L87 64 L65 69 L42 63 Z", "#A4CDD4") +
        path("M42 63 L65 69 L75 79 L32 82 L11 67 Z", "#6894A6") +
        path("M33 46 L29 55 M58 52 L64 57", "none", "#F1FCF8", 2),
    );
  if (index === 1)
    return layer(
      "paired-nickel-facets",
      path("M14 73 L24 29 L40 15 L52 38 L45 80 Z", "#6199B3") +
        path("M24 29 L40 15 L36 64 L14 73 Z", "#C8EAF2") +
        path("M40 15 L52 38 L45 80 L36 64 Z", "#3C8196") +
        path("M46 77 L54 39 L71 24 L84 47 L78 81 Z", "#7FBBD1") +
        path("M54 39 L71 24 L67 67 L46 77 Z", "#EDF9F6") +
        path("M71 24 L84 47 L78 81 L67 67 Z", "#2E6B8A"),
    );
  if (index === 2)
    return layer(
      "three-point-cryosilicate",
      path(
        "M48 9 L60 38 L84 27 L78 58 L86 73 L56 79 L43 90 L31 68 L10 57 L32 42 Z",
        "#2C938F",
      ) +
        path("M48 9 L50 55 L32 42 Z", "#D4FAEE") +
        path("M48 9 L60 38 L50 55 Z", TEAL) +
        path("M84 27 L50 55 L60 38 Z", "#B4FAE9") +
        path("M84 27 L78 58 L50 55 Z", "#4DD6BD") +
        path("M10 57 L50 55 L31 68 Z", "#A5E8E3") +
        path("M50 55 L56 79 L43 90 L31 68 Z", "#55B7B0") +
        path("M50 55 L78 58 L86 73 L56 79 Z", "#84E4CB") +
        circle(50, 55, 5, PALE, INK, 2),
    );
  return layer(
    "hollow-helion-crown",
    path(
      "M12 43 L25 16 L40 35 L50 12 L65 33 L79 19 L88 47 L78 80 L50 89 L23 78 Z",
      "#379EAE",
    ) +
      path("M25 16 L31 48 L12 43 Z", PALE) +
      path("M50 12 L56 47 L40 35 Z", "#C7FFF2") +
      path("M79 19 L88 47 L65 33 Z", PALE) +
      path("M12 43 L31 48 L34 68 L23 78 Z", "#7CD5D5") +
      path("M88 47 L70 49 L67 69 L78 80 Z", "#A4E8D9") +
      path("M23 78 L34 68 L67 69 L78 80 L50 89 Z", "#60BEBF") +
      path("M31 48 L56 47 L70 49 L67 69 L34 68 Z", INK) +
      path("M36 54 H62 M38 62 H61", "none", TEAL, 2),
  );
}
for (let i = 0; i < 4; i++) {
  const identification = layer(
    "grayscale-identification",
    Array.from({ length: i + 1 }, (_, j) =>
      rect(30 + j * 10, 89, 6, 3, PALE, 1, "none", 0),
    ).join(""),
  );
  await save(`ore-o${i + 1}`, 96, 96, mineral(i) + identification, {
    category: "mineral",
  });
  await save(
    `package-o${i + 1}`,
    96,
    96,
    `<g transform="translate(13 9) scale(.74)">${mineral(i)}</g>` +
      layer(
        "sealed-cargo-harness",
        path("M16 54 L25 77 H73 L82 54 M25 77 V88 H73 V77", "none", PALE, 5) +
          rect(39, 73, 19, 13, GOLD, 3) +
          path("M45 79 H52", "none", INK, 2),
      ) +
      identification,
    { category: "package" },
  );
}
await save(
  "mission-sample",
  96,
  96,
  layer(
    "sample-canister",
    rect(29, 17, 39, 65, "#335B6D", 9) +
      rect(35, 25, 27, 45, "#17424F", 5) +
      path("M36 52 L44 35 L54 45 L61 34 V65 H36 Z", TEAL, PALE, 2) +
      rect(28, 13, 41, 12, GOLD, 4) +
      rect(31, 75, 35, 10, "#8DB7BE", 3) +
      path("M42 19 H56 M45 79 H53", "none", INK, 2),
  ),
  { category: "mission" },
);
await save(
  "mission-cryovein",
  96,
  96,
  layer(
    "precision-sample-marker",
    circle(48, 49, 39, "#143A48", "#8CD9DA", 3) +
      `<g transform="translate(13 10) scale(.73)">${mineral(2)}</g>` +
      path(
        "M15 20 V10 H27 M69 10 H81 V20 M15 75 V86 H27 M69 86 H81 V75",
        "none",
        GOLD,
        4,
      ),
  ),
  { category: "mission" },
);
await save(
  "mission-catalyst",
  96,
  96,
  layer(
    "copper-capsule-loop",
    path("M33 22 Q14 40 22 65 Q29 86 47 86", "none", "#D49664", 8) +
      path(
        "M47 12 C41 28 24 47 29 64 Q33 80 49 83 Q69 79 72 62 C75 46 57 27 47 12 Z",
        "#4D8FA2",
        PALE,
        3,
      ),
  ) +
    layer(
      "suspended-seed",
      path("M48 36 L58 52 L49 68 L39 52 Z", GOLD, INK, 3) +
        path("M49 40 V63", "none", "#FFF1B3", 2) +
        circle(50, 22, 3, "#EDFDF9", "none", 0),
    ),
  { category: "mission" },
);
await save(
  "relic",
  96,
  96,
  layer(
    "five-point-relic",
    path(
      "M48 9 L60 27 L82 26 L78 48 L90 66 L68 75 L59 91 L41 78 L20 82 L20 59 L8 43 L29 33 Z",
      "#6B9CAA",
      PALE,
      3,
    ) +
      path(
        "M48 27 L60 40 L70 50 L60 66 L43 68 L29 53 L35 37 Z",
        INK,
        "#8DCEC9",
        4,
      ) +
      path("M48 35 L59 49 L49 61 L37 49 Z", GOLD) +
      path("M60 27 L56 36 M20 59 L29 56 M59 91 L54 72", "none", INK, 5),
  ),
  { category: "relic" },
);

await save(
  "tool-thermal",
  128,
  128,
  layer(
    "warm-drill-collar",
    path("M79 62 L102 64 L109 81 L103 94 L79 91 Z", "#B57B52", INK, 4) +
      path("M83 66 L99 68 L103 80 L98 88 L83 86 Z", GOLD, INK, 2) +
      path("M89 91 L91 104 L95 98 L99 107 L103 92", "#ECF7E9", INK, 3) +
      path("M83 78 H101", "none", "#FFE9AE", 3),
  ),
  { category: "equipment", pivot: { x: 0.5, y: 0.5 } },
);
await save(
  "tool-condenser",
  128,
  128,
  layer(
    "condenser-mount",
    rect(19, 37, 34, 42, "#375F70", 4) +
      rect(22, 33, 12, 43, "#A2DCE2", 5) +
      rect(38, 33, 12, 43, "#A2DCE2", 5) +
      path("M25 67 H31 M41 61 H47 M29 76 V83 H45 V76", "none", "#DBA46A", 3),
  ) +
    layer(
      "visible-vapour-bubbles",
      circle(28, 48, 2.5, TEAL, INK, 1) +
        circle(44, 52, 3, PALE, INK, 1) +
        circle(44, 41, 2, TEAL, "none", 0),
    ),
  { category: "equipment", pivot: { x: 0.5, y: 0.5 } },
);
await save(
  "tool-preservation",
  128,
  128,
  layer(
    "insulated-chamber",
    path("M20 57 L28 49 H47 L56 58 V78 L47 87 H28 L20 78 Z", PALE, INK, 4) +
      path(
        "M27 59 L32 55 H44 L49 60 V76 L44 81 H32 L27 76 Z",
        "#26576C",
        INK,
        2,
      ) +
      path("M37 59 L43 67 L37 76 L32 67 Z", TEAL, INK, 2) +
      circle(48, 81, 2, GOLD, INK, 1),
  ),
  { category: "equipment", pivot: { x: 0.5, y: 0.5 } },
);

// Global rank-2 hardware shares the unchanged cabin and W01 mount anchors.
await save(
  "rig-engine-2",
  128,
  128,
  layer(
    "survey-drive",
    path(
      "M20 48 L25 43 H42 L47 49 V70 L41 77 H23 L18 70 V55 Z",
      "#7299A5",
      INK,
      4,
    ) +
      rect(25, 47, 16, 8, PALE, 3, INK, 2) +
      path("M21 60 H44 M21 66 H44", "none", INK, 4) +
      rect(24, 69, 7, 9, "#BB8A61", 2, INK, 2) +
      rect(35, 69, 7, 9, "#BB8A61", 2, INK, 2) +
      path("M28 50 H37 M27 73 V76 M38 73 V76", "none", TEAL, 2) +
      path("M36 43 V37 H44 V45", "none", "#D4E8E4", 4),
  ),
  { category: "core_hardware", pivot: { x: 0.5, y: 0.5 } },
);
await save(
  "rig-energy-2",
  128,
  128,
  layer(
    "survey-energy-vessel",
    path("M13 41 L17 36 H25 L30 42 V68 L26 74 H16 L11 68 V47 Z", PALE, INK, 4) +
      rect(15, 43, 11, 23, "#25566B", 4, INK, 2) +
      path("M15 50 H26 M15 58 H26", "none", TEAL, 3) +
      rect(16, 33, 10, 6, "#BB8A61", 2, INK, 2) +
      rect(16, 68, 10, 7, "#BB8A61", 2, INK, 2) +
      path("M19 45 V47 M19 62 V65", "none", "#DBF7ED", 2),
  ),
  { category: "core_hardware", pivot: { x: 0.5, y: 0.5 } },
);
await save(
  "rig-bay-2",
  128,
  128,
  layer(
    "sealed-survey-bay",
    path("M21 52 L26 48 H45 L48 54 V76 H19 V58 Z", "#92BCC5", INK, 4) +
      rect(24, 54, 19, 18, "#385F72", 2, INK, 2) +
      path("M33 54 V72 M24 61 H43", "none", "#BCDDE0", 2) +
      rect(30, 61, 7, 7, "#CEA16E", 1, INK, 2) +
      path("M24 50 H43 M23 75 H44", "none", PALE, 2),
  ),
  { category: "core_hardware", pivot: { x: 0.5, y: 0.5 } },
);
await save(
  "rig-hull-2",
  128,
  128,
  layer(
    "overlapping-survey-armour",
    path("M45 65 L55 60 H93 L103 66 V76 H44 Z", "#6D98A7", INK, 3) +
      path("M47 66 L56 63 H70 L68 73 H46 Z", "#C6E3E4", INK, 2) +
      path("M70 63 H86 L89 73 H68 Z", "#E4EDE4", INK, 2) +
      path("M86 63 H93 L100 67 V73 H89 Z", "#A6CDD5", INK, 2) +
      path("M55 68 H63 M75 68 H82 M92 68 H97", "none", TEAL, 2) +
      path("M49 75 H99", "none", "#CA9D6C", 2),
  ),
  { category: "core_hardware", pivot: { x: 0.5, y: 0.5 } },
);
const surveyCollar = layer(
  "survey-drill-collar",
  rect(98, 53, 15, 29, "#B6D6DA", 4, INK, 3) +
    rect(98, 61, 16, 11, "#437D8D", 2, INK, 2) +
    path("M97 52 H114 M97 84 H114", "none", "#C39165", 4) +
    path("M101 65 H111 M101 69 H111", "none", TEAL, 2) +
    circle(105, 57, 2, "#DDF4ED", INK, 1.5) +
    circle(105, 77, 2, "#DDF4ED", INK, 1.5),
);
for (const direction of ["left", "right", "down"])
  await save(
    `rig-drill-collar-${direction}-2`,
    128,
    128,
    direction === "left"
      ? `<g transform="translate(128 0) scale(-1 1)">${surveyCollar}</g>`
      : direction === "down"
        ? `<g transform="translate(132 0) rotate(90 0 0)">${surveyCollar}</g>`
        : surveyCollar,
    { category: "core_hardware", pivot: { x: 0.5, y: 0.5 } },
  );

function refuge(stage) {
  let content = layer(
    "heated-landing-pad",
    path("M13 258 H370 L379 278 H6 Z", "#36596B", INK, 6) +
      rect(25, 254, 334, 12, PALE, 3) +
      path("M42 272 H97 M287 272 H342", "none", GOLD, 4),
  );
  content += layer(
    "service-refuge",
    path("M54 252 V175 L82 142 H166 L188 175 V252 Z", "#376A7E", INK, 5) +
      path("M65 175 L87 151 H161 L178 175 Z", PALE, INK, 3) +
      rect(91, 188, 59, 64, "#142F40", 7) +
      rect(99, 199, 43, 32, stage > 0 ? GOLD : "#718F9A", 5) +
      path("M119 203 V226 M103 215 H138", "none", "#FFF1CC", 2) +
      path("M64 187 V232 M176 187 V232", "none", "#8ABDC8", 4),
  );
  content += layer(
    "surface-terminal",
    rect(218, 211, 39, 42, "#8BBAC3", 5) +
      rect(224, 217, 27, 23, "#183B4C", 3) +
      path("M230 229 H245 M230 234 H240", "none", TEAL, 2) +
      path("M237 253 V264", "none", INK, 5),
  );
  if (stage === 0)
    content += layer(
      "planned-condenser",
      path(
        "M270 249 V135 L290 112 H327 L348 135 V249 M271 162 H347 M282 114 V250 M337 124 V250",
        "none",
        "#7EAAB8",
        4,
        'stroke-dasharray="10 8"',
      ) + path("M163 243 H218 M257 243 H277", "none", "#809CAA", 5),
    );
  if (stage >= 1)
    content += layer(
      "warm-refuge-service",
      rect(57, 234, 28, 18, "#C78C54", 3) +
        path("M68 239 L66 248 M76 239 L74 248", "none", GOLD, 3) +
        path("M72 142 V115 H92", "none", PALE, 7) +
        path("M91 115 V97", "none", PALE, 5) +
        circle(91, 94, 5, GOLD, INK, 2),
    );
  if (stage >= 2)
    content += layer(
      "built-condenser",
      path("M269 249 V141 L288 116 H328 L348 141 V249 Z", "#3C8196", INK, 5) +
        rect(281, 143, 22, 88, PALE, 9) +
        rect(315, 143, 22, 88, PALE, 9) +
        rect(286, 148, 12, 77, "#206677", 5) +
        rect(320, 148, 12, 77, "#206677", 5) +
        path(
          "M287 199 H298 M321 187 H332 M287 174 H298 M321 210 H332",
          "none",
          TEAL,
          4,
        ) +
        path("M288 118 V94 H327 V118", "none", "#BD936B", 8) +
        path("M273 245 H246", "none", "#BD936B", 7),
    );
  if (stage >= 3)
    content += layer(
      "stabilized-catalyst-vessel",
      path(
        "M181 166 L195 149 H218 L231 166 V196 L218 211 H195 L181 196 Z",
        "#8BBEC7",
        INK,
        4,
      ) +
        rect(190, 167, 32, 30, "#194B5B", 5) +
        path("M206 171 L214 182 L206 192 L198 182 Z", GOLD, INK, 2) +
        path("M205 149 V128 H286 M220 209 V240", "none", "#CEA06E", 5) +
        circle(347, 136, 5, TEAL, INK, 2),
    );
  return content;
}
for (let i = 0; i < 4; i++)
  await save(`dock-stage-${i}`, 384, 288, refuge(i), { category: "structure" });
await save(
  "cold-warning",
  96,
  96,
  layer(
    "cold-pocket-warning",
    path("M48 11 L87 80 H9 Z", "#173D50", GOLD, 4) +
      path(
        "M48 32 V65 M33 41 L63 57 M33 57 L63 41 M43 35 L48 41 L53 35 M43 62 L48 56 L53 62",
        "none",
        PALE,
        3,
      ),
  ),
  { category: "hazard" },
);
await save(
  "ice-vent",
  96,
  96,
  layer(
    "vent-outlet",
    path("M11 79 L25 64 H72 L86 79 L76 88 H21 Z", "#3C8196", INK, 4) +
      path("M29 68 V82 M41 67 V83 M54 67 V83 M67 68 V82", "none", "#B8E6EB", 3),
  ) +
    layer(
      "mist-plumes",
      path(
        "M30 59 C14 48 39 44 29 27 M47 59 C32 46 59 39 47 18 M64 59 C50 47 75 42 65 29",
        "none",
        TEAL,
        5,
      ),
    ),
  { category: "hazard" },
);
await save(
  "world-w02",
  96,
  96,
  layer(
    "ice-comet-icon",
    path(
      "M52 15 L89 7 L72 38 L87 54 L57 89 L18 80 L8 44 Z",
      "#548DA0",
      INK,
      4,
    ) +
      path("M8 44 L52 15 L46 46 L18 80 Z", PALE) +
      path("M46 46 L72 38 L87 54 L57 89 Z", "#82D3D8") +
      path("M46 46 L57 89 M52 15 L72 38", "none", "#B9F7EC", 3) +
      path("M11 18 L28 6 M2 32 L15 24", "none", GOLD, 3),
  ),
  { category: "world" },
);

await save("w02-sky", 1024, 512, stars(true), { background: true });
await save("w02-ridge-far", 1024, 384, ridges(false, true), {
  background: true,
});
await save("w02-ridge-near", 1024, 384, ridges(true, true), {
  background: true,
});

await writeFile(
  new URL("frames.json", directory),
  JSON.stringify(
    {
      version: "0.1",
      world: "W02",
      logicalTile: 48,
      authorScale: 2,
      rigPivot: [64, 64],
      rigTreadBaseline: 100,
      frames,
      backgrounds,
    },
    null,
    2,
  ) + "\n",
);

const asset = (category, names, note = "") => ({
  category,
  frames: names,
  icon: names[0],
  iconSizes: [64, 128],
  ...(note ? { note } : {}),
});
const coreAsset = (names) => ({
  ...asset(
    "core_hardware",
    names,
    "Global rank-2 modules and icons, including earlier-world revisits. Existing shared rig damage overlays remain in use.",
  ),
  implementedOutputs: ["installed module", "64px icon", "128px icon"],
  pendingOutputs: ["rank-specific damage overlays"],
});
await writeFile(
  new URL("asset-map.json", directory),
  JSON.stringify(
    {
      version: "0.1",
      world: "W02",
      source: "Original layered SVGs; create-sources.mjs",
      completeManifest: false,
      assets: {
        W02: asset(
          "world",
          [
            "world-w02",
            ...frames
              .filter((f) => /^(ice-|frozen-rock-)/.test(f.name))
              .map((f) => f.name),
          ],
          "World subset: terrain, hazards and three backgrounds; rig cabin remains shared W01 artwork.",
        ),
        "W02-R1": asset("equipment", ["tool-thermal"]),
        "W02-R2": asset("equipment", ["tool-condenser"]),
        "W02-R3": asset("equipment", ["tool-preservation"]),
        "CORE-2-DRILL": coreAsset([
          "rig-drill-collar-right-2",
          "rig-drill-collar-left-2",
          "rig-drill-collar-down-2",
        ]),
        "CORE-2-ENERGY": coreAsset(["rig-energy-2"]),
        "CORE-2-CARGO": coreAsset(["rig-bay-2"]),
        "CORE-2-HULL": coreAsset(["rig-hull-2"]),
        "CORE-2-ENGINE": coreAsset(["rig-engine-2"]),
        ...Object.fromEntries(
          Array.from({ length: 4 }, (_, i) => [
            `W02-O${i + 1}`,
            asset("mineral", [`ore-o${i + 1}`, `package-o${i + 1}`]),
          ]),
        ),
        "W02-J": asset("relic", ["relic"]),
        "W02-Q": asset("mission", ["mission-catalyst"]),
        "W02-S1": asset(
          "structure",
          ["dock-stage-0", "dock-stage-1"],
          "Arrival service refuge and heated completed refuge.",
        ),
        "W02-S3": asset(
          "structure",
          ["dock-stage-2", "dock-stage-3"],
          "Condenser under construction and stabilized departure project.",
        ),
      },
      gameplayFrames: {
        sample: "mission-sample",
        cryovein: "mission-cryovein",
        cold: "cold-warning",
        vent: "ice-vent",
      },
      pendingBriefs: ["W02-S2"],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `W02 editable sources: ${frames.length} atlas frames and ${backgrounds.length} backgrounds.`,
);
