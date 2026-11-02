import type { Campaign } from "../model";
const body = new URL(
  "../../../assets/campaign/source/rig-body-0.svg",
  import.meta.url,
).href;
const cabin = new URL(
  "../../../assets/campaign/source/rig-cabin.svg",
  import.meta.url,
).href;
const drill = new URL(
  "../../../assets/campaign/source/rig-drill-idle.svg",
  import.meta.url,
).href;
const parts = {
  energy: [
    new URL("../../../assets/campaign/source/rig-energy-0.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/source/rig-energy-1.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/w02/rig-energy-2.svg", import.meta.url)
      .href,
  ],
  engine: [
    new URL("../../../assets/campaign/source/rig-engine-0.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/source/rig-engine-1.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/w02/rig-engine-2.svg", import.meta.url)
      .href,
  ],
  cargo: [
    new URL("../../../assets/campaign/source/rig-bay-0.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/source/rig-bay-1.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/w02/rig-bay-2.svg", import.meta.url).href,
  ],
  hull: [
    new URL("../../../assets/campaign/source/rig-hull-0.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/source/rig-hull-1.svg", import.meta.url)
      .href,
    new URL("../../../assets/campaign/w02/rig-hull-2.svg", import.meta.url)
      .href,
  ],
};
export function rigPreview(campaign: Campaign) {
  const layers = [
    body,
    parts.cargo[campaign.state.hardware.cargo],
    parts.energy[campaign.state.hardware.energy],
    parts.engine[campaign.state.hardware.engine],
    cabin,
    parts.hull[campaign.state.hardware.hull],
    drill,
  ];
  return `<article class="workshop-rig" aria-label="Your rig with its installed equipment"><div>${layers
    .filter(Boolean)
    .map((src) => `<img src="${src}" alt="">`)
    .join("")}</div><span>YOUR RIG</span></article>`;
}
