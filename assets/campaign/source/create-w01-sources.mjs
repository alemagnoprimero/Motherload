/** Original editable W01 drawings. Run explicitly to regenerate source SVGs. */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  stars,
  skyBody,
  ridges,
  bedrock,
  materialRim,
} from "../phase0-sources.mjs";

const source = new URL("./", import.meta.url);
const O = "#14232b",
  INK = "#111e26";
const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${title}</title><g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const path = (d, fill, stroke = O, width = 4, rest = "") =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" ${rest}/>`;
const rect = (x, y, w, h, fill, rx = 0, stroke = O, sw = 4) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const circle = (x, y, r, fill, stroke = O, sw = 4) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const layer = (name, body) =>
  `<g id="${name}" data-layer="${name}">${body}</g>`;
const frameList = [];
async function save(name, w, h, body, extra = {}) {
  await writeFile(new URL(`${name}.svg`, source), svg(w, h, body, name));
  frameList.push({
    name,
    width: w,
    height: h,
    logicalWidth: w / 2,
    logicalHeight: h / 2,
    ...extra,
  });
}

function soil(i, mask = 0) {
  const a = (i * 13) % 24,
    b = (i * 7) % 18;
  let s = layer("substrate", rect(0, 0, 96, 96, "#56616a", 0, "none", 0));
  s += layer(
    "broad-facets",
    path(
      `M0 ${20 + b} L${30 + a} 0 H96 V${35 + b} L${51 - a / 2} ${47 + b} Z`,
      "#687680",
      "none",
      0,
    ) +
      path(
        `M0 ${73 - b} L${44 + a / 2} ${53 + b} L96 ${71 - b} V96 H0 Z`,
        "#434f58",
        "none",
        0,
      ) +
      path(
        `M0 ${23 + b} L${34 + a} ${11 + b} L${63 - a / 2} ${34 + b} L96 ${27 + b}`,
        "none",
        "#79868d",
        3,
      ) +
      path(
        `M0 ${79 - b} L${31 + a / 2} ${66 - b} L${66 - a / 2} ${81 - b} L96 ${73 + b / 3}`,
        "none",
        "#303f49",
        4,
      ),
  );
  s += layer(
    "fractures",
    path(
      `M${13 + a / 2} 0 L${22 + a / 2} 15 L${16 + a / 2} 30 M${66 - a / 2} 96 L${57 - a / 2} 81 L${64 - a / 2} 68`,
      "none",
      "#35434d",
      2.5,
    ),
  );
  let e = "";
  if (mask & 1)
    e +=
      path("M0 2 H18 L25 7 H48 L54 2 H77 L84 6 H96", "none", "#b0b5af", 5) +
      path("M0 8 H17 L24 12 H49 L56 8 H78 L85 12 H96", "none", "#24343f", 3);
  if (mask & 2)
    e +=
      path("M94 0 V22 L89 28 V53 L94 61 V79 L90 85 V96", "none", "#89959a", 5) +
      path("M86 0 V23 L82 30 V53 L87 60 V79 L83 85 V96", "none", "#263944", 3);
  if (mask & 4)
    e += path(
      "M0 94 H15 L22 89 H46 L53 94 H75 L82 89 H96",
      "none",
      "#263742",
      6,
    );
  if (mask & 8)
    e +=
      path("M2 0 V19 L7 26 V48 L2 55 V76 L7 83 V96", "none", "#9da6a8", 4) +
      path("M10 0 V18 L15 25 V49 L10 57 V76 L15 83 V96", "none", "#293b45", 3);
  return s + layer("exposed-edges", e);
}
function stone(i) {
  const facets =
    path("M0 0 H96 V42 L65 34 L29 58 L0 39 Z", "#354252") +
    path("M0 39 L29 58 L65 34 L96 42 V96 H0 Z", "#253340") +
    path("M0 0 H50 L35 25 L29 58 L0 39 Z", "#435266") +
    path(
      "M35 25 L65 34 L96 12 M29 58 L45 96 M65 34 L74 70 L96 84",
      "none",
      "#192C3A",
      4,
    ) +
    path("M3 3 H45 L33 22 L28 51 M68 39 L78 68", "none", "#75899B", 2.5);
  return layer(
    "stone-body",
    rect(0, 0, 96, 96, "#2F3C4A", 0, "none", 0) +
      `<g transform="translate(48 48) rotate(${i * 90}) translate(-48 -48)">${facets}</g>`,
  );
}

