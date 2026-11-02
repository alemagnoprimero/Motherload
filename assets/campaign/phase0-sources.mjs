/** Shared original backdrop and material drawings for the readability pass.
 * Authoring only: the game loads the committed PNGs, never this module.
 */
const path = (d, fill, stroke = "none", width = 0) =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const circle = (x, y, r, fill) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;

// The transparent border is wider than the sampling footprint. Both axes wrap
// identically, without duplicating a planet or a painted gradient.
export function stars(comet = false) {
  let drawing = "";
  for (let i = 0; i < 88; i++) {
    const x = 8 + ((i * 193 + (comet ? 23 : 41)) % 1008);
    const y = 8 + ((i * 79 + (comet ? 31 : 29)) % 496);
    drawing += circle(
      x,
      y,
      i % 13 === 0 ? 1.6 : 0.8,
      i % 11 === 0 ? "#BAA683" : comet ? "#78A9B8" : "#7A969D",
    );
  }
  return `<g id="seamless-stars" data-layer="seamless-stars">${drawing}</g>`;
}

export function skyBody(comet = false) {
  if (comet)
    return (
      path("M250 20 Q164 39 58 152 Q156 111 250 126 Z", "#285D70") +
      path("M250 49 Q165 72 83 145 Q165 117 250 105 Z", "#3D7685") +
      circle(70, 166, 43, "#456F7D") +
      path(
        "M56 126 Q99 124 111 163 Q125 194 98 208 Q117 167 83 142 Z",
        "#7EAAA9",
      )
    );
  return (
    circle(128, 128, 83, "#3D5158") +
    path(
      "M114 47 Q185 46 208 101 Q228 154 193 188 Q222 128 181 85 Q156 60 114 47 Z",
      "#987E5B",
    ) +
    path(
      "M65 155 Q126 174 191 146 M58 131 Q119 149 202 124",
      "none",
      "#52656A",
      7,
    )
  );
}

// Seam endpoints have the same height and colour and a flat 16-pixel margin.
// Distinct peak layouts prevent the two parallax silhouettes from coinciding.
export function ridges(near, comet = false) {
  const points = near
    ? [
        [0, 286],
        [16, 286],
        [77, 257],
        [143, 180],
        [208, 249],
        [267, 218],
        [341, 143],
        [416, 234],
        [486, 187],
        [563, 244],
        [633, 171],
        [705, 227],
        [783, 133],
        [863, 222],
        [929, 242],
        [1008, 286],
        [1024, 286],
      ]
    : [
        [0, 310],
        [16, 310],
        [112, 270],
        [207, 287],
        [310, 242],
        [407, 275],
        [512, 259],
        [615, 294],
        [718, 244],
        [817, 272],
        [915, 268],
        [1008, 310],
        [1024, 310],
      ];
  if (comet)
    for (let i = 2; i < points.length - 2; i++) {
      points[i][0] += i % 2 === 0 ? 16 : -12;
      points[i][1] += [22, -16, 14, -25][i % 4];
    }
  const fill = comet
    ? near
      ? "#264F62"
      : "#2A4D60"
    : near
      ? "#293E48"
      : "#304753";
  const light = comet
    ? near
      ? "#477B8B"
      : "#3E6273"
    : near
      ? "#52636A"
      : "#415865";
  const line = `M${points.map(([x, y]) => `${x} ${y}`).join(" L")} V384 H0 Z`;
  let drawing =
    `<rect y="288" width="1024" height="96" fill="${fill}"/>` +
    path(line, fill);
  for (let i = 2; i < points.length - 2; i++) {
    const [x, y] = points[i],
      [previousX, previousY] = points[i - 1],
      [nextX, nextY] = points[i + 1];
    if (y >= previousY || y >= nextY) continue;
    drawing += path(
      `M${previousX} ${previousY} L${x} ${y} L${x + (nextX - x) * 0.36} ${Math.min(348, y + (near ? 110 : 60))} Z`,
      light,
    );
    if (near)
      drawing += path(
        `M${x} ${y} L${x + 14} ${Math.min(353, y + 126)} L${nextX} ${nextY}`,
        "none",
        comet ? "#1A394D" : "#1C303A",
        3,
      );
  }
  return `<g id="${near ? "near" : "far"}-continuous-ridge" data-layer="ridge">${drawing}</g>`;
}

export function bedrock(comet = false) {
  let drawing = `<rect width="96" height="96" fill="${comet ? "#172631" : "#1B2026"}"/>`;
  for (let i = -96; i <= 96; i += 19)
    drawing += path(
      `M${i} 0 L${i + 96} 96`,
      "none",
      comet ? "#405461" : "#48505B",
      4,
    );
  drawing += path("M0 48 H96 M48 0 V96", "none", "#101923", 3);
  return `<g id="bedrock-crosshatch" data-layer="bedrock">${drawing}</g>`;
}

export function materialRim(mask, material) {
  const bed = material === "bedrock";
  const hard = material === "stone" || material === "frozen-rock" || bed;
  const icy = material === "ice" || material === "frozen-rock";
  const hi = bed ? "#89949D" : hard ? "#8194A6" : icy ? "#B8E6EB" : "#B0B5AF";
  const shadow = icy ? "#102B3D" : "#14232B";
  let drawing = "";
  const edge = (d, inset) =>
    path(d, "none", hi, bed ? 5 : hard ? 4 : 5) +
    path(inset, "none", shadow, 3);
  if (mask & 1)
    drawing += edge(
      "M0 2 H19 L26 7 H49 L57 2 H79 L86 6 H96",
      "M0 9 H19 L26 14 H49 L57 9 H79 L86 13 H96",
    );
  if (mask & 2)
    drawing += edge(
      "M94 0 V22 L89 29 V52 L94 61 V79 L89 86 V96",
      "M87 0 V22 L82 29 V52 L87 61 V79 L82 86 V96",
    );
  if (mask & 4)
    drawing += edge(
      "M0 94 H19 L26 89 H49 L57 94 H79 L86 89 H96",
      "M0 87 H19 L26 82 H49 L57 87 H79 L86 82 H96",
    );
  if (mask & 8)
    drawing += edge(
      "M2 0 V22 L7 29 V52 L2 61 V79 L7 86 V96",
      "M9 0 V22 L14 29 V52 L9 61 V79 L14 86 V96",
    );
  return `<g id="${material}-exposed-rim" data-layer="exposed-rim">${drawing}</g>`;
}