function cracks(level) {
  let s = path(
    "M49 4 L42 26 L54 42 L38 61 L44 91 M54 42 L74 32 L90 38",
    "none",
    "#152630",
    level === 1 ? 3 : 5,
  );
  if (level > 1)
    s += path(
      "M38 61 L13 67 L5 81 M42 26 L19 15 L7 22 M54 42 L62 66 L88 80",
      "none",
      "#162731",
      4,
    );
  if (level > 2)
    s +=
      path(
        "M18 15 L15 43 L38 61 M62 66 L69 93 M74 32 L78 9",
        "none",
        "#c0c8c4",
        2,
      ) + path("M49 4 L42 26 L54 42 L38 61 L44 91", "none", "#cfbd94", 1.7);
  return layer("fracture-overlay", s);
}
const oreColours = [
  ["#d0d8d8", "#829ba5", "#eaf1eb"],
  ["#d79967", "#955b42", "#f4c397"],
  ["#d1e7e6", "#71a6b3", "#f5fff6"],
  ["#edb44d", "#a16b39", "#ffe5a0"],
];
function ore(i, pack = false) {
  const [hi, lo, lit] = oreColours[i];
  let p = "";
  if (i === 0)
    p =
      path(
        "M14 60 L22 38 L40 32 L49 42 L67 37 L84 57 L77 76 L49 82 L25 75 Z",
        lo,
      ) +
      path("M22 38 L40 32 L49 42 L42 59 L16 60 Z", hi) +
      path("M49 42 L67 37 L84 57 L61 64 L42 59 Z", lit) +
      path("M42 59 L61 64 L49 82 L25 75 L16 60 Z", hi) +
      path("M61 64 L84 57 L77 76 L49 82 Z", lo);
  if (i === 1)
    p =
      path("M15 66 L25 27 L44 18 L53 45 L67 29 L82 53 L77 76 L45 84 Z", lo) +
      path("M25 27 L44 18 L40 62 L15 66 Z", lit) +
      path("M44 18 L53 45 L45 84 L40 62 Z", hi) +
      path("M67 29 L82 53 L61 65 L53 45 Z", lit) +
      path("M61 65 L82 53 L77 76 L45 84 Z", hi);
  if (i === 2)
    p =
      path(
        "M11 72 L17 43 L32 34 L42 11 L56 25 L58 46 L76 35 L87 55 L78 78 L49 88 Z",
        lo,
      ) +
      path("M42 11 L56 25 L44 61 L32 34 Z", lit) +
      path("M32 34 L44 61 L49 88 L23 77 L17 43 Z", hi) +
      path("M56 25 L58 46 L44 61 Z", lo) +
      path("M76 35 L87 55 L60 74 L58 46 Z", lit) +
      path("M60 74 L87 55 L78 78 L49 88 Z", hi) +
      path("M17 43 L32 34 L23 77 L11 72 Z", lit);
  if (i === 3)
    p =
      path("M12 52 L27 22 L45 34 L61 17 L84 39 L79 76 L52 88 L25 79 Z", lo) +
      path("M27 22 L45 34 L33 53 L12 52 Z", lit) +
      path("M61 17 L84 39 L64 49 L45 34 Z", hi) +
      path("M12 52 L33 53 L39 73 L25 79 Z", hi) +
      path("M64 49 L84 39 L79 76 L61 68 Z", lit) +
      path("M25 79 L39 73 L61 68 L79 76 L52 88 Z", hi) +
      path("M33 53 L45 34 L64 49 L61 68 L39 73 Z", "#17232b", O, 3);
  let s = layer("mineral-facets", p);
  const notches = i + 1;
  for (let n = 0; n < notches; n++)
    s += rect(34 + n * 9, 87, 5, 4, "#e6d8b8", 1, "none", 0);
  if (pack)
    s =
      `<g transform="translate(13 10) scale(.74)">${s}</g>` +
      layer(
        "cargo-harness",
        path(
          "M16 55 L25 77 H72 L82 53 M25 77 V88 H73 V77 M35 80 V87 M62 80 V87",
          "none",
          "#b3c0bd",
          5,
        ) + rect(40, 73, 17, 13, "#f0a43c", 3, O, 3),
      );
  return s;
}
function body(frame) {
  let s = layer(
    "undercarriage",
    path("M23 79 L32 70 H94 L107 80 L102 97 H29 Z", "#344853", INK, 5),
  );
  s += layer("track", rect(21, 79, 85, 23, "#1c2c34", 11, INK, 5));
  for (const x of [34, 51, 68, 86, 96])
    s +=
      circle(x, 91, x === 34 || x === 96 ? 8 : 6, "#65767c", INK, 3) +
      circle(x, 91, 2, "#a9b4af", "none", 0);
  for (let j = 0; j < 11; j++) {
    const x = 25 + ((j * 7 + frame * 2) % 76);
    s += path(`M${x} 79 l3 4 M${x} 101 l3 -4`, "none", "#83908c", 2.5);
  }
  s += layer(
    "chassis",
    path("M25 75 L29 65 H96 L105 75 V82 H24 Z", "#d99538", INK, 5) +
      path("M29 65 H96 L105 75 H30 Z", "#f6c869", O, 2) +
      rect(31, 76, 17, 5, "#f7e0aa", 1, "none", 0),
  );
  return s;
}
function cabin() {
  return (
    layer(
      "cabin-shell",
      path(
        "M47 65 L48 40 Q50 29 65 29 H81 Q95 32 97 49 L98 69 H48 Z",
        "#e2b054",
        INK,
        5,
      ) +
        path(
          "M49 41 Q53 32 65 32 H80 Q90 34 93 42 L89 45 H53 Z",
          "#f5dc9e",
          "none",
          0,
        ) +
        path("M50 62 H97 V70 H48 Z", "#e68b35", O, 2),
    ) +
    layer(
      "dark-teal-glass",
      path(
        "M56 43 Q57 37 67 37 H79 Q87 38 89 47 L90 56 H55 Z",
        "#19404b",
        INK,
        4,
      ) +
        path("M59 42 H76 L64 52 H56 Z", "#79a5a8", "none", 0) +
        path("M79 39 L87 46 L89 53 H79 Z", "#315e68", "none", 0),
    ) +
    layer("identity-stripe", path("M49 59 H96 V64 H49 Z", "#f2f0ce", O, 1.5)) +
    layer(
      "roof-and-lamp",
      rect(58, 24, 22, 7, "#56656a", 2, INK, 3) +
        rect(93, 54, 12, 9, "#f6e1af", 3, INK, 3) +
        circle(100, 58, 2, "#fff6ca", "none", 0),
    )
  );
}
function engine(rank) {
  return layer(
    "rear-engine",
    rect(rank ? 22 : 25, 48, 22, 25, rank ? "#74868b" : "#48606b", 5, INK, 4) +
      rect(27, 51, 12, 5, "#a4bab7", 2, "none", 0) +
      path("M29 62 H39 M29 67 H39", "none", "#1f333e", 3) +
      (rank
        ? path("M21 51 L17 56 V69 H23 M36 47 V39 H43 V47", "none", "#d9c496", 4)
        : path("M36 47 V40 H42", "none", "#96a6a6", 3)),
  );
}
function energy(rank) {
  return layer(
    "energy-canister",
    rect(rank ? 13 : 17, 40, 14, 31, rank ? "#e8b660" : "#d27637", 5, INK, 4) +
      rect(rank ? 13 : 17, 50, 14, 5, "#b9c2b7", 0, INK, 2) +
      rect(rank ? 17 : 21, 35, 6, 6, "#a7b7b2", 2, INK, 2) +
      (rank ? path("M15 60 H26 M15 64 H26", "none", "#fcdf9e", 2) : ""),
  );
}
function bay(rank) {
  return layer(
    "rear-bay",
    path(
      rank ? "M22 52 H45 V75 H20 Z" : "M28 57 H46 V75 H26 Z",
      rank ? "#8c9b97" : "#596d73",
      O,
      4,
    ) +
      path(
        rank ? "M24 57 H42 M24 64 H42 M31 53 V75" : "M30 60 H42 M30 69 H42",
        "none",
        rank ? "#d5cba6" : "#afbcad",
        3,
      ),
  );
}
function hull(rank) {
  return layer(
    "armour",
    path(
      rank ? "M46 65 L55 61 H92 L102 66 V75 H45 Z" : "M47 66 H95 L101 72 H46 Z",
      rank ? "#d4d7bf" : "#b87b33",
      O,
      3,
    ) +
      (rank
        ? path("M53 68 H90 M57 72 H96", "none", "#f5efcb", 2)
        : path("M53 68 H88", "none", "#edbc65", 2)),
  );
}
function drill(frame, direction) {
  const p = frame % 4;
  let g = layer(
    "drill-mount",
    rect(91, 60, 11, 16, "#b8c4be", 3, INK, 3) +
      rect(97, 62, 9, 12, "#d78735", 2, INK, 2),
  );
  g += layer(
    "auger-flutes",
    path(`M104 57 L124 68 L104 79 Z`, "#8b9b9b", INK, 4) +
      path(
        `M106 59 L${110 + p} 65 L106 73 M${112 + p / 2} 63 L116 68 L112 75`,
        "none",
        "#e2e0ba",
        3,
      ) +
      path("M122 67 L124 68 L120 70", "none", "#fff0c7", 2),
  );
  if (direction === "down")
    return `<g transform="translate(132 0) rotate(90 0 0)">${g}</g>`;
  if (direction === "left")
    return `<g transform="translate(128 0) scale(-1 1)">${g}</g>`;
  return g;
}
function feet(deployed) {
  return layer(
    "anchoring-feet",
    deployed
      ? path("M35 71 L22 94 V108 H9 M88 72 L105 95 V108 H118", "none", INK, 9) +
          path(
            "M35 71 L22 94 V108 H9 M88 72 L105 95 V108 H118",
            "none",
            "#b7c0b0",
            5,
          ) +
          rect(7, 105, 22, 7, "#f0a43c", 2, INK, 3) +
          rect(100, 105, 21, 7, "#f0a43c", 2, INK, 3) +
          path(
            "M11 106 l4 5 M19 106 l4 5 M103 106 l4 5 M111 106 l4 5",
            "none",
            O,
            2,
          )
      : path("M34 70 L27 82 M89 70 L99 82", "none", INK, 9) +
          path("M34 70 L27 82 M89 70 L99 82", "none", "#b7c0b0", 4),
  );
}
function rack() {
  return layer(
    "cargo-rack",
    path("M17 45 H40 V75 H12 V54 Z", "#293e46", O, 4) +
      rect(15, 60, 9, 12, "#c1ba9c", 2, O, 2) +
      rect(26, 57, 10, 15, "#a7b9af", 2, O, 2) +
      path("M13 53 H39 M13 74 H40 M20 45 V75 M32 45 V75", "none", "#e0c78b", 3),
  );
}
function thrust(i) {
  const length = 12 + (i % 3) * 4;
  return layer(
    "jet-flame",
    path(
      `M38 95 L30 ${99 + length} L40 ${106 + length} L50 ${99 + length} L45 95 Z`,
      "#ce7b33",
      "none",
      0,
    ) +
      path(
        `M39 96 L35 ${99 + length} L40 ${103 + length} L46 ${98 + length} L44 96 Z`,
        "#f6e1af",
        "none",
        0,
      ) +
      path(
        `M80 95 L72 ${99 + length} L82 ${106 + length} L91 ${99 + length} L87 95 Z`,
        "#ce7b33",
        "none",
        0,
      ) +
      path(
        `M81 96 L77 ${99 + length} L82 ${103 + length} L87 ${98 + length} L86 96 Z`,
        "#f6e1af",
        "none",
        0,
      ),
  );
}
function mission(kind) {
  let p = "";
  if (kind === "beacon")
    return layer(
      "beacon",
      path("M48 17 V78 M32 80 H64", "none", O, 8) +
        path("M48 17 V78 M32 80 H64", "none", "#aabbb6", 4) +
        path("M49 22 H79 L71 34 H49 Z", "#f0a43c", O, 3) +
        circle(48, 15, 8, "#f6e1af", O, 3) +
        path("M24 11 Q15 18 24 27 M72 11 Q81 18 72 27", "none", "#9dbbad", 3),
    );
  if (kind === "valve")
    p =
      circle(48, 48, 22, "#d39545", O, 4) +
      circle(48, 48, 9, "#1d3b46", O, 4) +
      path(
        "M48 27 V39 M69 48 H57 M48 69 V57 M27 48 H39",
        "none",
        "#f5d79c",
        5,
      ) +
      rect(41, 70, 14, 9, "#a6b9b7", 2, O, 3);
  if (kind === "antenna")
    p =
      path(
        "M42 75 V39 L27 24 L31 18 L52 31 L67 17 L73 23 L58 40 V75 Z",
        "#b5c8c3",
        O,
        4,
      ) +
      circle(50, 38, 7, "#f0a43c", O, 3) +
      path("M23 42 Q11 24 22 13 M76 42 Q88 24 77 13", "none", "#7aafb5", 3);
  if (kind === "core")
    p =
      rect(25, 31, 47, 43, "#a9c4c0", 6, O, 4) +
      rect(32, 38, 32, 27, "#24434e", 4, O, 3) +
      path("M47 40 V62 M36 51 H59", "none", "#f6e1af", 5) +
      path("M34 30 V15 H42 M59 30 V9 H66", "none", "#d6b16a", 4) +
      rect(35, 69, 27, 8, "#e5963e", 1, O, 2);
  return (
    layer(
      "mission-frame",
      path(
        "M12 29 V13 H29 M67 13 H84 V29 M84 67 V84 H67",
        "none",
        "#f6e1af",
        4,
      ),
    ) + layer("mission-object", p)
  );
}
function relic() {
  return layer(
    "relic",
    path(
      "M48 10 L62 26 L84 29 L77 49 L82 69 L60 75 L45 88 L32 71 L11 64 L21 44 L20 24 L37 23",
      "none",
      "#d7bc83",
      7,
    ) +
      path("M38 23 L45 32 M61 75 L57 66", "none", "#f6e1af", 4) +
      path("M48 32 L65 44 L59 65 L39 66 L29 47 Z", "#f0a43c", O, 4) +
      path("M48 32 L48 52 L29 47 Z", "#ffe2a1", O, 2) +
      path("M48 52 L59 65 L39 66 Z", "#b1743b", O, 2),
  );
}
function shelfWarning() {
  return layer(
    "shelf-cue",
    path("M48 11 L87 78 Q89 84 82 84 H14 Q7 84 11 77 Z", "#f0a43c", O, 5) +
      path("M46 31 L50 49 L43 62 L51 73", "none", O, 6) +
      path("M23 63 H38 M58 63 H74", "none", O, 4),
  );
}

function lander(stage) {
  let s = layer(
    "landing-pad",
    path("M21 257 H363 L376 276 H8 Z", "#52616a", O, 6) +
      rect(23, 257, 340, 10, "#a2afa8", 2, O, 3) +
      path("M35 276 H352 M72 261 H123 M256 261 H309", "none", "#d5a650", 4),
  );
  if (stage === 0)
    return (
      s +
      layer(
        "planned-lander",
        path(
          "M104 253 L124 129 L152 86 H232 L260 129 L280 253 M126 127 H256 M142 177 H244 M163 87 V250 M222 87 V250",
          "none",
          "#607883",
          5,
          'stroke-dasharray="12 9"',
        ) +
          rect(145, 212, 94, 39, "#233a45", 4, "#728d94", 3) +
          path("M152 220 H231 M163 229 H220", "none", "#d7ad61", 4),
      )
    );
  s += layer(
    "lander-struts",
    path("M135 191 L97 250 H69 M249 191 L285 250 H315", "none", O, 17) +
      path(
        "M135 191 L97 250 H69 M249 191 L285 250 H315",
        "none",
        "#c4c8b1",
        10,
      ) +
      path("M125 220 L103 245 M259 220 L282 245", "none", "#d8993b", 5),
  );
  s += layer(
    "ship-shell",
    path(
      "M134 203 L135 119 Q143 87 163 71 H222 Q244 88 251 120 V203 L233 224 H152 Z",
      stage > 1 ? "#bfc9bd" : "#697d81",
      O,
      6,
    ) +
      path(
        "M139 127 L162 78 H218 L245 127 Z",
        stage > 1 ? "#e5dfbd" : "#a7b7ae",
        O,
        4,
      ) +
      path("M137 178 H250 V196 H137 Z", "#df8e38", O, 3) +
      path("M137 199 H250 V208 H137 Z", "#ead6a4", O, 2),
  );
  s += layer(
    "engine-pods",
    rect(112, 161, 31, 78, "#3b5360", 10, O, 5) +
      rect(241, 161, 31, 78, "#3b5360", 10, O, 5) +
      rect(110, 192, 35, 14, "#d79c49", 3, O, 3) +
      rect(239, 192, 35, 14, "#d79c49", 3, O, 3) +
      path("M115 235 H141 M244 235 H270", "none", "#b5c2b5", 5),
  );
  if (stage > 1)
    s += layer(
      "cabin-and-hatch",
      path(
        "M164 120 Q168 102 183 100 H209 Q222 108 224 125 V144 H163 Z",
        "#1d434e",
        O,
        5,
      ) +
        path("M169 119 L183 105 H204 L185 131 H168 Z", "#7faaa8", "none", 0) +
        rect(170, 156, 45, 61, "#203b46", 8, O, 4) +
        rect(180, 167, 25, 32, "#3b646b", 4, "#9eb8ae", 3) +
        circle(205, 207, 3, "#f0a43c", "none", 0),
    );
  if (stage > 2)
    s += layer(
      "flight-ready",
      path("M164 71 L174 36 H211 L221 71 Z", "#e2d8b2", O, 5) +
        rect(180, 31, 25, 8, "#72888a", 3, O, 3) +
        path("M117 155 V133 H133 M250 155 V132 H267", "none", "#b4c9c0", 5) +
        circle(126, 148, 6, "#f6e1af", O, 3) +
        circle(261, 148, 6, "#f6e1af", O, 3) +
        path("M153 244 H230", "none", "#69d6e8", 5),
    );
  return s;
}
function refuge(stage) {
  let s = layer(
    "refuge-base",
    path("M8 167 H280 L284 184 H4 Z", "#596a70", O, 5) +
      rect(21, 168, 245, 6, "#b6c1b1", 1, O, 2),
  );
  if (stage === 0)
    return (
      s +
      layer(
        "blueprint",
        path(
          "M41 165 V67 H240 V165 M74 165 V85 H129 V165 M144 85 H220 V134",
          "none",
          "#6e8791",
          4,
          'stroke-dasharray="10 7"',
        ),
      )
    );
  s += layer(
    "refuge-shell",
    rect(40, 73, 203, 94, "#9dada9", 6, O, 5) +
      path("M32 72 L53 46 H232 L252 72 Z", "#cf9d50", O, 5) +
      rect(55, 55, 175, 12, "#e9ce96", 3, "none", 0) +
      rect(59, 94, 58, 73, "#203b47", 5, O, 4) +
      rect(133, 91, 87, 37, "#26434d", 4, O, 4) +
      path("M142 100 H208", "none", "#8ebbb7", 5),
  );
  s += layer(
    "service-details",
    rect(136, 142, 37, 20, "#dca04a", 3, O, 3) +
      rect(185, 137, 24, 27, "#537c86", 4, O, 3) +
      circle(88, 87, 6, stage === 2 ? "#f6e1af" : "#b28247", O, 2),
  );
  if (stage === 2)
    s += layer(
      "commissioned",
      path("M23 73 V165 M259 73 V165", "none", "#b4c6bc", 8) +
        rect(14, 72, 18, 12, "#f6e1af", 3, O, 3) +
        rect(249, 72, 18, 12, "#f6e1af", 3, O, 3) +
        path("M65 136 H108 M65 144 H108", "none", "#f0a43c", 4),
    );
  return s;
}
function relay(stage) {
  let s = layer(
    "fixture-base",
    path("M26 166 H165 L178 183 H13 Z", "#52666d", O, 5),
  );
  if (stage === 0)
    return (
      s +
      layer(
        "blueprint",
        path(
          "M65 163 V47 H127 V163 M48 164 H146 M96 49 V19",
          "none",
          "#7a949c",
          4,
          'stroke-dasharray="9 7"',
        ),
      )
    );
  s += layer(
    "relay-frame",
    rect(67, 51, 59, 114, "#839d9e", 7, O, 5) +
      rect(76, 64, 40, 43, "#23434e", 4, O, 4) +
      path("M81 77 H110 M81 87 H104", "none", "#bcd4c7", 4) +
      path("M81 128 H110 M81 140 H110 M81 152 H110", "none", "#dca249", 4) +
      path("M96 49 V19 M74 20 H117", "none", "#b9c8b5", 6) +
      circle(96, 17, 8, stage === 2 ? "#f6e1af" : "#c08a42", O, 3),
  );
  if (stage === 2)
    s += layer(
      "relay-ready",
      path("M49 43 Q33 57 49 72 M143 43 Q159 57 143 72", "none", "#a9c9c1", 4) +
        path("M67 52 L50 95 V165 M125 52 L142 95 V165", "none", "#d3c7a2", 6),
    );
  return s;
}
function damage(level) {
  let s = path(
    "M54 69 l12 -3 l-4 7 M31 83 l6 3 M85 78 l10 -4",
    "none",
    "#384b51",
    3,
  );
  if (level > 1)
    s +=
      path(
        "M73 41 l-7 8 l5 5 M49 63 l6 9 l-8 4 M90 83 l8 4",
        "none",
        "#162932",
        3,
      ) + path("M27 58 l9 4 l-7 7", "none", "#e4d3aa", 2);
  if (level > 2)
    s +=
      path(
        "M44 75 l-5 7 H31 l-6 9 M92 67 l6 5 l-2 9 M56 43 l4 5 l-7 4",
        "none",
        "#111e26",
        4,
      ) + path("M87 68 l6 3 l-2 6", "none", "#e0b783", 2);
  return layer(`wear-${level}`, s);
}
function drillCollar(direction) {
  let s = layer(
    "rank-one-collar",
    rect(99, 55, 11, 25, "#e4ddbd", 3, INK, 3) +
      rect(98, 62, 13, 7, "#db933c", 2, O, 2) +
      path("M98 53 H111 M98 82 H111", "none", "#93b0af", 4) +
      circle(104, 59, 1.5, "#233e48", "none", 0) +
      circle(104, 76, 1.5, "#233e48", "none", 0),
  );
  if (direction === "down")
    s = `<g transform="translate(132 0) rotate(90 0 0)">${s}</g>`;
  if (direction === "left")
    s = `<g transform="translate(128 0) scale(-1 1)">${s}</g>`;
  return s;
}
function glyph(name) {
  const c =
    {
      energy: "#69d6e8",
      hull: "#ff8e7f",
      cargo: "#dfd6ba",
      warning: "#ffca6a",
    }[name] || "#c3d5d6";
  const drawings = {
    energy: path("M53 11 L23 51 H44 L36 85 L75 40 H53 Z", c, O, 4),
    hull:
      path("M48 12 L78 23 V47 Q76 70 48 84 Q20 70 18 47 V23 Z", "none", c, 7) +
      path("M35 47 l9 10 l20 -23", "none", c, 6),
    cargo: path(
      "M18 31 L48 17 L79 31 V69 L48 83 L18 69 Z M18 31 L48 46 L79 31 M48 46 V83",
      "none",
      c,
      6,
    ),
    depth: path(
      "M48 11 V67 M34 53 L48 68 L63 53 M18 82 H78 M21 22 H30 M21 40 H30 M21 58 H30",
      "none",
      c,
      6,
    ),
    mission: path(
      "M31 16 H15 V32 M65 16 H81 V32 M81 64 V80 H65 M48 30 V64 M33 47 H63",
      "none",
      c,
      6,
    ),
    relic:
      path(
        "M39 15 L22 23 L14 43 L22 70 L47 83 L74 69 L83 45 L72 22 L61 16",
        "none",
        c,
        7,
      ) + path("M48 33 L64 48 L48 65 L32 48 Z", c, O, 3),
    map:
      path("M26 72 L48 48 L70 72 M48 48 V24", "none", c, 6) +
      circle(48, 20, 9, c, O, 3) +
      circle(24, 75, 9, c, O, 3) +
      circle(72, 75, 9, c, O, 3),
    shop:
      path(
        "M16 39 L24 19 H72 L80 39 M22 40 V79 H74 V40 M40 79 V57 H57 V79 M16 40 H80",
        "none",
        c,
        6,
      ) + path("M34 21 L31 39 M62 21 L65 39", "none", c, 4),
    warning:
      path("M48 12 L83 78 H13 Z", "none", c, 6) +
      path("M48 34 V55", "none", c, 7) +
      circle(48, 67, 4, c, "none", 0),
    cooldown: path(
      "M74 24 A35 35 0 1 0 83 51 M74 24 V9 M74 24 H59 M48 27 V49 L61 57",
      "none",
      c,
      6,
    ),
  };
  return layer(`hud-${name}`, drawings[name]);
}

await mkdir(source, { recursive: true });
for (let i = 0; i < 8; i++) await save(`soil-${i}`, 96, 96, soil(i));
for (let i = 0; i < 16; i++)
  await save(`soil-edge-${i}`, 96, 96, i ? materialRim(i, "soil") : soil(0));
for (let i = 1; i < 16; i++) {
  await save(`stone-edge-${i}`, 96, 96, materialRim(i, "stone"));
  await save(`bedrock-edge-${i}`, 96, 96, materialRim(i, "bedrock"));
}
await save("bedrock-0", 96, 96, bedrock());
await save("sky-body", 256, 256, skyBody());
for (let i = 0; i < 4; i++) await save(`stone-${i}`, 96, 96, stone(i));
for (let i = 1; i <= 3; i++) await save(`crack-${i}`, 96, 96, cracks(i));
for (let i = 0; i < 4; i++) {
  await save(`ore-o${i + 1}`, 96, 96, ore(i));
  await save(`package-o${i + 1}`, 96, 96, ore(i, true));
}
for (let i = 0; i < 8; i++)
  await save(
    `rig-body-${i}`,
    128,
    128,
    `<g transform="translate(0 -5)">${body(i)}</g>`,
    { pivot: { x: 0.5, y: 0.5 } },
  );
await save("rig-cabin", 128, 128, cabin());
for (let i = 0; i < 2; i++) {
  await save(`rig-engine-${i}`, 128, 128, engine(i));
  await save(`rig-energy-${i}`, 128, 128, energy(i));
  await save(`rig-bay-${i}`, 128, 128, bay(i));
  await save(`rig-hull-${i}`, 128, 128, hull(i));
}
await save("rig-drill-idle", 128, 128, drill(0, "right"));
for (const d of ["right", "down", "left"])
  for (let i = 0; i < 8; i++)
    await save(`rig-drill-${d}-${i}`, 128, 128, drill(i, d));
await save("rig-feet-stowed", 128, 128, feet(false));
await save("rig-feet-deployed", 128, 128, feet(true));
await save("rig-rack", 128, 128, rack());
for (let i = 0; i < 6; i++) await save(`thrust-${i}`, 128, 128, thrust(i));
for (const k of ["beacon", "valve", "antenna", "core"])
  await save(`mission-${k}`, 96, 96, mission(k));
await save("relic", 96, 96, relic());
await save("warning-shelf", 96, 96, shelfWarning());
for (let i = 0; i < 4; i++)
  await save(`dock-stage-${i}`, 384, 288, lander(i), {
    pivot: { x: 0.5, y: 1 },
  });
for (let i = 0; i < 3; i++) {
  await save(`refuge-stage-${i}`, 288, 192, refuge(i), {
    pivot: { x: 0.5, y: 1 },
  });
  await save(`relay-stage-${i}`, 192, 192, relay(i), {
    pivot: { x: 0.5, y: 1 },
  });
}
const iconZoom = (drawing, x, y, scale) =>
  `<g transform="translate(64 64) scale(${scale}) translate(${-x} ${-y})">${drawing}</g>`;
const icons = {
  drill: iconZoom(drill(1, "right"), 107, 68, 2.6),
  energy: iconZoom(energy(1), 21, 54, 2.2),
  cargo: iconZoom(bay(1), 32, 64, 2.9),
  hull: iconZoom(hull(1), 75, 68, 1.5),
  engine: iconZoom(engine(1), 30, 57, 2.15),
  feet: iconZoom(feet(true), 64, 92, 0.87),
  rack: iconZoom(rack(), 26, 60, 2.5),
  core: iconZoom(mission("core"), 48, 48, 1.15),
};
for (const [name, drawing] of Object.entries(icons))
  await save(`icon-${name}`, 128, 128, drawing, { category: "icon" });
for (let i = 1; i <= 3; i++) await save(`rig-damage-${i}`, 128, 128, damage(i));
for (const direction of ["right", "down", "left"])
  await save(
    `rig-drill-collar-${direction}-1`,
    128,
    128,
    drillCollar(direction),
  );
await save(
  "world-w01",
  96,
  96,
  layer(
    "asteroid-icon",
    path(
      "M13 33 L32 12 L64 15 L84 40 L78 70 L52 87 L23 78 L10 58 Z",
      "#586b73",
      O,
      4,
    ) +
      path("M13 33 L32 12 L64 15 L49 44 L27 50 Z", "#b0bab2", O, 3) +
      path("M49 44 L84 40 L78 70 L52 87 L45 66 Z", "#344c57", O, 3) +
      path("M27 50 L45 66 L23 78 L10 58 Z", "#d69b49", O, 3),
  ),
  { category: "icon" },
);
for (const name of [
  "energy",
  "hull",
  "cargo",
  "depth",
  "mission",
  "relic",
  "map",
  "shop",
  "warning",
  "cooldown",
])
  await save(`ui-${name}`, 96, 96, glyph(name), { category: "glyph" });
const backgrounds = [
  { name: "w01-sky", width: 1024, height: 512, body: stars() },
  { name: "w01-ridge-far", width: 1024, height: 384, body: ridges(false) },
  { name: "w01-ridge-near", width: 1024, height: 384, body: ridges(true) },
];
for (const b of backgrounds)
  await writeFile(
    new URL(`${b.name}.svg`, source),
    svg(b.width, b.height, b.body, b.name),
  );
await writeFile(
  new URL("frames.json", source),
  JSON.stringify(
    {
      version: 1,
      tile: 48,
      authorScale: 2,
      rigPivot: [64, 64],
      rigTreadBaseline: 100,
      frames: frameList,
      backgrounds: backgrounds.map(({ body, ...record }) => record),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `W01 source: ${frameList.length} SVG frames and ${backgrounds.length} backgrounds in ${fileURLToPath(source)}`,
);
